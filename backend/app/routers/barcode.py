from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException, Path
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.core.http import HEADERS as _OFF_HEADERS
from app.db.models import BarcodeCache
from app.dependencies import CurrentSession, CurrentUser
from app.schemas.barcode import BarcodeRead
from app.services.community_price import get_community_price

router = APIRouter(tags=["barcode"])

_EAN_PATTERN = r"^\d{8}$|^\d{13}$"

# OFF sister sites tried in order; all share the same API contract.
_SISTER_SITES = [
    "https://es.openfoodfacts.org/api/v2/product/{ean}.json",
    "https://es.openbeautyfacts.org/api/v2/product/{ean}.json",
    "https://es.openproductsfacts.org/api/v2/product/{ean}.json",
    "https://es.openpetfoodfacts.org/api/v2/product/{ean}.json",
]


def _parse_stores(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def _to_read(
    entry: BarcodeCache,
    community_price: float | None = None,
    community_price_per: str | None = None,
) -> BarcodeRead:
    return BarcodeRead(
        ean=entry.ean,
        name=entry.name,
        brand=entry.brand,
        stores=_parse_stores(entry.stores),
        community_price=community_price,
        community_price_per=community_price_per,
    )


def _fetch_product(ean: str) -> tuple[str, str | None, str | None] | None:
    """Try each sister site in order; return (name, brand, stores) or None if not found anywhere."""
    for url_template in _SISTER_SITES:
        try:
            resp = httpx.get(url_template.format(ean=ean), headers=_OFF_HEADERS, timeout=5.0)
            data = resp.json()
        except Exception:
            continue  # unreachable site — skip and try next

        # OFF v3 returns status="success"/"failure"; older endpoints used status=1/0
        if data.get("status") not in (1, "success") or "product" not in data:
            continue  # not found on this site — try next

        product = data["product"]
        name = (
            product.get("product_name_es")
            or product.get("product_name")
            or product.get("generic_name_es")
            or product.get("generic_name")
            or ""
        )
        if not name:
            continue  # found but no usable name — try next

        brands_raw = product.get("brands") or ""
        brand = brands_raw.split(",")[0].strip() or None
        stores = product.get("stores") or None
        return name, brand, stores

    return None


@router.get("/barcode/{ean}", response_model=BarcodeRead)
def get_barcode(
    ean: Annotated[str, Path(pattern=_EAN_PATTERN)],
    current_user: CurrentUser,
    session: CurrentSession,
) -> BarcodeRead:
    # Cache lookup
    cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()
    if cached:
        community_price, community_price_per = get_community_price(ean, session)
        return _to_read(cached, community_price, community_price_per)

    result = _fetch_product(ean)
    if result is None:
        raise HTTPException(status_code=404, detail="Product not found")

    name, brand, stores = result
    entry = BarcodeCache(ean=ean, name=name, brand=brand, stores=stores)
    session.add(entry)
    try:
        session.commit()
    except IntegrityError:
        # Concurrent request already cached this EAN — use theirs
        session.rollback()
        cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()
        if cached:
            community_price, community_price_per = get_community_price(ean, session)
            return _to_read(cached, community_price, community_price_per)
        raise HTTPException(status_code=503, detail="Cache error") from None

    session.refresh(entry)
    community_price, community_price_per = get_community_price(ean, session)
    return _to_read(entry, community_price, community_price_per)
