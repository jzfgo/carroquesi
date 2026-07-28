from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.db.models import List, ListItem, ReceiptNameMapping, ReceiptScan
from app.dependencies import CurrentSession, MemberDep
from app.schemas.receipt import (
    ReceiptPriceBatch,
    ReceiptScanRequest,
    ReceiptScanResult,
)
from app.services import feature_flags
from app.services.receipt_matcher import match_lines

router = APIRouter(tags=["receipt"])

# Purchases are matched against a window centered on the receipt date, since
# items can be marked purchased a few days after the physical receipt date.
#
# Mirrored by RECEIPT_DATE_TOLERANCE_DAYS in frontend/src/lib/receiptDate.ts,
# which asks the user to confirm any scanned date this window would not cover.
# Widening one without the other lets a misread date through unquestioned.
RECEIPT_MATCH_WINDOW_DAYS = 3


def _parse_iso(raw: str | None) -> datetime | None:
    """Parse a receipt date or instant, keeping whatever zone it was written in.

    Accepts a bare date ("2026-04-11" -> midnight), an offset-bearing instant
    ("2026-04-11T17:42:00+02:00") or a UTC one ("2026-04-11T17:42:00Z").
    `date.fromisoformat` rejects the last two, so this must use
    `datetime.fromisoformat`.
    """
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _parse_receipt_at(raw: str | None) -> datetime | None:
    """The instant the receipt names, as a naive UTC datetime.

    This is what gets stored, so it is normalised: `purchased_at` is a naive
    UTC column and the client renders it back by appending 'Z'.
    """
    dt = _parse_iso(raw)
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC)
    return dt.replace(tzinfo=None)


def _receipt_day(raw: str | None) -> date | None:
    """The calendar day the receipt was printed on, in the shopper's own zone.

    Deliberately read *before* any UTC conversion. A receipt printed at 00:30
    in Madrid is `2026-04-11T00:30:00+02:00` — the 11th to the person holding
    it, the 10th once flattened to UTC. Centring the match window on the 10th
    costs a day of tolerance on the side that matters: the window exists
    because items get marked purchased a few days *after* the receipt date, so
    a UTC reduction quietly turns +-3 days into [-4, +2] for every shopper
    east of Greenwich.

    We only get to do this because the client sends the offset (see
    frontend/src/lib/receiptDate.ts). Values without one — bare dates, older
    clients sending 'Z', instants already stored — keep their previous meaning:
    the day as written is the only day on offer.
    """
    dt = _parse_iso(raw)
    return dt.date() if dt else None


