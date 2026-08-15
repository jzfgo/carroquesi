from datetime import UTC, datetime, time, tzinfo

from fastapi import APIRouter, HTTPException, Request, status
from sqlmodel import select

from app.db.models import List, ListItem, Purchase, ReceiptNameMapping, ReceiptScan, User
from app.dependencies import CurrentSession, MemberDep
from app.schemas.receipt import (
    ReceiptFileUrlResult,
    ReceiptPriceApplyResult,
    ReceiptPriceBatch,
    ReceiptScanRequest,
    ReceiptScanResult,
    ReceiptScanSummary,
    ReceiptUploadUrlRequest,
    ReceiptUploadUrlResult,
)
from app.services import feature_flags, receipt_storage, trips
from app.services.client_day import resolve_timezone
from app.services.receipt_matcher import match_lines, normalise
from app.services.store_key import store_key
from app.services.store_registry import ensure_stores
from app.services.trips import in_scope_predicate, open_trip_for

router = APIRouter(tags=["receipt"])


def _require_receipt_processing_allowed(session, current_user: User) -> None:
    """The gates in front of every endpoint that processes a receipt.

    The rollout flag answers first, then consent, with distinct details so
    the UI can tell "not available to you" from "you have not agreed yet".
    Consent is separate from the flag: the client-side Gemini parse is gated
    in the frontend on the same account preference; what the server-side
    check covers is everything these endpoints do with receipt data —
    matching, writing scan records, storing the original file.

    Reading what the household already stored is not gated here — viewing
    is not the processing act consent covers — so the download endpoints
    check membership only.
    """
    if not feature_flags.is_enabled(current_user.id, "ai_receipt_scanning", session):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ai_receipt_scanning feature not enabled",
        )
    if current_user.receipt_consent != "granted":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="receipt_consent_required",
        )


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


def _receipt_dating(
    receipt_at: datetime | None, now: datetime, tz: tzinfo
) -> tuple[datetime, datetime, datetime] | None:
    """Back-date the closed trip to the receipt's day, mapped in the client tz.

    Mirrors the manual close/purchase dating (routers/purchases.py): the day's
    local midnight opens the trip, its tear-off ends it, and closed_at is that
    tear-off but never past `now` (so a same-day close reads as closed rather
    than still-open). None when the receipt carried no date — the ticket then
    files under `now`.
    """
    if receipt_at is None:
        return None
    local_date = receipt_at.replace(tzinfo=UTC).astimezone(tz).date()
    opened = datetime.combine(local_date, time.min, tzinfo=tz).astimezone(UTC).replace(tzinfo=None)
    tears_off = trips.tears_off_at_for(opened, tz)
    return (opened, tears_off, min(tears_off, now))


def _resolve_target_purchase(session, list_id: str, purchase_id: str) -> Purchase:
    """The settled purchase a targeted scan names, or the error for naming it wrong.

    The open cart and unwritten proto-tickets belong to the ordinary scan flow;
    a targeted attach only completes a record someone already wrote down, so a
    still-open target answers 409 rather than being closed as a side effect.
    """
    trip = session.get(Purchase, purchase_id)
    if trip is None or trip.list_id != list_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
    if trip.closed_at is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="purchase_not_closed")
    return trip


