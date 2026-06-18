import statistics
from collections import Counter
from datetime import UTC, datetime, timedelta

import httpx
from sqlmodel import select

from app.core.http import HEADERS as _HEADERS
from app.db.models import PriceCache

_OPEN_PRICES_URL = "https://prices.openfoodfacts.org/api/v1/prices"
_PRICE_CACHE_TTL_DAYS = 7


def _map_price_per(raw: str | None) -> str | None:
    """
    Map Open Prices price_per to our two-value enum: None or 'KILOGRAM'.
    Returns 'DISCARD' for unknown values.
    """
    if raw is None or raw == "UNIT":
        return None
    if raw == "KILOGRAM":
        return "KILOGRAM"
    return "DISCARD"


def _fetch_community_price_from_results(
    results: list[dict],
) -> tuple[float | None, str | None]:
    """
    Given Open Prices result dicts, return (median_amount, price_per).
    Filters to Spanish prices first; falls back to all results if none found.
    Returns (None, None) if no usable results.
    """
    def _usable(r: dict) -> tuple[float, str | None] | None:
        mapped = _map_price_per(r.get("price_per"))
        if mapped == "DISCARD":
            return None
        price = r.get("price")
        if price is None:
            return None
        return (float(price), mapped)

    spanish = [
        r for r in results if (r.get("location") or {}).get("osm_address_country_code") == "ES"
    ]
    candidates = spanish if spanish else results

    usable = [_usable(r) for r in candidates]
    usable = [u for u in usable if u is not None]
    if not usable:
        return None, None

    counter = Counter(pp for _, pp in usable)
    dominant_pp = counter.most_common(1)[0][0]
    prices = [amt for amt, pp in usable if pp == dominant_pp]
    return statistics.median(prices), dominant_pp


def get_community_price(ean: str, session) -> tuple[float | None, str | None]:
    """
    Return (amount, price_per) from cache or Open Prices API.
    Populates/refreshes the price_cache table as a side effect.
    Returns (None, None) on failure — never raises.
    """
    now = datetime.now(UTC).replace(tzinfo=None)
    ttl_cutoff = now - timedelta(days=_PRICE_CACHE_TTL_DAYS)

    cached = session.exec(select(PriceCache).where(PriceCache.ean == ean)).first()
    if cached and cached.fetched_at >= ttl_cutoff:
        # amount=None means we already checked and found nothing — negative cache hit
        return cached.amount, cached.price_per

    try:
        resp = httpx.get(
            _OPEN_PRICES_URL,
            params={"product_code": ean, "currency": "EUR", "page_size": 50},
            headers=_HEADERS,
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        if cached:
            return cached.amount, cached.price_per
        return None, None

    results = data.get("items") or []
    amount, price_per = _fetch_community_price_from_results(results)

    # Always upsert — amount=None acts as a negative cache entry so we don't
    # re-hit the API on every request for EANs with no Open Prices data.
    if cached:
        cached.amount = amount
        cached.price_per = price_per
        cached.fetched_at = now
        session.add(cached)
    else:
        session.add(PriceCache(ean=ean, amount=amount, price_per=price_per, fetched_at=now))
    session.commit()
    return amount, price_per
