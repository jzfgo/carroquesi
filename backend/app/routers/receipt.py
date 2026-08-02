from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlmodel import select

from app.db.models import List, ListItem, Purchase, ReceiptNameMapping, ReceiptScan
from app.dependencies import CurrentSession, MemberDep
from app.schemas.receipt import (
    ReceiptPriceApplyResult,
    ReceiptPriceBatch,
    ReceiptScanRequest,
    ReceiptScanResult,
)
from app.services import feature_flags
from app.services.client_day import resolve_timezone
from app.services.receipt_matcher import match_lines, normalise
from app.services.store_key import store_key
from app.services.store_registry import ensure_stores
from app.services.trips import open_trip_for

router = APIRouter(tags=["receipt"])

# Purchases are matched against a window centered on the receipt date, since
# items can be marked purchased a few days after the physical receipt date.
#
# Mirrored by RECEIPT_DATE_TOLERANCE_DAYS in frontend/src/lib/receiptDate.ts,
# which asks the user to confirm any scanned date this window would not cover.
# Widening one without the other lets a misread date through unquestioned.
RECEIPT_MATCH_WINDOW_DAYS = 3


def _parse_receipt_at(raw: str | None) -> datetime | None:
    """Parse a receipt date or instant into a naive UTC datetime.

    Accepts a bare date ("2026-04-11" -> midnight) or a full ISO 8601 instant
    ("2026-04-11T17:42:00Z"). `date.fromisoformat` rejects the latter, so this
    must use `datetime.fromisoformat`.
    """
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC)
    return dt.replace(tzinfo=None)


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

    # Consent is separate from the rollout flag, and the details differ so the
    # UI can tell "not available to you" from "you have not agreed yet". The
    # client-side Gemini parse is gated in the frontend on the same account
    # preference; what this check covers is the server side — matching against
    # purchase history and writing the scan record.
    if current_user.receipt_consent != "granted":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="receipt_consent_required",
        )

    # _parse_receipt_at normalises to naive UTC, so a receipt printed just
    # after local midnight can yield a UTC date one day earlier than the
    # wall-clock date. That skew is at most a few hours and is absorbed by
    # the +-3 day window below; don't narrow the window without accounting
    # for it.
    receipt_at = _parse_receipt_at(body.receipt_date)
    receipt_date = receipt_at.date() if receipt_at else None

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
        # Dedupe candidates by key so spelling variants of one shop still
        # infer; keep the first-seen raw form as the displayed value.
        stores: dict[str, str] = {}
        for m in matched:
            for item in purchased_items:
                if item.id == m.item_id and item.price_store:
                    stores.setdefault(store_key(item.price_store), item.price_store)
        if len(stores) == 1:
            store = next(iter(stores.values()))

    scan = ReceiptScan(
        list_id=list_id,
        scanned_by=current_user.id,
        store=store,
        receipt_at=receipt_at,
        receipt_total=body.receipt_total,
        parsed_lines=[line.model_dump() for line in body.lines],
        match_result=[m.model_dump() for m in matched],
        inference_source=body.inference_source,
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


@router.post("/lists/{list_id}/receipt-prices", response_model=ReceiptPriceApplyResult)
def apply_receipt_prices(
    list_id: str,
    body: ReceiptPriceBatch,
    request: Request,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user
    # Read raw rather than through the ClientTimezone dependency: a declared
    # Header would surface in the OpenAPI schema, and this endpoint's contract
    # does not change — the browser already sends the header on every request.
    client_tz = resolve_timezone(request.headers.get("x-client-timezone"))

    # Gate the apply step on the same flag as the scan step. The UI reaches
    # here only after a successful scan, so a flag-less user is already stopped
    # upstream — but this endpoint writes prices and creates impulse buys, and
    # must not be reachable by a direct call that skips the scan.
    if not feature_flags.is_enabled(current_user.id, "ai_receipt_scanning", session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ai_receipt_scanning feature not enabled",
        )

    # Same consent gate as the scan step, same reasoning as the flag gate
    # above: this endpoint writes prices and must not be reachable by a
    # direct call from a user who never agreed to receipt processing.
    if current_user.receipt_consent != "granted":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="receipt_consent_required",
        )

    now = datetime.now(UTC).replace(tzinfo=None)
    purchase_ts = _parse_receipt_at(body.receipt_date) or now
    updated = 0

    # Items a receipt marks purchased join the *current* open trip, even
    # though their purchased_at is backdated to the shopping trip: purchased
    # implies a trip, and guessing a past trip from a parsed date would be a
    # claim nobody made. Reconciliation re-files them later. Created lazily so
    # a price-only apply opens no trip.
    trip: Purchase | None = None

    def current_trip() -> Purchase:
        nonlocal trip
        if trip is None:
            trip = open_trip_for(session, list_id, now, client_tz)
        return trip

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
            item.purchase_id = current_trip().id
            # The unpurchase grace window keys off the write time. Without
            # this stamp, a backdated purchase could never be reverted, even
            # seconds after a wrong link. Price-only patches stay out: logging
            # a price must not reopen the window on a days-old purchase.
            item.updated_at = now
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
                purchase_id=current_trip().id,
            )
        )
        created += 1

    ensure_stores(
        session,
        list_id,
        [
            *(patch.store for patch in body.patches if patch.store),
            *(new.store for new in body.new_items if new.store),
        ],
    )

    for m in body.mappings:
        # Mapping rows are pure lookup keys, never displayed. Store them
        # key-normalised so the write and the read derive the same key —
        # raw strings from different sources almost never match exactly.
        m_store = store_key(m.store)
        m_receipt_name = normalise(m.receipt_name)
        stmt = select(ReceiptNameMapping).where(
            ReceiptNameMapping.store == m_store,
            ReceiptNameMapping.receipt_name == m_receipt_name,
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
                    store=m_store,
                    receipt_name=m_receipt_name,
                    item_name=m.item_name,
                    item_brand=m.item_brand,
                    confirmed_by=current_user.id,
                )
            )

    if body.scan_id:
        scan = session.get(ReceiptScan, body.scan_id)
        if scan:
            scan.items_updated = updated + created
            if trip is not None:
                # The one trip this apply filed lines onto. A price-only
                # apply opens no trip and leaves the link NULL — the scan
                # reconciled nothing.
                scan.purchase_id = trip.id
            session.add(scan)

    lst = session.get(List, list_id)
    if lst:
        lst.updated_at = now
        session.add(lst)

    session.commit()

    return {"items_updated": updated, "items_created": created}
