from datetime import date, datetime, timezone
from typing import Optional

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

    stmt = select(ListItem).where(
        ListItem.list_id == list_id,
        ListItem.purchased_at.isnot(None),
    )
    purchased_items = list(session.exec(stmt).all())

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

    receipt_date: Optional[date] = None
    if body.receipt_date:
        try:
            receipt_date = date.fromisoformat(body.receipt_date)
        except ValueError:
            pass

    scan = ReceiptScan(
        list_id=list_id,
        scanned_by=current_user.id,
        store=store,
        receipt_date=receipt_date,
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
        if patch.quantity is not None:
            item.purchased_quantity = patch.quantity   # actual receipt qty → new field
            # item.quantity (planned qty) is intentionally left untouched
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
