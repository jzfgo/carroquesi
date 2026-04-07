# Price Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Open Prices API community price lookups and private user price recording into CarroQueSí.

**Architecture:** Two new DB tables (`price_cache`, `price_records`) and a new `ean` column on `list_items`. The backend extends the barcode endpoint to fetch/cache community prices, and adds a new `/prices` router. The frontend gains `LogPriceSheet`, `PriceHistorySheet`, and `PurchaseToast` components, plus price tags on `ItemCard`.

**Tech Stack:** Python/FastAPI/SQLModel/Alembic (backend), React/TypeScript/Vite (frontend), Open Prices API (read-only, no auth).

---

## File Map

**Backend — create:**
- `backend/app/schemas/prices.py` — Pydantic schemas for price endpoints
- `backend/app/routers/prices.py` — GET/POST price history endpoints
- `backend/alembic/versions/e5f6a7b8c9d0_add_price_tables.py` — migration

**Backend — modify:**
- `backend/app/db/models.py` — add `ean` to `ListItem`, add `PriceCache` and `PriceRecord` models
- `backend/app/schemas/items.py` — add `ean` to `ItemCreate` / `ItemRead`
- `backend/app/schemas/barcode.py` — add `ean`, `community_price`, `community_price_per` to `BarcodeRead`
- `backend/app/routers/barcode.py` — fetch/cache community price from Open Prices
- `backend/app/routers/items.py` — persist `ean` on item create
- `backend/app/main.py` — register prices router
- `backend/tests/conftest.py` — include prices router in test client

**Frontend — create:**
- `frontend/src/components/LogPriceSheet.tsx` + `LogPriceSheet.css`
- `frontend/src/components/PriceHistorySheet.tsx` + `PriceHistorySheet.css`
- `frontend/src/components/PurchaseToast.tsx` + `PurchaseToast.css`

**Frontend — modify:**
- `frontend/src/types.ts` — add `ean` to `ListItem`, update `BarcodeRead`, add price types
- `frontend/src/lib/api.ts` — add `getPriceHistory`, `logPrice`
- `frontend/src/components/BarcodeScanSheet.tsx` + `BarcodeScanSheet.css` — community price row
- `frontend/src/components/ItemCard.tsx` + `ItemCard.css` — price tag + CTA
- `frontend/src/components/ItemList.tsx` — thread price props
- `frontend/src/components/ListScreen.tsx` — orchestrate sheets + toast
- `frontend/src/hooks/useListItems.test.tsx` — add `ean: null` to fixture

---

## Task 1: DB Models

**Files:**
- Modify: `backend/app/db/models.py`

- [ ] **Step 1: Read current models.py to understand existing patterns**

```bash
cat backend/app/db/models.py
```

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_models.py  (new file)
from app.db.models import PriceCache, PriceRecord, ListItem
import inspect

def test_listitem_has_ean():
    fields = ListItem.model_fields
    assert "ean" in fields
    assert fields["ean"].default is None

def test_price_cache_fields():
    fields = PriceCache.model_fields
    assert "ean" in fields
    assert "amount" in fields
    assert "price_per" in fields
    assert "fetched_at" in fields

def test_price_record_fields():
    fields = PriceRecord.model_fields
    for f in ("list_item_id", "ean", "amount", "price_per", "store", "user_id", "recorded_at"):
        assert f in PriceRecord.model_fields
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_models.py -v
```
Expected: FAIL — `PriceCache`, `PriceRecord` not importable; `ListItem` has no `ean`.

- [ ] **Step 4: Add models to models.py**

In `backend/app/db/models.py`, after the existing `BarcodeCache` model, add:

```python
class ListItem(SQLModel, table=True):
    # ... (keep all existing fields, add ean after existing fields)
    ean: Optional[str] = Field(default=None)
    # keep purchased_at and other existing fields unchanged
```

Also add at the bottom of the file:

```python
class PriceCache(SQLModel, table=True):
    __tablename__ = "price_cache"
    id: str = Field(default_factory=_uuid, primary_key=True)
    ean: str = Field(unique=True, index=True)
    amount: float
    price_per: Optional[str] = Field(default=None)  # None=unit, "KILOGRAM"=per kg
    fetched_at: datetime = Field(default_factory=_now)


