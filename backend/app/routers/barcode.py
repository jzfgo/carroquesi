import statistics
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import httpx
from fastapi import APIRouter, HTTPException, Path
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from app.db.models import BarcodeCache, PriceCache
from app.dependencies import CurrentSession, CurrentUser
from app.schemas.barcode import BarcodeRead

router = APIRouter(tags=["barcode"])

_EAN_PATTERN = r"^\d{8}$|^\d{13}$"
_OFF_HEADERS = {"User-Agent": "CarroQueSi/1.0 (javierzapata82@gmail.com)"}

# OFF sister sites tried in order; all share the same API contract.
_SISTER_SITES = [
    "https://es.openfoodfacts.org/api/v2/product/{ean}.json",
    "https://es.openbeautyfacts.org/api/v2/product/{ean}.json",
    "https://es.openproductsfacts.org/api/v2/product/{ean}.json",
    "https://es.openpetfoodfacts.org/api/v2/product/{ean}.json",
]

_OPEN_PRICES_URL = "https://prices.openfoodfacts.org/api/v1/prices"
_PRICE_CACHE_TTL_DAYS = 7


def _parse_stores(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def _to_read(entry: BarcodeCache, community_price: float | None = None, community_price_per: str | None = None) -> BarcodeRead:
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


def _map_price_per(raw: Optional[str]) -> Optional[str]:
    """Map Open Prices price_per to our two-value enum: None or 'KILOGRAM'. Returns 'DISCARD' for unknown values."""
    if raw is None or raw == "UNIT":
        return None
    if raw == "KILOGRAM":
        return "KILOGRAM"
    return "DISCARD"


def _fetch_community_price_from_results(
    results: list[dict],
) -> tuple[Optional[float], Optional[str]]:
    """
    Given Open Prices result dicts, return (median_amount, price_per).
    Filters to Spanish prices first; falls back to all results if none found.
    Returns (None, None) if no usable results.
    """
    def _usable(r: dict) -> Optional[tuple[float, Optional[str]]]:
        mapped = _map_price_per(r.get("price_per"))
        if mapped == "DISCARD":
            return None
        price = r.get("price")
        if price is None:
            return None
        return (float(price), mapped)

    spanish = [r for r in results if (r.get("location") or {}).get("osm_address_country_code") == "ES"]
    candidates = spanish if spanish else results

    usable = [_usable(r) for r in candidates]
    usable = [u for u in usable if u is not None]
    if not usable:
        return None, None

    # Group by price_per; take most common group
    counter = Counter(pp for _, pp in usable)
    dominant_pp = counter.most_common(1)[0][0]
    prices = [amt for amt, pp in usable if pp == dominant_pp]
    return statistics.median(prices), dominant_pp


def _get_community_price(ean: str, session) -> tuple[Optional[float], Optional[str]]:
    """
    Return (amount, price_per) from cache or Open Prices API.
    Returns (None, None) on failure — never raises.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    ttl_cutoff = now - timedelta(days=_PRICE_CACHE_TTL_DAYS)

    # Check cache
    cached = session.exec(select(PriceCache).where(PriceCache.ean == ean)).first()
    if cached and cached.fetched_at >= ttl_cutoff:
        return cached.amount, cached.price_per

    try:
        resp = httpx.get(
            _OPEN_PRICES_URL,
            params={"product_code": ean, "currency": "EUR", "page_size": 50},
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        # Open Prices unreachable — return cached data if stale, else None
        if cached:
            return cached.amount, cached.price_per
        return None, None

    results = data.get("results") or []
    amount, price_per = _fetch_community_price_from_results(results)
    if amount is None:
        return None, None

    # Upsert cache
    if cached:
        cached.amount = amount
        cached.price_per = price_per
        cached.fetched_at = now
        session.add(cached)
    else:
        session.add(PriceCache(ean=ean, amount=amount, price_per=price_per, fetched_at=now))
    session.commit()
    return amount, price_per


@router.get("/barcode/{ean}", response_model=BarcodeRead)
def get_barcode(
    ean: Annotated[str, Path(pattern=_EAN_PATTERN)],
    current_user: CurrentUser,
    session: CurrentSession,
) -> BarcodeRead:
    # Cache lookup
    cached = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()
    if cached:
        community_price, community_price_per = _get_community_price(ean, session)
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
            community_price, community_price_per = _get_community_price(ean, session)
            return _to_read(cached, community_price, community_price_per)
        raise HTTPException(status_code=503, detail="Cache error")

    session.refresh(entry)
    community_price, community_price_per = _get_community_price(ean, session)
    return _to_read(entry, community_price, community_price_per)