@router.post("/lists/{list_id}/receipt", response_model=ReceiptScanResult)
def scan_receipt(
    list_id: str,
    body: ReceiptScanRequest,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user
    _require_receipt_processing_allowed(session, current_user)

    # A receipt records a shop as it closes it, so it matches against what is
    # still in play: pending items and whatever sits in the open cart. Items
    # already settled on a closed or torn-off trip are out of the pool — a
    # closed ticket is not re-priced by a later scan. The one exception is a
    # targeted scan, which names a settled purchase on purpose: its pool is
    # exactly that ticket's own lines. receipt_at is still parsed here so the
    # apply step can back-date the trip it closes.
    receipt_at = _parse_receipt_at(body.receipt_date)

    now = datetime.now(UTC).replace(tzinfo=None)
    if body.purchase_id is not None:
        target = _resolve_target_purchase(session, list_id, body.purchase_id)
        candidates = list(
            session.exec(
                select(ListItem)
                .where(ListItem.list_id == list_id, ListItem.purchase_id == target.id)
                .order_by(ListItem.updated_at.desc())
            ).all()
        )
    else:
        candidates = list(
            session.exec(
                select(ListItem)
                .outerjoin(Purchase, ListItem.purchase_id == Purchase.id)
                .where(ListItem.list_id == list_id, in_scope_predicate(now))
                # match_lines keeps the first candidate per normalised name, so the
                # order is the tiebreak: a pending list item — the likeliest target
                # for a printed line — wins over an open-cart one, recency breaking
                # ties within each group.
                .order_by(
                    ListItem.purchased_at.is_(None).desc(),
                    ListItem.updated_at.desc(),
                )
            ).all()
        )

    matched, unmatched = match_lines(body.lines, body.store, candidates, session)

    store = body.store
    if store is None and matched:
        # Dedupe candidates by key so spelling variants of one shop still
        # infer; keep the first-seen raw form as the displayed value.
        stores: dict[str, str] = {}
        for m in matched:
            for item in candidates:
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

    # Same gates as the scan step. The UI reaches here only after a
    # successful scan, so an ungated user is already stopped upstream — but
    # this endpoint writes prices and creates impulse buys, and must not be
    # reachable by a direct call that skips the scan.
    _require_receipt_processing_allowed(session, current_user)

    now = datetime.now(UTC).replace(tzinfo=None)
    receipt_at = _parse_receipt_at(body.receipt_date)
    purchase_ts = receipt_at or now

    # Targeted attach: the paper and its prices complete the named settled
    # purchase. Nothing below opens, closes, splits, or re-dates a trip then —
    # the record's dating is already written down and stays where it is.
    target: Purchase | None = None
    if body.purchase_id is not None:
        target = _resolve_target_purchase(session, list_id, body.purchase_id)

    # A receipt closes a trip. Matched/linked items (pending -> purchased) and
    # any impulse buys all settle onto the list's open cart, which this apply
    # then closes below, back-dated to the receipt's day. The cart is resolved
    # up front WITHOUT creating one, so an item already in it can be recognised;
    # settle_trip() only opens a new cart when something genuinely needs filing
    # (a pending item or an impulse buy). A body that settles nothing opens and
    # closes nothing.
    open_trip: Purchase | None = trips.find_open_trip(session, list_id, now)

    def settle_trip() -> Purchase:
        nonlocal open_trip
        if open_trip is None:
            open_trip = open_trip_for(session, list_id, now, client_tz)
        return open_trip

    # Ids of the items that will sit on the trip being closed: matched/linked
    # lines settled here, plus the impulse buys created below. close() claims
    # exactly these — anything else already in the cart splits off and stays
    # open.
    to_close: list[str] = []

    updated = 0
    for patch in body.patches:
        item = session.get(ListItem, patch.item_id)
        if not item or item.list_id != list_id:
            continue
        if target is not None and item.purchase_id != target.id:
            # A targeted apply re-prices only the named ticket's own lines.
            continue
        item.price = patch.price
        item.price_per = patch.price_per
        if patch.store:
            item.price_store = patch.store
        if patch.quantity is not None:
            item.purchased_quantity = patch.quantity  # actual receipt qty → new field
            # item.quantity (planned qty) is intentionally left untouched
        # In a targeted apply the line is already settled and takes its filled
        # or corrected price and nothing else: purchased_at, purchase_id, and
        # updated_at stay put — a stamped updated_at would reopen the
        # unpurchase grace window on a purchase that may be days old.
        if target is None and item.purchased_at is None:
            # A pending line the receipt confirms: mark it purchased, open the
            # cart if the shop had none, and file it onto the close. (A client
            # flag could rewrite a timestamp another member set, so the
            # transition is inferred from server state, not sent.)
            item.purchased_at = purchase_ts
            item.purchase_id = settle_trip().id
            # The unpurchase grace window keys off the write time; without this
            # stamp a backdated purchase could never be reverted.
            item.updated_at = now
            to_close.append(item.id)
        elif target is None and open_trip is not None and item.purchase_id == open_trip.id:
            # Already sitting in the open cart — settle it onto the same close.
            # An item already on a *closed* ticket (a stale client) still gets
            # its price, but is neither re-filed here nor pulled off its trip.
            to_close.append(item.id)
        session.add(item)
        updated += 1

    created = 0
    for new in body.new_items:
        line = ListItem(
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
            # A targeted line files onto the named ticket at its opening —
            # opened_at is the floor of its lines' purchased_at, and a
            # receipt-midnight timestamp could precede it. The fresh
            # updated_at default keeps the new line un-purchasable within
            # the grace window, like any other just-written record.
            purchased_at=target.opened_at if target is not None else purchase_ts,
            purchase_id=target.id if target is not None else settle_trip().id,
        )
        session.add(line)
        # Flush so the row has an id for close()'s selection below.
        session.flush()
        if target is None:
            to_close.append(line.id)
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

    # Close the trip: a receipt is the record of a finished shop, so its lines
    # settle onto a ticket rather than lingering in the open cart. A subset of
    # the cart splits onto its own ticket and leaves the rest open; a body with
    # nothing to settle closes nothing. A targeted apply queued nothing to
    # close — its lines already sit on the named ticket.
    closed_trip: Purchase | None = None
    if to_close:
        closed_trip = trips.close(
            session,
            list_id,
            to_close,
            body.store,
            body.receipt_total,
            now,
            purchase_id=settle_trip().id,
            dating=_receipt_dating(receipt_at, now, client_tz),
        )

    if target is not None and body.receipt_total is not None:
        # The paper's total fills or corrects the record's — but an unreadable
        # total never blanks a figure someone confirmed. The user reviewed the
        # change in the sheet, so this is not a silent overwrite.
        target.total = body.receipt_total
        session.add(target)

    if body.scan_id:
        scan = session.get(ReceiptScan, body.scan_id)
        if scan:
            scan.items_updated = updated + created
            if target is not None:
                # The settled purchase this scan was explicitly attached to.
                scan.purchase_id = target.id
            elif closed_trip is not None:
                # The trip this apply closed. A body that settled nothing (only
                # mappings) closes none and leaves the link NULL.
                scan.purchase_id = closed_trip.id
            session.add(scan)

    lst = session.get(List, list_id)
    if lst:
        lst.updated_at = now
        session.add(lst)

    session.commit()

    return {"items_updated": updated, "items_created": created}


@router.post(
    "/lists/{list_id}/receipts/{scan_id}/upload-url",
    response_model=ReceiptUploadUrlResult,
)
def create_receipt_upload_url(
    list_id: str,
    scan_id: str,
    body: ReceiptUploadUrlRequest,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    """Mint a signed PUT URL so the client can store the original receipt.

    Storing the file is part of processing the receipt, so the same flag and
    consent gates as the scan apply. The file's path is recorded now, at mint
    time: the bytes go straight to GCS, so the backend never learns whether
    the PUT finished. There is no confirm step — re-minting overwrites the
    same deterministic path, which both heals a failed upload and replaces a
    stored file idempotently.
    """
    _, current_user = list_and_user
    _require_receipt_processing_allowed(session, current_user)

    if not receipt_storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Receipt storage is not configured",
        )

    scan = session.get(ReceiptScan, scan_id)
    if scan is None or scan.list_id != list_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")

    if body.content_type not in receipt_storage.ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported receipt content type",
        )

    path, url = receipt_storage.generate_upload_url(
        list_id, scan_id, body.content_type, max_bytes=receipt_storage.MAX_RECEIPT_BYTES
    )
    scan.file_path = path
    scan.file_content_type = body.content_type
    # Pages only mean something for a PDF; an image's stays NULL even when a
    # client sends one.
    scan.file_pages = body.pages if body.content_type == "application/pdf" else None
    session.add(scan)
    session.commit()

    return ReceiptUploadUrlResult(
        upload_url=url,
        expires_in=int(receipt_storage.UPLOAD_URL_EXPIRY.total_seconds()),
    )


