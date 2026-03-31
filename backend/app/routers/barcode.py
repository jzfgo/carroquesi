from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Path
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.db.models import BarcodeCache
from app.dependencies import CurrentSession, CurrentUser
from app.schemas.barcode import BarcodeRead

router = APIRouter(tags=["barcode"])

_EAN_PATTERN = r"^\d{8}$|^\d{13}$"
_OFF_URL = "https://es.openfoodfacts.org/api/v3/product/{ean}.json"


def _parse_stores(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def _to_read(entry: BarcodeCache) -> BarcodeRead:
    return BarcodeRead(
        name=entry.name,
        brand=entry.brand,
        stores=_parse_stores(entry.stores),
    )


@router.get("/barcode/{ean}", response_model=BarcodeRead)
def get_barcode(
    ean: Annotated[str, Path(pattern=_EAN_PATTERN)],
    current_user: CurrentUser,
    session: CurrentSession,
) -> BarcodeRead:
    # Cache lookup
    cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()
    if cached:
        return _to_read(cached)

    # Call Open Food Facts
    try:
        resp = httpx.get(_OFF_URL.format(ean=ean), timeout=5.0)
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=503, detail="Could not reach Open Food Facts")

    if data.get("status") != 1 or "product" not in data:
        raise HTTPException(status_code=404, detail="Product not found")

    product = data["product"]
    name = (
        product.get("product_name_es")
        or product.get("product_name")
        or product.get("generic_name_es")
        or product.get("generic_name")
        or ""
    )
    if not name:
        raise HTTPException(status_code=404, detail="Product not found")

    brands_raw = product.get("brands") or ""
    brand = brands_raw.split(",")[0].strip() or None
    stores = product.get("stores") or None

    entry = BarcodeCache(ean=ean, name=name, brand=brand, stores=stores)
    session.add(entry)
    try:
        session.commit()
    except IntegrityError:
        # Concurrent request already cached this EAN — use theirs
        session.rollback()
        cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()
        if cached:
            return _to_read(cached)
        raise HTTPException(status_code=503, detail="Cache error")

    session.refresh(entry)
    return _to_read(entry)