@router.post("/lists/{list_id}/receipt", response_model=ReceiptScanResult)
def scan_receipt(
    list_id: str,
    body: ReceiptScanRequest,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user

    if not feature_flags.is_enabled(current_user.id, "ai_receipt_scanning", session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ai_receipt_scanning feature not enabled",
        )

    # Two different facts, read from the same string on purpose: the instant
    # is what gets stored, the day is what the window is centred on, and for a
    # receipt printed near local midnight they fall on opposite sides of it.
    # See _receipt_day.
    #
    # The window is built from naive-UTC bounds around a *local* day, so it
    # still sits up to an offset out of true against `purchased_at`. That skew
    # is at most a few hours where the old one was a whole day; don't narrow
    # the window without accounting for it.
    receipt_at = _parse_receipt_at(body.receipt_date)
    receipt_date = _receipt_day(body.receipt_date)

    stmt = (
        select(ListItem)
        .where(
            ListItem.list_id == list_id,
            ListItem.purchased_at.isnot(None),
        )
        .order_by(ListItem.purchased_at.desc())
    )
    if receipt_date:
        window_start = datetime.combine(
            receipt_date - timedelta(days=RECEIPT_MATCH_WINDOW_DAYS), time.min
        )
        window_end = datetime.combine(
            receipt_date + timedelta(days=RECEIPT_MATCH_WINDOW_DAYS + 1), time.min
        )
        stmt = stmt.where(
            ListItem.purchased_at >= window_start,
            ListItem.purchased_at < window_end,
        )
    purchased_items = list(session.exec(stmt).all())
    if receipt_date:
        # Prefer the purchase closest to the receipt date over the most
        # recent one, so scanning an older receipt after a newer purchase of
        # the same item doesn't steal the match.
        purchased_items.sort(key=lambda item: abs(item.purchased_at.date() - receipt_date))

    matched, unmatched = match_lines(body.lines, body.store, purchased_items, session)

    store = body.store
    if store is None and matched:
        stores = {
            item.price_store
            for m in matched
            for item in purchased_items
            if item.id == m.item_id and item.price_store
        }
        if len(stores) == 1:
            store = stores.pop()

    scan = ReceiptScan(
        list_id=list_id,
        scanned_by=current_user.id,
        store=store,
        receipt_at=receipt_at,
        receipt_total=body.receipt_total,
        parsed_lines=[line.model_dump() for line in body.lines],
        match_result=[m.model_dump() for m in matched],
    )
    session.add(scan)
    session.commit()
    session.refresh(scan)

    return ReceiptScanResult(
        scan_id=scan.id,
        store=store,
        receipt_date=body.receipt_date,
        receipt_total=body.receipt_total,
        matched=matched,
        unmatched=unmatched,
    )


@router.post("/lists/{list_id}/receipt-prices")
def apply_receipt_prices(
    list_id: str,
    body: ReceiptPriceBatch,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user

    # Gate the apply step on the same flag as the scan step. The UI reaches
    # here only after a successful scan, so a flag-less user is already stopped
    # upstream — but this endpoint writes prices and creates impulse buys, and
    # must not be reachable by a direct call that skips the scan.
    if not feature_flags.is_enabled(current_user.id, "ai_receipt_scanning", session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ai_receipt_scanning feature not enabled",
        )

    now = datetime.now(UTC).replace(tzinfo=None)
    purchase_ts = _parse_receipt_at(body.receipt_date) or now
    updated = 0

    for patch in body.patches:
        item = session.get(ListItem, patch.item_id)
        if not item or item.list_id != list_id:
            continue
        item.price = patch.price
        item.price_per = patch.price_per
        if patch.store:
            item.price_store = patch.store
        if patch.quantity is not None:
            item.purchased_quantity = patch.quantity  # actual receipt qty → new field
            # item.quantity (planned qty) is intentionally left untouched
        # Infer the unpurchased -> purchased transition from server state. A
        # client-sent flag could rewrite a timestamp set by another member.
        if item.purchased_at is None:
            item.purchased_at = purchase_ts
        session.add(item)
        updated += 1

    created = 0
    for new in body.new_items:
        session.add(
            ListItem(
                list_id=list_id,
                added_by=current_user.id,
                name=new.name,
                brand=new.brand,
                ean=new.ean,
                stores=[new.store] if new.store else [],
                quantity=None,  # planned qty — an impulse buy was never planned
                purchased_quantity=new.quantity,
                price=new.price,
                price_per=new.price_per,
                price_store=new.store,
                purchased_at=purchase_ts,
            )
        )
        created += 1

    for m in body.mappings:
        stmt = select(ReceiptNameMapping).where(
            ReceiptNameMapping.store == m.store,
            ReceiptNameMapping.receipt_name == m.receipt_name,
        )
        existing = session.exec(stmt).first()
        if existing:
            existing.use_count += 1
            existing.item_name = m.item_name
            existing.item_brand = m.item_brand
            existing.confirmed_by = current_user.id
            existing.updated_at = now
            session.add(existing)
        else:
            session.add(
                ReceiptNameMapping(
                    store=m.store,
                    receipt_name=m.receipt_name,
                    item_name=m.item_name,
                    item_brand=m.item_brand,
                    confirmed_by=current_user.id,
                )
            )

    if body.scan_id:
        scan = session.get(ReceiptScan, body.scan_id)
        if scan:
            scan.items_updated = updated + created
            session.add(scan)

    lst = session.get(List, list_id)
    if lst:
        lst.updated_at = now
        session.add(lst)

    session.commit()

    return {"items_updated": updated, "items_created": created}
