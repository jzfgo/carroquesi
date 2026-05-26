from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from sqlmodel import select

from app.db.models import List, ListItem, ReceiptNameMapping, ReceiptScan
from app.dependencies import CurrentSession, MemberDep
from app.schemas.receipt import ReceiptPriceBatch, ReceiptScanResult
from app.services.image_storage import store_image
from app.services.receipt_matcher import match_lines
from app.services.receipt_ocr import extract_text
from app.services.receipt_parser import parse_receipt

router = APIRouter(tags=["receipt"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/lists/{list_id}/receipt", response_model=ReceiptScanResult)
async def scan_receipt(
    list_id: str,
    image: UploadFile = File(...),
    session: CurrentSession = None,
    list_and_user: MemberDep = None,
):
    _, current_user = list_and_user

    image_bytes = await image.read()
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="Image too large (max 10 MB)")

    image_path: Optional[str] = store_image(image_bytes, current_user.id)

    ocr_text = extract_text(image_bytes)
    if not ocr_text.strip():
        raise HTTPException(status_code=422, detail="No se pudo leer el ticket")

    parsed = parse_receipt(ocr_text)

    stmt = select(ListItem).where(
        ListItem.list_id == list_id,
        ListItem.purchased_at.isnot(None),
    )
    purchased_items = list(session.exec(stmt).all())

    matched, unmatched = match_lines(parsed, purchased_items, session)

    scan = ReceiptScan(
        list_id=list_id,
        scanned_by=current_user.id,
        store=parsed.store,
        receipt_date=parsed.receipt_date,
        receipt_total=parsed.receipt_total,
        image_path=image_path,
        ocr_raw={"text": ocr_text},
        parsed_lines=[
            {"name": l.name, "price": l.price, "price_per": l.price_per}
            for l in parsed.lines
        ],
        match_result=[
            {"receipt_name": m.receipt_name, "matched_item_id": m.item_id, "confidence": 100}
            for m in matched
        ],
    )
    session.add(scan)
    session.commit()
    session.refresh(scan)

    receipt_date_str = parsed.receipt_date.isoformat() if parsed.receipt_date else None

    return ReceiptScanResult(
        scan_id=scan.id,
        store=parsed.store,
        receipt_date=receipt_date_str,
        receipt_total=parsed.receipt_total,
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
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    updated = 0

    for patch in body.patches:
        item = session.get(ListItem, patch.item_id)
        if not item or item.list_id != list_id:
            continue
        item.price = patch.price
        item.price_per = patch.price_per
        if patch.store:
            item.price_store = patch.store
        session.add(item)
        updated += 1

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
            scan.items_updated = updated
            session.add(scan)

    lst = session.get(List, list_id)
    if lst:
        lst.updated_at = now
        session.add(lst)

    session.commit()

    return {"items_updated": updated}