class PriceRecord(SQLModel, table=True):
    __tablename__ = "price_records"
    id: str = Field(default_factory=_uuid, primary_key=True)
    list_item_id: str = Field(foreign_key="list_items.id")
    ean: Optional[str] = Field(default=None)
    amount: float
    price_per: Optional[str] = Field(default=None)
    store: Optional[str] = Field(default=None)
    user_id: str = Field(foreign_key="users.id")
    recorded_at: datetime = Field(default_factory=_now)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && uv run pytest tests/test_models.py -v
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/db/models.py tests/test_models.py
git commit -m "feat: add PriceCache, PriceRecord models and ean to ListItem"
```

---

## Task 2: Migration

**Files:**
- Create: `backend/alembic/versions/e5f6a7b8c9d0_add_price_tables.py`

- [ ] **Step 1: Generate migration**

```bash
cd backend && uv run alembic revision --autogenerate -m "add price tables and ean to list_items"
```

- [ ] **Step 2: Check the generated migration**

Open the newly created file in `backend/alembic/versions/`. Verify it:
- Adds column `ean VARCHAR` (nullable) to `list_items`
- Creates `price_cache` table with columns: `id`, `ean` (unique), `amount`, `price_per`, `fetched_at`
- Creates `price_records` table with columns: `id`, `list_item_id` (FK), `ean`, `amount`, `price_per`, `store`, `user_id` (FK), `recorded_at`

If autogenerate missed anything, add it manually.

- [ ] **Step 3: Apply migration against dev DB**

```bash
cd backend && uv run alembic upgrade head
```
Expected: Upgrade completes with no errors.

- [ ] **Step 4: Commit**

```bash
cd backend && git add alembic/versions/
git commit -m "feat: migration for price tables and list_items.ean"
```

---

## Task 3: Items Schema & Router — EAN Support

**Files:**
- Modify: `backend/app/schemas/items.py`
- Modify: `backend/app/routers/items.py`

- [ ] **Step 1: Write the failing test**

```python
# Add to backend/tests/test_items.py (or create if absent)
def test_create_item_with_ean(client, auth_headers, test_list):
    resp = client.post(
        f"/lists/{test_list['id']}/items",
        json={"name": "Leche", "ean": "8410188082498"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ean"] == "8410188082498"

def test_create_item_without_ean(client, auth_headers, test_list):
    resp = client.post(
        f"/lists/{test_list['id']}/items",
        json={"name": "Pan"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["ean"] is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_items.py::test_create_item_with_ean tests/test_items.py::test_create_item_without_ean -v
```
Expected: FAIL — `ean` not in request/response schemas.

- [ ] **Step 3: Update schemas/items.py**

In `ItemCreate`, add:
```python
ean: str | None = None
```

In `ItemRead`, add:
```python
ean: str | None
```

- [ ] **Step 4: Update routers/items.py create endpoint**

Find the item creation logic (the POST endpoint). After building the `ListItem` from the request, add:
```python
db_item.ean = item_in.ean
```
(or pass `ean=item_in.ean` in the constructor if using keyword args).

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && uv run pytest tests/test_items.py::test_create_item_with_ean tests/test_items.py::test_create_item_without_ean -v
```
Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
cd backend && uv run pytest
```
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/schemas/items.py app/routers/items.py tests/test_items.py
git commit -m "feat: add ean field to item create/read schemas and router"
```

---

## Task 4: Barcode Community Price

**Files:**
- Modify: `backend/app/schemas/barcode.py`
- Modify: `backend/app/routers/barcode.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_barcode.py — add/extend these tests
from unittest.mock import patch, MagicMock

def test_barcode_response_includes_community_price_fields(client, auth_headers):
    """community_price and community_price_per are present even when null."""
    ean = "8410188082498"
    with patch("app.routers.barcode._fetch_community_price", return_value=(None, None)):
        resp = client.get(f"/barcode/{ean}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "ean" in data
    assert "community_price" in data
    assert "community_price_per" in data

def test_barcode_response_includes_ean(client, auth_headers):
    ean = "8410188082498"
    with patch("app.routers.barcode._fetch_community_price", return_value=(None, None)):
        resp = client.get(f"/barcode/{ean}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["ean"] == ean

def test_fetch_community_price_spanish_first():
    """_fetch_community_price filters Spanish prices and returns median."""
    from app.routers.barcode import _fetch_community_price_from_results
    results = [
        {"price": 1.0, "price_per": None, "location": {"osm_address_country_code": "ES"}},
        {"price": 2.0, "price_per": None, "location": {"osm_address_country_code": "ES"}},
        {"price": 10.0, "price_per": None, "location": {"osm_address_country_code": "FR"}},
    ]
    amount, price_per = _fetch_community_price_from_results(results)
    assert amount == 1.5
    assert price_per is None

def test_fetch_community_price_fallback_to_eur():
    """Falls back to all EUR when no Spanish results."""
    from app.routers.barcode import _fetch_community_price_from_results
    results = [
        {"price": 3.0, "price_per": "UNIT", "location": {"osm_address_country_code": "FR"}},
        {"price": 5.0, "price_per": "UNIT", "location": {"osm_address_country_code": "DE"}},
    ]
    amount, price_per = _fetch_community_price_from_results(results)
    assert amount == 4.0
    assert price_per is None  # UNIT maps to None

def test_fetch_community_price_kilogram():
    from app.routers.barcode import _fetch_community_price_from_results
    results = [
        {"price": 3.0, "price_per": "KILOGRAM", "location": {"osm_address_country_code": "ES"}},
        {"price": 4.0, "price_per": "KILOGRAM", "location": {"osm_address_country_code": "ES"}},
    ]
    amount, price_per = _fetch_community_price_from_results(results)
    assert amount == 3.5
    assert price_per == "KILOGRAM"

def test_fetch_community_price_discards_unknown_price_per():
    from app.routers.barcode import _fetch_community_price_from_results
    results = [
        {"price": 1.0, "price_per": "LITER", "location": {"osm_address_country_code": "ES"}},
    ]
    amount, price_per = _fetch_community_price_from_results(results)
    assert amount is None
    assert price_per is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_barcode.py -v -k "community_price or fetch_community"
```
Expected: FAIL

- [ ] **Step 3: Update schemas/barcode.py**

Replace the `BarcodeRead` class so it includes:
```python
class BarcodeRead(BaseModel):
    ean: str
    name: str
    brand: str | None
    stores: list[str]
    community_price: float | None = None
    community_price_per: str | None = None  # None = per unit, "KILOGRAM" = per kg
```

- [ ] **Step 4: Rewrite routers/barcode.py**

Replace the full file content with:

```python
import statistics
from collections import Counter
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from app.db.session import get_session
from app.db.models import BarcodeCache, PriceCache
from app.dependencies import get_current_user
from app.schemas.barcode import BarcodeRead
from datetime import datetime, timedelta, timezone

router = APIRouter()

OPEN_PRICES_URL = "https://prices.openfoodfacts.org/api/v1/prices"
CACHE_TTL_DAYS = 7
_OPENFOODFACTS_URLS = [
    "https://world.openfoodfacts.org/api/v2/product/{ean}.json",
    "https://world.openbeautyfacts.org/api/v2/product/{ean}.json",
    "https://world.openpetfoodfacts.org/api/v2/product/{ean}.json",
]


def _map_price_per(raw: Optional[str]) -> Optional[str]:
    """Map Open Prices price_per to our two-value enum: None or 'KILOGRAM'."""
    if raw is None or raw == "UNIT":
        return None
    if raw == "KILOGRAM":
        return "KILOGRAM"
    return "DISCARD"


def _fetch_community_price_from_results(
    results: list[dict],
) -> tuple[Optional[float], Optional[str]]:
    """
    Given a list of Open Prices result dicts, return (median_amount, price_per).
    Filters Spanish prices first; falls back to all if none found.
    Returns (None, None) if no usable results.
    """
    def _usable(r: dict) -> tuple[float, Optional[str]]:
        mapped = _map_price_per(r.get("price_per"))
        if mapped == "DISCARD":
            return None
        return (r["price"], mapped)

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


async def _fetch_community_price(ean: str, session: Session) -> tuple[Optional[float], Optional[str]]:
    """
    Return (amount, price_per) for EAN from cache or Open Prices API.
    Returns (None, None) on failure — never raises.
    """
    now = datetime.now(timezone.utc)

    # Check cache
    cached = session.exec(select(PriceCache).where(PriceCache.ean == ean)).first()
    if cached:
        age = now - cached.fetched_at.replace(tzinfo=timezone.utc) if cached.fetched_at.tzinfo is None else now - cached.fetched_at
        if age.days < CACHE_TTL_DAYS:
            return cached.amount, cached.price_per

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                OPEN_PRICES_URL,
                params={"product_code": ean, "currency": "EUR", "page_size": 50},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:
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


async def _lookup_product(ean: str) -> Optional[tuple[str, Optional[str], list[str]]]:
    """Try each Open Food Facts mirror; return (name, brand, stores) or None."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        for url_tpl in _OPENFOODFACTS_URLS:
            url = url_tpl.format(ean=ean)
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    continue
                data = resp.json()
                if data.get("status") != 1:
                    continue
                product = data["product"]
                name = product.get("product_name") or product.get("product_name_en") or ""
                if not name:
                    continue
                brand = product.get("brands") or None
                stores_raw = product.get("stores") or ""
                stores = [s.strip() for s in stores_raw.split(",") if s.strip()]
                return name, brand, stores
            except Exception:
                continue
    return None


@router.get("/barcode/{ean}", response_model=BarcodeRead)
async def get_barcode(
    ean: str,
    session: Session = Depends(get_session),
    current_user=Depends(get_current_user),
):
    # Check local barcode cache
    cached_barcode = session.exec(select(BarcodeCache).where(BarcodeCache.ean == ean)).first()

    if cached_barcode:
        name, brand = cached_barcode.name, cached_barcode.brand
        stores = [s.strip() for s in (cached_barcode.stores or "").split(",") if s.strip()]
    else:
        result = await _lookup_product(ean)
        if result is None:
            raise HTTPException(status_code=404, detail="Product not found")
        name, brand, stores = result
        session.add(BarcodeCache(ean=ean, name=name, brand=brand, stores=",".join(stores)))
        session.commit()

    community_price, community_price_per = await _fetch_community_price(ean, session)

    return BarcodeRead(
        ean=ean,
        name=name,
        brand=brand,
        stores=stores,
        community_price=community_price,
        community_price_per=community_price_per,
    )
```

- [ ] **Step 5: Run tests**

```bash
cd backend && uv run pytest tests/test_barcode.py -v
```
Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
cd backend && uv run pytest
```
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
cd backend && git add app/schemas/barcode.py app/routers/barcode.py tests/test_barcode.py
git commit -m "feat: extend barcode endpoint with community price from Open Prices"
```

---

## Task 5: Prices Schemas

**Files:**
- Create: `backend/app/schemas/prices.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_prices_schemas.py
from app.schemas.prices import PriceCreate, PriceRecordRead, PriceHistoryResponse, StoreGroup
from datetime import datetime

def test_price_create_valid():
    p = PriceCreate(amount=1.99, price_per=None, store="Mercadona")
    assert p.amount == 1.99
    assert p.price_per is None
    assert p.store == "Mercadona"

def test_price_create_kilogram():
    p = PriceCreate(amount=3.20, price_per="KILOGRAM", store=None)
    assert p.price_per == "KILOGRAM"

def test_price_history_response_structure():
    record = PriceRecordRead(
        id="abc",
        list_item_id="item1",
        ean="123",
        amount=1.99,
        price_per=None,
        store="Mercadona",
        user_id="user1",
        recorded_at=datetime.now(),
    )
    group = StoreGroup(store="Mercadona", records=[record])
    resp = PriceHistoryResponse(
        groups=[group],
        community_price=1.85,
        community_price_per=None,
    )
    assert len(resp.groups) == 1
    assert resp.community_price == 1.85
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && uv run pytest tests/test_prices_schemas.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create schemas/prices.py**

```python
# backend/app/schemas/prices.py
from datetime import datetime
from pydantic import BaseModel


class PriceCreate(BaseModel):
    amount: float
    price_per: str | None = None  # None = per unit, "KILOGRAM" = per kg
    store: str | None = None


class PriceRecordRead(BaseModel):
    id: str
    list_item_id: str
    ean: str | None
    amount: float
    price_per: str | None
    store: str | None
    user_id: str
    recorded_at: datetime


class StoreGroup(BaseModel):
    store: str | None
    records: list[PriceRecordRead]


class PriceHistoryResponse(BaseModel):
    groups: list[StoreGroup]
    community_price: float | None = None
    community_price_per: str | None = None
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && uv run pytest tests/test_prices_schemas.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/schemas/prices.py tests/test_prices_schemas.py
git commit -m "feat: add prices schemas (PriceCreate, PriceRecordRead, PriceHistoryResponse)"
```

---

## Task 6: Prices Router

**Files:**
- Create: `backend/app/routers/prices.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_prices.py
import pytest

def test_log_price(client, auth_headers, test_list):
    # Create an item first
    item_resp = client.post(
        f"/lists/{test_list['id']}/items",
        json={"name": "Leche", "ean": "8410188082498"},
        headers=auth_headers,
    )
    item_id = item_resp.json()["id"]

    resp = client.post(
        f"/lists/{test_list['id']}/items/{item_id}/prices",
        json={"amount": 0.89, "price_per": None, "store": "Mercadona"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount"] == 0.89
    assert data["store"] == "Mercadona"
    assert data["ean"] == "8410188082498"  # denormalized from item


def test_log_price_non_member_forbidden(client, auth_headers_other, test_list):
    resp = client.post(
        f"/lists/{test_list['id']}/items/fake-id/prices",
        json={"amount": 1.0},
        headers=auth_headers_other,
    )
    assert resp.status_code == 403


def test_get_price_history_this_list(client, auth_headers, test_list):
    # Create item, log a price, fetch history
    item_resp = client.post(
        f"/lists/{test_list['id']}/items",
        json={"name": "Arroz", "ean": "8410188011111"},
        headers=auth_headers,
    )
    item_id = item_resp.json()["id"]
    client.post(
        f"/lists/{test_list['id']}/items/{item_id}/prices",
        json={"amount": 1.20, "price_per": "KILOGRAM", "store": "Lidl"},
        headers=auth_headers,
    )

    resp = client.get(
        f"/lists/{test_list['id']}/items/{item_id}/prices?scope=this_list",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "groups" in data
    assert len(data["groups"]) == 1
    assert data["groups"][0]["store"] == "Lidl"
    assert data["groups"][0]["records"][0]["amount"] == 1.20


def test_get_price_history_my_lists_uses_ean(client, auth_headers, test_list, second_list):
    """Prices from another list for same EAN appear under my_lists scope."""
    ean = "8410188022222"
    # Log price under test_list
    item1 = client.post(
        f"/lists/{test_list['id']}/items",
        json={"name": "Aceite", "ean": ean},
        headers=auth_headers,
    ).json()["id"]
    client.post(
        f"/lists/{test_list['id']}/items/{item1}/prices",
        json={"amount": 4.50, "price_per": None, "store": "Mercadona"},
        headers=auth_headers,
    )
    # Log price under second_list for same EAN
    item2 = client.post(
        f"/lists/{second_list['id']}/items",
        json={"name": "Aceite oliva", "ean": ean},
        headers=auth_headers,
    ).json()["id"]
    client.post(
        f"/lists/{second_list['id']}/items/{item2}/prices",
        json={"amount": 5.00, "price_per": None, "store": "Carrefour"},
        headers=auth_headers,
    )

    resp = client.get(
        f"/lists/{test_list['id']}/items/{item1}/prices?scope=my_lists",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    stores = {g["store"] for g in resp.json()["groups"]}
    assert "Mercadona" in stores
    assert "Carrefour" in stores
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_prices.py -v
```
Expected: FAIL — router not registered.

Note: `second_list` fixture needs to be added to `conftest.py`:
```python
@pytest.fixture
def second_list(client, auth_headers):
    resp = client.post("/lists", json={"name": "Lista 2"}, headers=auth_headers)
    return resp.json()
```

- [ ] **Step 3: Create routers/prices.py**

```python
# backend/app/routers/prices.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from app.db.session import get_session
from app.db.models import ListItem, PriceRecord, PriceCache, ListMember
from app.dependencies import get_current_user, require_member
from app.schemas.prices import PriceCreate, PriceRecordRead, PriceHistoryResponse, StoreGroup
from collections import defaultdict

router = APIRouter()


def _records_to_response(
    records: list[PriceRecord],
    community_price: float | None,
    community_price_per: str | None,
) -> PriceHistoryResponse:
    groups_map: dict[str | None, list[PriceRecord]] = defaultdict(list)
    for r in records:
        groups_map[r.store].append(r)

    groups = []
    for store, store_records in groups_map.items():
        sorted_records = sorted(store_records, key=lambda r: r.recorded_at, reverse=True)
        groups.append(
            StoreGroup(
                store=store,
                records=[PriceRecordRead.model_validate(r) for r in sorted_records],
            )
        )

    return PriceHistoryResponse(
        groups=groups,
        community_price=community_price,
        community_price_per=community_price_per,
    )


@router.post(
    "/lists/{list_id}/items/{item_id}/prices",
    response_model=PriceRecordRead,
)
def log_price(
    list_id: str,
    item_id: str,
    price_in: PriceCreate,
    session: Session = Depends(get_session),
    current_user=Depends(get_current_user),
    _=Depends(require_member),
):
    item = session.exec(select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    record = PriceRecord(
        list_item_id=item_id,
        ean=item.ean,
        amount=price_in.amount,
        price_per=price_in.price_per,
        store=price_in.store,
        user_id=current_user.id,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return PriceRecordRead.model_validate(record)


@router.get(
    "/lists/{list_id}/items/{item_id}/prices",
    response_model=PriceHistoryResponse,
)
def get_price_history(
    list_id: str,
    item_id: str,
    scope: str = Query(default="this_list", pattern="^(this_list|my_lists|all)$"),
    session: Session = Depends(get_session),
    current_user=Depends(get_current_user),
    _=Depends(require_member),
):
    item = session.exec(select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    ean = item.ean

    # Community price from cache
    community_price, community_price_per = None, None
    if ean:
        cached = session.exec(select(PriceCache).where(PriceCache.ean == ean)).first()
        if cached:
            community_price = cached.amount
            community_price_per = cached.price_per

    if scope == "this_list":
        # Items in this list only
        list_item_ids = [
            r.id for r in session.exec(select(ListItem).where(ListItem.list_id == list_id)).all()
        ]
        records = session.exec(
            select(PriceRecord).where(PriceRecord.list_item_id.in_(list_item_ids))
        ).all()

    elif scope == "my_lists":
        if ean:
            # All records by current user for this EAN
            records = session.exec(
                select(PriceRecord).where(
                    PriceRecord.ean == ean,
                    PriceRecord.user_id == current_user.id,
                )
            ).all()
        else:
            records = session.exec(
                select(PriceRecord).where(
                    PriceRecord.list_item_id == item_id,
                    PriceRecord.user_id == current_user.id,
                )
            ).all()

    else:  # all
        if ean:
            records = session.exec(
                select(PriceRecord).where(PriceRecord.ean == ean)
            ).all()
        else:
            # Fall back to my_lists behavior
            records = session.exec(
                select(PriceRecord).where(
                    PriceRecord.list_item_id == item_id,
                    PriceRecord.user_id == current_user.id,
                )
            ).all()

    return _records_to_response(list(records), community_price, community_price_per)
```

- [ ] **Step 4: Register router in main.py**

In `backend/app/main.py`, add the import:
```python
from app.routers import prices
```
And register:
```python
app.include_router(prices.router)
```

- [ ] **Step 5: Add prices router to test client in conftest.py**

In `backend/tests/conftest.py`, find `_make_client()` and add `prices` router import and `app.include_router(prices.router)`.

Also add the `second_list` fixture:
```python
@pytest.fixture
def second_list(client, auth_headers):
    resp = client.post("/lists", json={"name": "Lista 2"}, headers=auth_headers)
    return resp.json()
```

- [ ] **Step 6: Run tests**

```bash
cd backend && uv run pytest tests/test_prices.py -v
```
Expected: PASS

- [ ] **Step 7: Run full test suite**

```bash
cd backend && uv run pytest
```
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
cd backend && git add app/routers/prices.py app/main.py tests/test_prices.py tests/conftest.py
git commit -m "feat: add prices router (log price + history with scope)"
```

---

## Task 7: Frontend Types & API Client

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Read current types.ts and api.ts**

```bash
cat frontend/src/types.ts
cat frontend/src/lib/api.ts
```

- [ ] **Step 2: Update types.ts**

Add `ean: string | null` to `ListItem`. Update `BarcodeRead` to include `ean`, `community_price`, `community_price_per`. Add new price types at the end:

```typescript
// In ListItem interface, add:
ean: string | null;

// Replace BarcodeRead with:
export interface BarcodeRead {
  ean: string;
  name: string;
  brand: string | null;
  stores: string[];
  community_price: number | null;
  community_price_per: 'KILOGRAM' | null;
}

// Add at the end of the file:
export interface PriceRecordRead {
  id: string;
  list_item_id: string;
  ean: string | null;
  amount: number;
  price_per: 'KILOGRAM' | null;
  store: string | null;
  user_id: string;
  recorded_at: string;
}

export interface StoreGroup {
  store: string | null;
  records: PriceRecordRead[];
}

export interface PriceHistoryResponse {
  groups: StoreGroup[];
  community_price: number | null;
  community_price_per: 'KILOGRAM' | null;
}
```

- [ ] **Step 3: Update api.ts**

Add these two functions at the end of the file:

```typescript
export async function getPriceHistory(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
  scope: 'this_list' | 'my_lists' | 'all',
): Promise<PriceHistoryResponse> {
  const token = await getToken();
  const resp = await fetch(
    `${API_BASE}/lists/${listId}/items/${itemId}/prices?scope=${scope}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) throw new Error(`getPriceHistory failed: ${resp.status}`);
  return resp.json();
}

export async function logPrice(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
  payload: { amount: number; price_per: 'KILOGRAM' | null; store: string | null },
): Promise<PriceRecordRead> {
  const token = await getToken();
  const resp = await fetch(`${API_BASE}/lists/${listId}/items/${itemId}/prices`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`logPrice failed: ${resp.status}`);
  return resp.json();
}
```

Also add `PriceHistoryResponse`, `PriceRecordRead` to the import from `../types` (or wherever types are imported).

- [ ] **Step 4: Update test fixture**

In `frontend/src/hooks/useListItems.test.tsx`, find the `item1` fixture and add `ean: null`:

```typescript
const item1 = {
  // ... existing fields ...
  ean: null,
};
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```
Expected: No errors.

- [ ] **Step 6: Run frontend tests**

```bash
cd frontend && npm run test
```
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/types.ts src/lib/api.ts src/hooks/useListItems.test.tsx
git commit -m "feat: add price types and API client functions"
```

---

## Task 8: BarcodeScanSheet — Community Price Display

**Files:**
- Modify: `frontend/src/components/BarcodeScanSheet.tsx`
- Modify: `frontend/src/components/BarcodeScanSheet.css`

- [ ] **Step 1: Read current BarcodeScanSheet.tsx**

```bash
cat frontend/src/components/BarcodeScanSheet.tsx
```

- [ ] **Step 2: Add community price row to the sheet**

In the JSX, after showing the product name/brand area and before the "Añadir" button, add a community price row. It should only render when `barcodeData.community_price !== null`:

```tsx
{barcodeData.community_price !== null && (
  <div className="barcode-community-price">
    <span className="barcode-community-price-text">
      {barcodeData.community_price_per === 'KILOGRAM'
        ? `~€${barcodeData.community_price.toFixed(2)}/kg según la comunidad`
        : `~€${barcodeData.community_price.toFixed(2)} según la comunidad`}
    </span>
    <span
      className="barcode-community-price-info"
      title="Precio medio de la comunidad de Open Prices, filtrado a tiendas españolas cuando hay datos disponibles. Puede no reflejar los precios actuales."
    >
      ⓘ
    </span>
  </div>
)}
```

- [ ] **Step 3: Add CSS**

In `BarcodeScanSheet.css`, add:

```css
.barcode-community-price {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  color: #8e8e93;
  font-size: 13px;
}

.barcode-community-price-info {
  cursor: default;
  color: #636366;
  font-size: 12px;
}
```

- [ ] **Step 4: Type-check and test**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npm run test
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/BarcodeScanSheet.tsx src/components/BarcodeScanSheet.css
git commit -m "feat: show community price in BarcodeScanSheet"
```

---

## Task 9: LogPriceSheet Component

**Files:**
- Create: `frontend/src/components/LogPriceSheet.tsx`
- Create: `frontend/src/components/LogPriceSheet.css`

- [ ] **Step 1: Create LogPriceSheet.css**

```css
/* frontend/src/components/LogPriceSheet.css */
.log-price-sheet {
  background: #2c2c2e;
  border-radius: 20px 20px 0 0;
  padding-bottom: env(safe-area-inset-bottom, 16px);
}

.log-price-handle {
  width: 36px;
  height: 4px;
  background: #48484a;
  border-radius: 2px;
  margin: 10px auto 12px;
}

.log-price-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  padding: 0 16px 4px;
}

.log-price-subtitle {
  font-size: 13px;
  color: #8e8e93;
  padding: 0 16px 12px;
  border-bottom: 1px solid #3a3a3c;
}

.log-price-field {
  padding: 12px 16px;
  border-bottom: 1px solid #3a3a3c;
}

.log-price-field-label {
  font-size: 11px;
  font-weight: 700;
  color: #8e8e93;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.log-price-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-price-euro {
  font-size: 20px;
  font-weight: 700;
  color: #8e8e93;
}

.log-price-input {
  flex: 1;
  background: #3a3a3c;
  border: none;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  outline: none;
  text-align: right;
  -webkit-appearance: none;
}

.log-price-unit-toggle {
  display: flex;
  background: #3a3a3c;
  border-radius: 8px;
  overflow: hidden;
}

.log-price-unit-btn {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #8e8e93;
  border: none;
  background: transparent;
  cursor: pointer;
}

.log-price-unit-btn.active {
  background: #0a84ff;
  color: #fff;
  border-radius: 8px;
}

.log-price-legend {
  font-size: 11px;
  color: #636366;
  margin-top: 8px;
  line-height: 1.4;
}

.log-price-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.log-price-chip {
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  background: #3a3a3c;
  color: #8e8e93;
}

.log-price-chip.selected {
  background: rgba(10, 132, 255, 0.15);
  color: #0a84ff;
  border-color: rgba(10, 132, 255, 0.3);
}

.log-price-chip.add {
  background: transparent;
  color: #0a84ff;
  border: 1px dashed rgba(10, 132, 255, 0.3);
}

.log-price-new-store-input {
  width: 100%;
  background: #3a3a3c;
  border: none;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  color: #fff;
  outline: none;
  margin-top: 8px;
  box-sizing: border-box;
}

.log-price-save-btn {
  display: block;
  width: calc(100% - 32px);
  margin: 14px 16px 8px;
  background: #0a84ff;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  padding: 14px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  text-align: center;
}

.log-price-save-btn:disabled {
  opacity: 0.4;
}

.log-price-cancel {
  display: block;
  text-align: center;
  font-size: 14px;
  color: #8e8e93;
  padding: 8px;
  cursor: pointer;
  background: none;
  border: none;
  width: 100%;
}
```

- [ ] **Step 2: Create LogPriceSheet.tsx**

```tsx
// frontend/src/components/LogPriceSheet.tsx
import { useState } from 'react';
import { ListItem } from '../types';
import './LogPriceSheet.css';

interface Props {
  item: ListItem;
  initialAmount: number | null;
  initialPricePer: 'KILOGRAM' | null;
  initialStore: string | null;
  onSave: (amount: number, pricePer: 'KILOGRAM' | null, store: string | null) => void;
  onClose: () => void;
}

export default function LogPriceSheet({
  item,
  initialAmount,
  initialPricePer,
  initialStore,
  onSave,
  onClose,
}: Props) {
  const [amountStr, setAmountStr] = useState(
    initialAmount !== null ? String(initialAmount) : '',
  );
  const [pricePer, setPricePer] = useState<'KILOGRAM' | null>(initialPricePer);
  const [selectedStore, setSelectedStore] = useState<string | null>(initialStore);
  const [addingStore, setAddingStore] = useState(false);
  const [newStore, setNewStore] = useState('');

  const amount = parseFloat(amountStr);
  const canSave = !isNaN(amount) && amount > 0;

  const stores = item.stores ?? [];

  function handleSave() {
    if (!canSave) return;
    const finalStore = addingStore && newStore.trim()
      ? newStore.trim()
      : selectedStore;
    onSave(amount, pricePer, finalStore);
  }

  function handleStoreChip(store: string) {
    setAddingStore(false);
    setSelectedStore(store === selectedStore ? null : store);
  }

  function handleAddStore() {
    setSelectedStore(null);
    setAddingStore(true);
  }

  return (
    <div className="log-price-sheet">
      <div className="log-price-handle" />
      <div className="log-price-title">💶 Añadir precio</div>
      <div className="log-price-subtitle">
        {item.name}{item.brand ? ` · ${item.brand}` : ''}
      </div>

      <div className="log-price-field">
        <div className="log-price-field-label">Precio pagado</div>
        <div className="log-price-input-row">
          <span className="log-price-euro">€</span>
          <input
            className="log-price-input"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={e => setAmountStr(e.target.value)}
            min="0"
            step="0.01"
          />
          <div className="log-price-unit-toggle">
            <button
              className={`log-price-unit-btn${pricePer === null ? ' active' : ''}`}
              onClick={() => setPricePer(null)}
            >
              /ud
            </button>
            <button
              className={`log-price-unit-btn${pricePer === 'KILOGRAM' ? ' active' : ''}`}
              onClick={() => setPricePer('KILOGRAM')}
            >
              /kg
            </button>
          </div>
        </div>
        <div className="log-price-legend">
          Introduce el precio normalizado: por unidad (ej. €0.89 por un cartón de leche)
          o por kg (ej. €3.20/kg de arroz a granel).
        </div>
      </div>

      <div className="log-price-field" style={{ borderBottom: 'none' }}>
        <div className="log-price-field-label">Tienda</div>
        <div className="log-price-chips">
          {stores.map(store => (
            <button
              key={store}
              className={`log-price-chip${selectedStore === store && !addingStore ? ' selected' : ''}`}
              onClick={() => handleStoreChip(store)}
            >
              🏪 {store}
            </button>
          ))}
          <button className="log-price-chip add" onClick={handleAddStore}>
            + otra
          </button>
        </div>
        {addingStore && (
          <input
            className="log-price-new-store-input"
            type="text"
            placeholder="Nombre de la tienda"
            value={newStore}
            onChange={e => setNewStore(e.target.value)}
            autoFocus
          />
        )}
      </div>

      <button className="log-price-save-btn" onClick={handleSave} disabled={!canSave}>
        Guardar
      </button>
      <button className="log-price-cancel" onClick={onClose}>
        Cancelar
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/LogPriceSheet.tsx src/components/LogPriceSheet.css
git commit -m "feat: add LogPriceSheet component"
```

---

## Task 10: PriceHistorySheet Component

**Files:**
- Create: `frontend/src/components/PriceHistorySheet.tsx`
- Create: `frontend/src/components/PriceHistorySheet.css`

- [ ] **Step 1: Create PriceHistorySheet.css**

```css
/* frontend/src/components/PriceHistorySheet.css */
.price-history-sheet {
  background: #2c2c2e;
  border-radius: 20px 20px 0 0;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom, 16px);
}

.price-history-handle {
  width: 36px;
  height: 4px;
  background: #48484a;
  border-radius: 2px;
  margin: 10px auto 12px;
  flex-shrink: 0;
}

.price-history-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  padding: 0 16px 12px;
  border-bottom: 1px solid #3a3a3c;
  flex-shrink: 0;
}

/* Scope segmented control */
.price-history-scope {
  display: flex;
  padding: 10px 16px;
  gap: 6px;
  flex-shrink: 0;
  border-bottom: 1px solid #3a3a3c;
}

.price-history-scope-btn {
  flex: 1;
  padding: 7px 0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  background: #3a3a3c;
  color: #8e8e93;
}

.price-history-scope-btn.active {
  background: #0a84ff;
  color: #fff;
}

/* Community price banner */
.price-history-community {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #1c1c1e;
  border-bottom: 1px solid #3a3a3c;
  font-size: 14px;
  color: #8e8e93;
  flex-shrink: 0;
}

.price-history-community-price {
  font-weight: 600;
  color: #fff;
}

.price-history-community-info {
  cursor: default;
  color: #636366;
  font-size: 12px;
  margin-left: auto;
}

/* Scrollable content */
.price-history-content {
  overflow-y: auto;
  flex: 1;
  padding: 8px 0;
}

/* Store rows */
.price-history-store-row {
  padding: 12px 16px;
  border-bottom: 1px solid #3a3a3c;
  cursor: pointer;
}

.price-history-store-row.dimmed {
  opacity: 0.4;
}

.price-history-store-summary {
  display: flex;
  align-items: center;
  gap: 10px;
}

.price-history-store-info {
  flex: 1;
}

.price-history-store-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.price-history-store-meta {
  font-size: 11px;
  color: #8e8e93;
  margin-top: 2px;
}

.price-history-store-price {
  font-size: 15px;
  font-weight: 700;
  color: #30d158;
}

.price-history-sparkline {
  width: 60px;
  height: 28px;
}

/* Inline expanded view */
.price-history-expand {
  margin-top: 10px;
  background: #1c1c1e;
  border-radius: 10px;
  padding: 10px 12px;
}

.price-history-expand-chart {
  width: 100%;
  height: 48px;
  margin-bottom: 8px;
}

.price-history-expand-stats {
  display: flex;
  gap: 16px;
}

.price-history-stat {
  font-size: 11px;
  color: #8e8e93;
}

.price-history-stat strong {
  display: block;
  font-size: 13px;
  color: #fff;
  font-weight: 700;
}

.price-history-expand-records {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.price-history-record-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #8e8e93;
}

.price-history-record-amount {
  color: #fff;
  font-weight: 600;
}

/* Log price button */
.price-history-log-btn {
  display: block;
  width: calc(100% - 32px);
  margin: 12px 16px 4px;
  background: #3a3a3c;
  color: #0a84ff;
  font-size: 15px;
  font-weight: 700;
  padding: 14px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  text-align: center;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Create PriceHistorySheet.tsx**

```tsx
// frontend/src/components/PriceHistorySheet.tsx
import { useEffect, useState } from 'react';
import { ListItem, PriceHistoryResponse, StoreGroup } from '../types';
import { getPriceHistory } from '../lib/api';
import './PriceHistorySheet.css';

type Scope = 'this_list' | 'my_lists' | 'all';

interface Props {
  item: ListItem;
  listId: string;
  getToken: () => Promise<string>;
  onLogPrice: () => void;
  onClose: () => void;
}

function formatPrice(amount: number, pricePer: 'KILOGRAM' | null): string {
  return pricePer === 'KILOGRAM'
    ? `€${amount.toFixed(2)}/kg`
    : `€${amount.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function Sparkline({ records, pricePer }: { records: StoreGroup['records']; pricePer: 'KILOGRAM' | null }) {
  if (records.length < 2) {
    return (
      <svg className="price-history-sparkline" viewBox="0 0 60 28">
        {records.length === 1 && (
          <circle cx="30" cy="14" r="2" fill="#0a84ff" />
        )}
      </svg>
    );
  }
  const prices = [...records].reverse().map(r => r.amount);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const w = 60, h = 28, pad = 4;
  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (w - 2 * pad);
    const y = pad + ((max - p) / range) * (h - 2 * pad);
    return [x, y] as [number, number];
  });
  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${points[points.length - 1][0].toFixed(1)},${h} L${points[0][0].toFixed(1)},${h} Z`;

  return (
    <svg className="price-history-sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={areaD} fill="rgba(10,132,255,0.15)" />
      <path d={pathD} stroke="#0a84ff" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export default function PriceHistorySheet({ item, listId, getToken, onLogPrice, onClose }: Props) {
  const [scope, setScope] = useState<Scope>('this_list');
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null);
  const [expandedStore, setExpandedStore] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getPriceHistory(getToken, listId, item.id, scope).then(data => {
      if (!cancelled) setHistory(data);
    });
    return () => { cancelled = true; };
  }, [scope]);

  const hasExpanded = expandedStore !== undefined;

  function toggleStore(store: string | null) {
    setExpandedStore(prev => (prev === store ? undefined : store));
  }

  return (
    <div className="price-history-sheet">
      <div className="price-history-handle" />
      <div className="price-history-title">{item.name}</div>

      <div className="price-history-scope">
        {(['this_list', 'my_lists', 'all'] as Scope[]).map(s => (
          <button
            key={s}
            className={`price-history-scope-btn${scope === s ? ' active' : ''}`}
            onClick={() => { setScope(s); setExpandedStore(undefined); }}
          >
            {s === 'this_list' ? 'Esta lista' : s === 'my_lists' ? 'Mis listas' : 'Todos'}
          </button>
        ))}
      </div>

      {history?.community_price !== null && history?.community_price !== undefined && (
        <div className="price-history-community">
          <span>🌍 Comunidad</span>
          <span className="price-history-community-price">
            ~{formatPrice(history.community_price, history.community_price_per)}
          </span>
          <span
            className="price-history-community-info"
            title="Precio medio de la comunidad de Open Prices, filtrado a tiendas españolas cuando hay datos disponibles. Puede no reflejar los precios actuales."
          >
            ⓘ
          </span>
        </div>
      )}

      <div className="price-history-content">
        {history?.groups.length === 0 && (
          <div style={{ padding: '20px 16px', color: '#636366', fontSize: 14 }}>
            No hay precios registrados para este alcance.
          </div>
        )}
        {history?.groups.map(group => {
          const isExpanded = expandedStore === group.store;
          const isDimmed = hasExpanded && !isExpanded;
          const latest = group.records[0];
          const amounts = group.records.map(r => r.amount);
          const minAmt = Math.min(...amounts);
          const maxAmt = Math.max(...amounts);

          return (
            <div
              key={group.store ?? '__none__'}
              className={`price-history-store-row${isDimmed ? ' dimmed' : ''}`}
              onClick={() => toggleStore(group.store)}
            >
              <div className="price-history-store-summary">
                <div className="price-history-store-info">
                  <div className="price-history-store-name">
                    {group.store ? `🏪 ${group.store}` : 'Sin tienda'}
                  </div>
                  <div className="price-history-store-meta">
                    {group.records.length} {group.records.length === 1 ? 'precio' : 'precios'} · último {formatDate(latest.recorded_at)}
                  </div>
                </div>
                <Sparkline records={group.records} pricePer={latest.price_per} />
                <div className="price-history-store-price">
                  {formatPrice(latest.amount, latest.price_per)}
                </div>
              </div>

              {isExpanded && (
                <div className="price-history-expand">
                  <svg className="price-history-expand-chart" viewBox="0 0 200 48" preserveAspectRatio="none">
                    {group.records.length >= 2 && (() => {
                      const prices = [...group.records].reverse().map(r => r.amount);
                      const min = Math.min(...prices);
                      const max = Math.max(...prices);
                      const range = max - min || 1;
                      const w = 200, h = 48, pad = 6;
                      const pts = prices.map((p, i) => {
                        const x = pad + (i / (prices.length - 1)) * (w - 2 * pad);
                        const y = pad + ((max - p) / range) * (h - 2 * pad);
                        return [x.toFixed(1), y.toFixed(1)];
                      });
                      const pathD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
                      const areaD = `${pathD} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;
                      return (
                        <>
                          <path d={areaD} fill="rgba(10,132,255,0.15)" />
                          <path d={pathD} stroke="#0a84ff" strokeWidth="2" fill="none" />
                        </>
                      );
                    })()}
                  </svg>
                  <div className="price-history-expand-stats">
                    <div className="price-history-stat">
                      <strong>{formatPrice(latest.amount, latest.price_per)}</strong>Último
                    </div>
                    <div className="price-history-stat">
                      <strong>{formatPrice(minAmt, latest.price_per)}</strong>Mínimo
                    </div>
                    <div className="price-history-stat">
                      <strong>{formatPrice(maxAmt, latest.price_per)}</strong>Máximo
                    </div>
                  </div>
                  <div className="price-history-expand-records">
                    {group.records.map(r => (
                      <div key={r.id} className="price-history-record-row">
                        <span>{formatDate(r.recorded_at)}</span>
                        <span className="price-history-record-amount">
                          {formatPrice(r.amount, r.price_per)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button className="price-history-log-btn" onClick={onLogPrice}>
        + Registrar precio
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/PriceHistorySheet.tsx src/components/PriceHistorySheet.css
git commit -m "feat: add PriceHistorySheet with scope control, sparklines, and inline expand"
```

---

## Task 11: PurchaseToast Component

**Files:**
- Create: `frontend/src/components/PurchaseToast.tsx`
- Create: `frontend/src/components/PurchaseToast.css`

- [ ] **Step 1: Create PurchaseToast.css**

```css
/* frontend/src/components/PurchaseToast.css */
.purchase-toast {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
  left: 16px;
  right: 16px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 200;
  animation: toast-slide-up 0.25s ease;
}

@keyframes toast-slide-up {
  from { transform: translateY(100px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.purchase-toast-progress {
  height: 3px;
  background: #2c2c2e;
}

.purchase-toast-progress-fill {
  height: 100%;
  background: #0a84ff;
  opacity: 0.7;
  border-radius: 0 2px 2px 0;
  animation: pt-drain 6s linear forwards;
}

@keyframes pt-drain {
  from { width: 100%; }
  to { width: 0%; }
}

.purchase-toast-body {
  background: #3a3a3c;
  padding: 11px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.purchase-toast-text {
  flex: 1;
  font-size: 14px;
  color: rgba(235, 235, 245, 0.8);
  line-height: 1.3;
}

.purchase-toast-text strong {
  color: #fff;
  font-weight: 600;
}

.purchase-toast-cta {
  font-size: 14px;
  font-weight: 700;
  color: #0a84ff;
  white-space: nowrap;
  padding: 4px 0 4px 4px;
  cursor: pointer;
  background: none;
  border: none;
}

.purchase-toast-dismiss {
  font-size: 16px;
  color: #636366;
  padding: 4px 0 4px 6px;
  cursor: pointer;
  background: none;
  border: none;
}
```

- [ ] **Step 2: Create PurchaseToast.tsx**

```tsx
// frontend/src/components/PurchaseToast.tsx
import { useEffect } from 'react';
import './PurchaseToast.css';

const AUTO_DISMISS_MS = 6000;

interface Props {
  itemName: string;
  onAddPrice: () => void;
  onDismiss: () => void;
}

export default function PurchaseToast({ itemName, onAddPrice, onDismiss }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="purchase-toast">
      <div className="purchase-toast-progress">
        <div className="purchase-toast-progress-fill" />
      </div>
      <div className="purchase-toast-body">
        <div className="purchase-toast-text">
          Compraste <strong>{itemName}</strong>
        </div>
        <button className="purchase-toast-cta" onClick={onAddPrice}>
          Añadir precio
        </button>
        <button className="purchase-toast-dismiss" onClick={onDismiss}>
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/components/PurchaseToast.tsx src/components/PurchaseToast.css
git commit -m "feat: add PurchaseToast with draining progress bar"
```

---

## Task 12: ItemCard Price Tag

**Files:**
- Modify: `frontend/src/components/ItemCard.tsx`
- Modify: `frontend/src/components/ItemCard.css`

- [ ] **Step 1: Read current ItemCard.tsx**

```bash
cat frontend/src/components/ItemCard.tsx
```

- [ ] **Step 2: Add price props and tag**

Add new props to `ItemCard`:

```tsx
interface ItemCardProps {
  // ... existing props ...
  lastPrice?: { amount: number; price_per: 'KILOGRAM' | null } | null;
  onPriceClick?: (itemId: string) => void;
}
```

In the tags row JSX, after existing tag logic, add:

```tsx
{/* Price tag */}
{lastPrice ? (
  <span
    className="item-tag item-tag-price"
    onClick={e => { e.stopPropagation(); onPriceClick?.(item.id); }}
  >
    💶 {lastPrice.price_per === 'KILOGRAM'
      ? `€${lastPrice.amount.toFixed(2)}/kg`
      : `€${lastPrice.amount.toFixed(2)}`}
  </span>
) : (
  <span
    className="item-tag item-tag-price-cta"
    onClick={e => { e.stopPropagation(); onPriceClick?.(item.id); }}
  >
    + 💶
  </span>
)}
```

- [ ] **Step 3: Add CSS**

In `ItemCard.css`, add:

```css
.item-tag-price {
  background: #1c3a2e;
  color: #30d158;
}

.item-tag-price-cta {
  background: #1c2c3a;
  color: #0a84ff;
}
```

- [ ] **Step 4: Type-check and test**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npm run test
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/ItemCard.tsx src/components/ItemCard.css
git commit -m "feat: add price tag to ItemCard"
```

---

## Task 13: ListScreen Wiring

**Files:**
- Modify: `frontend/src/components/ItemList.tsx`
- Modify: `frontend/src/components/ListScreen.tsx`

- [ ] **Step 1: Read current ItemList.tsx and ListScreen.tsx**

```bash
cat frontend/src/components/ItemList.tsx
cat frontend/src/components/ListScreen.tsx
```

- [ ] **Step 2: Thread props through ItemList**

In `ItemList.tsx`, add to its props interface:

```tsx
onPriceClick: (itemId: string) => void;
lastPrices: Map<string, { amount: number; price_per: 'KILOGRAM' | null }>;
```

Pass them down to each `ItemCard`:

```tsx
<ItemCard
  // ... existing props ...
  lastPrice={lastPrices.get(item.id) ?? null}
  onPriceClick={onPriceClick}
/>
```

- [ ] **Step 3: Update ListScreen**

In `ListScreen.tsx`, add new state:

```tsx
const [priceItemId, setPriceItemId] = useState<string | null>(null);
const [logPriceFor, setLogPriceFor] = useState<{
  itemId: string;
  initialAmount: number | null;
  initialPricePer: 'KILOGRAM' | null;
  initialStore: string | null;
} | null>(null);
const [purchaseToast, setPurchaseToast] = useState<{ itemId: string; itemName: string } | null>(null);
const [lastPrices, setLastPrices] = useState<Map<string, { amount: number; price_per: 'KILOGRAM' | null }>>(new Map());
```

Update `handleTogglePurchased` to show the toast when an item is marked as purchased:

```tsx
// After the existing toggle logic, when newly marking as purchased:
if (!item.purchased) {
  setPurchaseToast({ itemId: item.id, itemName: item.name });
}
```

Add `handleSavePrice`:

```tsx
async function handleSavePrice(amount: number, pricePer: 'KILOGRAM' | null, store: string | null) {
  if (!logPriceFor) return;
  await logPrice(getToken, list.id, logPriceFor.itemId, { amount, price_per: pricePer, store });
  setLastPrices(prev => new Map(prev).set(logPriceFor.itemId, { amount, price_per: pricePer }));
  setLogPriceFor(null);
  setPriceItemId(null);
  setPurchaseToast(null);
}
```

Add `handleOpenLogPrice` which pre-populates from last recorded price:

```tsx
function handleOpenLogPrice(itemId: string) {
  const last = lastPrices.get(itemId);
  const item = items.find(i => i.id === itemId);
  setLogPriceFor({
    itemId,
    initialAmount: last?.amount ?? null,
    initialPricePer: last?.price_per ?? null,
    initialStore: item?.stores?.[0] ?? null,
  });
}
```

Wire `onPriceClick` on `ItemList`:

```tsx
<ItemList
  // ... existing props ...
  onPriceClick={itemId => { setPriceItemId(itemId); }}
  lastPrices={lastPrices}
/>
```

Add sheets and toast in the JSX (after the `ItemList`):

```tsx
{/* PriceHistorySheet */}
{priceItemId && (() => {
  const item = items.find(i => i.id === priceItemId);
  if (!item) return null;
  return (
    <div className="sheet-overlay" onClick={() => setPriceItemId(null)}>
      <div className="sheet-container" onClick={e => e.stopPropagation()}>
        <PriceHistorySheet
          item={item}
          listId={list.id}
          getToken={getToken}
          onLogPrice={() => handleOpenLogPrice(priceItemId)}
          onClose={() => setPriceItemId(null)}
        />
      </div>
    </div>
  );
})()}

{/* LogPriceSheet */}
{logPriceFor && (() => {
  const item = items.find(i => i.id === logPriceFor.itemId);
  if (!item) return null;
  return (
    <div className="sheet-overlay" onClick={() => setLogPriceFor(null)}>
      <div className="sheet-container" onClick={e => e.stopPropagation()}>
        <LogPriceSheet
          item={item}
          initialAmount={logPriceFor.initialAmount}
          initialPricePer={logPriceFor.initialPricePer}
          initialStore={logPriceFor.initialStore}
          onSave={handleSavePrice}
          onClose={() => setLogPriceFor(null)}
        />
      </div>
    </div>
  );
})()}

{/* PurchaseToast */}
{purchaseToast && (
  <PurchaseToast
    itemName={purchaseToast.itemName}
    onAddPrice={() => handleOpenLogPrice(purchaseToast.itemId)}
    onDismiss={() => setPurchaseToast(null)}
  />
)}
```

Also ensure these imports are at the top of `ListScreen.tsx`:

```tsx
import LogPriceSheet from './LogPriceSheet';
import PriceHistorySheet from './PriceHistorySheet';
import PurchaseToast from './PurchaseToast';
import { getPriceHistory, logPrice } from '../lib/api';
```

And update `handleScanAdd` to pass `ean` when creating an item from a barcode scan. Find where `ItemCreate` is called and add:

```tsx
ean: barcodeData?.ean ?? null,
```

- [ ] **Step 4: Type-check and test**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit && npm run test
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/ItemList.tsx src/components/ListScreen.tsx
git commit -m "feat: wire PriceHistorySheet, LogPriceSheet, PurchaseToast into ListScreen"
```

---

## Task 14: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove price tracking from Out of Scope**

In `CLAUDE.md`, find the Out of Scope section:

```markdown
## Out of Scope

- Price tracking and receipt scanning (OCR)
```

Change it to:

```markdown
## Out of Scope

- Receipt scanning (OCR)
- Submitting prices to Open Prices (requires proof image + OSM location)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — price tracking is now in scope"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All sections of `docs/superpowers/specs/2026-04-07-price-tracking-design.md` covered:
  - `list_items.ean` → Task 1 + 3
  - `price_cache` table → Task 1 + 2
  - `price_records` table → Task 1 + 2
  - `GET /barcode/{ean}` extended → Task 4
  - `GET/POST /lists/{id}/items/{id}/prices` → Task 6
  - `BarcodeRead` frontend type → Task 7
  - `BarcodeScanSheet` community price → Task 8
  - `LogPriceSheet` → Task 9
  - `PriceHistorySheet` → Task 10
  - `PurchaseToast` → Task 11
  - `ItemCard` price tag → Task 12
  - `ListScreen` wiring + EAN on scan add → Task 13
  - `CLAUDE.md` update → Task 14
- [x] **No placeholders:** All steps contain concrete code.
- [x] **Type consistency:** `price_per` is `'KILOGRAM' | null` throughout frontend, `str | None` in backend. `ean` is `string | null` (frontend) / `Optional[str]` (backend).
