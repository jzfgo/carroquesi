from datetime import UTC, datetime, time, timedelta

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
from app.services import feature_flags, receipt_storage
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


@router.post("/lists/{list_id}/receipt", response_model=ReceiptScanResult)
def scan_receipt(
    list_id: str,
    body: ReceiptScanRequest,
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user
    _require_receipt_processing_allowed(session, current_user)

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

    # Same gates as the scan step. The UI reaches here only after a
    # successful scan, so an ungated user is already stopped upstream — but
    # this endpoint writes prices and creates impulse buys, and must not be
    # reachable by a direct call that skips the scan.
    _require_receipt_processing_allowed(session, current_user)

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