@router.get(
    "/lists/{list_id}/receipts/{scan_id}/file-url",
    response_model=ReceiptFileUrlResult,
)
def get_receipt_file_url(
    list_id: str,
    scan_id: str,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    """Mint a signed GET URL for a stored receipt file.

    Membership only — no flag, no consent. Consent gates the act of
    processing a receipt; viewing what the household already stored is not
    that act, and a member who declined consent may still need to check a
    price against the paper someone else scanned.
    """
    if not receipt_storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Receipt storage is not configured",
        )

    scan = session.get(ReceiptScan, scan_id)
    if scan is None or scan.list_id != list_id or scan.file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt file not found")

    return ReceiptFileUrlResult(
        url=receipt_storage.generate_download_url(scan.file_path),
        content_type=scan.file_content_type,
        pages=scan.file_pages,
    )


@router.get(
    "/lists/{list_id}/purchases/{purchase_id}/receipt-scans",
    response_model=list[ReceiptScanSummary],
)
def list_purchase_receipt_scans(
    list_id: str,
    purchase_id: str,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    """The scans that reconciled one trip, oldest first. Membership only."""
    lst, _ = list_and_user
    trip = session.get(Purchase, purchase_id)
    if trip is None or trip.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")

    scans = session.exec(
        select(ReceiptScan)
        .where(ReceiptScan.purchase_id == purchase_id)
        .order_by(ReceiptScan.created_at.asc())
    ).all()
    return [
        ReceiptScanSummary(
            id=scan.id,
            store=scan.store,
            receipt_at=scan.receipt_at,
            receipt_total=scan.receipt_total,
            has_file=scan.file_path is not None,
            file_pages=scan.file_pages,
            created_at=scan.created_at,
        )
        for scan in scans
    ]
