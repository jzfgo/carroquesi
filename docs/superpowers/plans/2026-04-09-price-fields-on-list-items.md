# Price Fields on List Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `price_records` table with three price columns on `list_items` (`price`, `price_per`, `price_store`), preserving the price-logging endpoint and the scope-based price-history query by querying `list_items` directly.

**Architecture:** The `POST .../prices` endpoint updates the item's own price fields instead of inserting a new row. The `GET .../prices?scope=` endpoint queries `list_items` filtered by scope — matching items by EAN (or by name+brand when EAN is absent) across `this_list`, `my_lists` (via `list_members`), or `all`. `ItemRead` gains three nullable price fields so clients always receive the current price alongside the item.

**Tech Stack:** Python 3.13, FastAPI, SQLModel, Alembic, pytest, SQLite in-memory (tests)

---

### Task 1: Alembic migration — add price columns, drop price_records

**Files:**
- Create: `backend/alembic/versions/f7a8b9c0d1e2_move_price_to_list_items.py`

- [ ] **Step 1: Write the migration file**

```python
"""move price fields to list_items, drop price_records

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-04-09 00:00:00.000000
"""
from typing import Sequence, Union

import sqlmodel
from alembic import op
import sqlalchemy as sa

revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('list_items', sa.Column('price', sa.Float(), nullable=True))
    op.add_column('list_items', sa.Column('price_per', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('list_items', sa.Column('price_store', sqlmodel.sql.sqltypes.AutoString(), nullable=True))

    # Migrate data: copy the latest price record per item into the new columns.
    # Uses correlated subqueries — compatible with both SQLite (tests) and PostgreSQL (prod).
    op.execute(sa.text("""
        UPDATE list_items
        SET
            price = (
                SELECT amount FROM price_records
                WHERE list_item_id = list_items.id
                ORDER BY recorded_at DESC LIMIT 1
            ),
            price_per = (
                SELECT price_per FROM price_records
                WHERE list_item_id = list_items.id
                ORDER BY recorded_at DESC LIMIT 1
            ),
            price_store = (
                SELECT store FROM price_records
                WHERE list_item_id = list_items.id
                ORDER BY recorded_at DESC LIMIT 1
            )
        WHERE id IN (SELECT DISTINCT list_item_id FROM price_records)
    """))

    op.drop_index('ix_price_records_list_item_id', table_name='price_records')
    op.drop_table('price_records')


def downgrade() -> None:
    op.create_table(
        'price_records',
        sa.Column('id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('list_item_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('ean', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('price_per', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('store', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('user_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['list_item_id'], ['list_items.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_price_records_list_item_id', 'price_records', ['list_item_id'])

    # Restore data: write one price_record per item that has a price set.
    # Uses added_by as user_id since the original recorder is no longer tracked.
    # Note: only the latest price is restored — historical records are not recoverable.
    op.execute(sa.text("""
        INSERT INTO price_records (id, list_item_id, ean, amount, price_per, store, user_id, recorded_at)
        SELECT
            lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
            substr(lower(hex(randomblob(2))), 2) || '-' ||
            substr('89ab', abs(random()) % 4 + 1, 1) ||
            substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
            id,
            ean,
            price,
            price_per,
            price_store,
            added_by,
            CURRENT_TIMESTAMP
        FROM list_items
        WHERE price IS NOT NULL
    """))

    op.drop_column('list_items', 'price_store')
    op.drop_column('list_items', 'price_per')
    op.drop_column('list_items', 'price')
```

- [ ] **Step 2: Run the migration**

```bash
cd backend
uv run alembic upgrade head
```

Expected: `Running upgrade e5f6a7b8c9d0 -> f7a8b9c0d1e2, move price fields to list_items, drop price_records`

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/f7a8b9c0d1e2_move_price_to_list_items.py
git commit -m "chore: add migration to move price fields to list_items and drop price_records"
```

---

### Task 2: Update ListItem model, remove PriceRecord

**Files:**
- Modify: `backend/app/db/models.py`
- Modify: `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_models.py`, add at the end:

```python
def test_list_item_has_price_fields():
    from app.db.models import ListItem
    item = ListItem(
        list_id="list-1",
        name="Leche",
        added_by="user-1",
        price=1.29,
        price_per=None,
        price_store="Mercadona",
    )
    assert item.price == 1.29
    assert item.price_store == "Mercadona"
    assert item.price_per is None


def test_price_record_does_not_exist():
    import app.db.models as m
    assert not hasattr(m, 'PriceRecord')
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_models.py::test_list_item_has_price_fields tests/test_models.py::test_price_record_does_not_exist -v
```

Expected: both FAIL

- [ ] **Step 3: Update `backend/app/db/models.py`**

In `ListItem`, after the `ean` field, add:

```python
price: Optional[float] = Field(default=None)
price_per: Optional[str] = Field(default=None)
price_store: Optional[str] = Field(default=None)
```

Delete the entire `PriceRecord` class.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
uv run pytest tests/test_models.py -v
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models.py backend/tests/test_models.py
git commit -m "feat: add price fields to ListItem, remove PriceRecord model"
```

---

### Task 3: Update price schemas

**Files:**
- Modify: `backend/app/schemas/prices.py`
- Modify: `backend/tests/test_prices_schemas.py`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `backend/tests/test_prices_schemas.py` with:

```python
from app.schemas.prices import PriceCreate, PriceEntry, PriceHistoryResponse


def test_price_create_defaults():
    p = PriceCreate(amount=1.99)
    assert p.price_per is None
    assert p.store is None


def test_price_create_kilogram():
    p = PriceCreate(amount=3.20, price_per="KILOGRAM", store="Mercadona")
    assert p.price_per == "KILOGRAM"
    assert p.store == "Mercadona"


def test_price_create_rejects_zero():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        PriceCreate(amount=0)


def test_price_history_response_structure():
    entry = PriceEntry(amount=1.99, price_per=None, store="Mercadona")
    resp = PriceHistoryResponse(entries=[entry], community_price=1.85, community_price_per=None)
    assert len(resp.entries) == 1
    assert resp.entries[0].amount == 1.99
    assert resp.community_price == 1.85


def test_price_history_empty():
    resp = PriceHistoryResponse(entries=[])
    assert resp.entries == []
    assert resp.community_price is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_prices_schemas.py -v
```

Expected: FAIL (imports `PriceEntry`, `PriceHistoryResponse` which don't exist yet)

- [ ] **Step 3: Replace `backend/app/schemas/prices.py`**

```python
from typing import Literal

from pydantic import BaseModel, Field


class PriceCreate(BaseModel):
    amount: float = Field(gt=0)
    price_per: Literal['KILOGRAM'] | None = None  # None = per unit, "KILOGRAM" = per kg
    store: str | None = None


class PriceEntry(BaseModel):
    amount: float
    price_per: str | None
    store: str | None


class PriceHistoryResponse(BaseModel):
    entries: list[PriceEntry]
    community_price: float | None = None
    community_price_per: str | None = None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
uv run pytest tests/test_prices_schemas.py -v
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/prices.py backend/tests/test_prices_schemas.py
git commit -m "feat: replace PriceRecordRead/StoreGroup schemas with PriceEntry/PriceHistoryResponse"
```

---

### Task 4: Add price fields to ItemRead

**Files:**
- Modify: `backend/app/schemas/items.py`
- Modify: `backend/tests/test_items.py`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_items.py`, add:

```python
def test_get_items_has_price_fields(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"})
    response = client.get(f"/lists/{lst['id']}/items")
    assert response.status_code == 200
    item = response.json()[0]
    assert "price" in item
    assert item["price"] is None
    assert "price_per" in item
    assert item["price_per"] is None
    assert "price_store" in item
    assert item["price_store"] is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
uv run pytest tests/test_items.py::test_get_items_has_price_fields -v
```

Expected: FAIL (`price` key missing from response)

- [ ] **Step 3: Add price fields to `ItemRead` in `backend/app/schemas/items.py`**

After the `ean` field, add:

```python
price: float | None
price_per: str | None
price_store: str | None
```

- [ ] **Step 4: Run all item tests**

```bash
cd backend
uv run pytest tests/test_items.py -v
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/items.py backend/tests/test_items.py
git commit -m "feat: add price, price_per, price_store fields to ItemRead"
```

---

### Task 5: Rewrite the prices router

**Files:**
- Modify: `backend/app/routers/prices.py`
- Modify: `backend/tests/test_prices.py`

`POST` creates the price (409 if already set); `PATCH` updates it (404 if not yet set).

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `backend/tests/test_prices.py` with:

```python
from fastapi.testclient import TestClient


def _make_list(client):
    return client.post("/lists", json={"name": "Shopping"}).json()


def _make_item(client, list_id, name="Leche", ean=None, brand=None):
    body = {"name": name}
    if ean:
        body["ean"] = ean
    if brand:
        body["brand"] = brand
    return client.post(f"/lists/{list_id}/items", json=body).json()


def _set_price(client, list_id, item_id, amount, store=None, price_per=None):
    return client.post(
        f"/lists/{list_id}/items/{item_id}/prices",
        json={"amount": amount, "store": store, "price_per": price_per},
    )


# --- POST (create) ---

def test_post_price_creates(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"], ean="8410188082498")

    resp = _set_price(client, lst["id"], item["id"], 0.89, store="Mercadona")
    assert resp.status_code == 201
    data = resp.json()
    assert data["amount"] == 0.89
    assert data["store"] == "Mercadona"
    assert data["price_per"] is None


def test_post_price_sets_item_fields(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.29, store="Lidl")

    resp = client.get(f"/lists/{lst['id']}/items")
    updated = next(i for i in resp.json() if i["id"] == item["id"])
    assert updated["price"] == 1.29
    assert updated["price_store"] == "Lidl"


def test_post_price_conflict_if_already_set(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.00)

    resp = _set_price(client, lst["id"], item["id"], 2.00)
    assert resp.status_code == 409


def test_post_price_non_member_forbidden(client: TestClient, other_client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    resp = other_client.post(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.0},
    )
    assert resp.status_code == 403


# --- PATCH (update) ---

def test_patch_price_updates(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.00, store="Lidl")

    resp = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.50, "store": "Carrefour"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount"] == 1.50
    assert data["store"] == "Carrefour"


def test_patch_price_updates_item_fields(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.00)

    client.patch(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 2.00, "store": "Mercadona"},
    )
    resp = client.get(f"/lists/{lst['id']}/items")
    updated = next(i for i in resp.json() if i["id"] == item["id"])
    assert updated["price"] == 2.00
    assert updated["price_store"] == "Mercadona"


def test_patch_price_not_found_if_no_price(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])

    resp = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 1.00},
    )
    assert resp.status_code == 404


def test_patch_price_non_member_forbidden(client: TestClient, other_client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.00)

    resp = other_client.patch(
        f"/lists/{lst['id']}/items/{item['id']}/prices",
        json={"amount": 2.00},
    )
    assert resp.status_code == 403


# --- GET (price history by scope) ---

def test_get_price_history_this_list_by_ean(client: TestClient):
    ean = "8410188011111"
    lst = _make_list(client)
    item1 = _make_item(client, lst["id"], name="Aceite", ean=ean)
    item2 = _make_item(client, lst["id"], name="Aceite extra", ean=ean)

    _set_price(client, lst["id"], item1["id"], 4.20, store="Mercadona")
    _set_price(client, lst["id"], item2["id"], 4.50, store="Carrefour")

    resp = client.get(f"/lists/{lst['id']}/items/{item1['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert stores == {"Mercadona", "Carrefour"}


def test_get_price_history_this_list_by_name_brand(client: TestClient):
    lst = _make_list(client)
    item1 = _make_item(client, lst["id"], name="Pan integral", brand="Bimbo")
    item2 = _make_item(client, lst["id"], name="Pan integral", brand="Bimbo")

    _set_price(client, lst["id"], item1["id"], 1.20, store="Lidl")
    _set_price(client, lst["id"], item2["id"], 1.35, store="Mercadona")

    resp = client.get(f"/lists/{lst['id']}/items/{item1['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert stores == {"Lidl", "Mercadona"}


def test_get_price_history_excludes_items_without_price(client: TestClient):
    ean = "8410188099999"
    lst = _make_list(client)
    item1 = _make_item(client, lst["id"], name="Leche", ean=ean)
    _make_item(client, lst["id"], name="Leche entera", ean=ean)  # no price logged

    _set_price(client, lst["id"], item1["id"], 0.89)

    resp = client.get(f"/lists/{lst['id']}/items/{item1['id']}/prices?scope=this_list")
    assert resp.status_code == 200
    assert len(resp.json()["entries"]) == 1


def test_get_price_history_my_lists_by_ean(client: TestClient):
    ean = "8410188022222"
    lst1 = _make_list(client)
    item1 = _make_item(client, lst1["id"], name="Aceite", ean=ean)
    _set_price(client, lst1["id"], item1["id"], 4.50, store="Mercadona")

    lst2 = client.post("/lists", json={"name": "Lista 2"}).json()
    item2 = _make_item(client, lst2["id"], name="Aceite oliva", ean=ean)
    _set_price(client, lst2["id"], item2["id"], 5.00, store="Carrefour")

    resp = client.get(f"/lists/{lst1['id']}/items/{item1['id']}/prices?scope=my_lists")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert "Mercadona" in stores
    assert "Carrefour" in stores


def test_get_price_history_my_lists_excludes_other_users(
    client: TestClient, other_client: TestClient
):
    ean = "8410188077777"
    lst_alice = _make_list(client)
    item_alice = _make_item(client, lst_alice["id"], name="Leche", ean=ean)
    _set_price(client, lst_alice["id"], item_alice["id"], 0.89, store="Mercadona")

    lst_bob = _make_list(other_client)
    item_bob = _make_item(other_client, lst_bob["id"], name="Leche", ean=ean)
    other_client.post(
        f"/lists/{lst_bob['id']}/items/{item_bob['id']}/prices",
        json={"amount": 0.79, "store": "Lidl"},
    )

    resp = client.get(f"/lists/{lst_alice['id']}/items/{item_alice['id']}/prices?scope=my_lists")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert "Mercadona" in stores
    assert "Lidl" not in stores


def test_get_price_history_all_includes_other_users(
    client: TestClient, other_client: TestClient
):
    ean = "8410188066666"
    lst_alice = _make_list(client)
    item_alice = _make_item(client, lst_alice["id"], name="Leche", ean=ean)
    _set_price(client, lst_alice["id"], item_alice["id"], 0.89, store="Mercadona")

    lst_bob = _make_list(other_client)
    item_bob = _make_item(other_client, lst_bob["id"], name="Leche", ean=ean)
    other_client.post(
        f"/lists/{lst_bob['id']}/items/{item_bob['id']}/prices",
        json={"amount": 0.79, "store": "Lidl"},
    )

    resp = client.get(f"/lists/{lst_alice['id']}/items/{item_alice['id']}/prices?scope=all")
    assert resp.status_code == 200
    stores = {e["store"] for e in resp.json()["entries"]}
    assert "Mercadona" in stores
    assert "Lidl" in stores


def test_get_price_history_invalid_scope(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=invalid")
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_prices.py -v
```

Expected: most FAIL (missing PATCH endpoint, wrong status codes, PriceRecord references)

- [ ] **Step 3: Replace `backend/app/routers/prices.py`**

```python
from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from app.db.models import ListItem, ListMember, PriceCache
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.prices import PriceCreate, PriceEntry, PriceHistoryResponse

router = APIRouter(prefix="/lists/{list_id}/items/{item_id}/prices", tags=["prices"])


def _get_item_or_404(session, item_id: str, list_id: str) -> ListItem:
    item = session.exec(select(ListItem).where(ListItem.id == item_id, ListItem.list_id == list_id)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _write_price(item: ListItem, price_in: PriceCreate, session) -> PriceEntry:
    item.price = price_in.amount
    item.price_per = price_in.price_per
    item.price_store = price_in.store
    session.add(item)
    session.commit()
    session.refresh(item)
    return PriceEntry(amount=item.price, price_per=item.price_per, store=item.price_store)


@router.post("", response_model=PriceEntry, status_code=status.HTTP_201_CREATED)
def create_price(
    list_id: str,
    item_id: str,
    price_in: PriceCreate,
    session: CurrentSession,
    current_user: CurrentUser,
    _: MemberDep,
):
    item = _get_item_or_404(session, item_id, list_id)
    if item.price is not None:
        raise HTTPException(status_code=409, detail="Item already has a price; use PATCH to update it")
    return _write_price(item, price_in, session)


@router.patch("", response_model=PriceEntry)
def update_price(
    list_id: str,
    item_id: str,
    price_in: PriceCreate,
    session: CurrentSession,
    current_user: CurrentUser,
    _: MemberDep,
):
    item = _get_item_or_404(session, item_id, list_id)
    if item.price is None:
        raise HTTPException(status_code=404, detail="Item has no price yet; use POST to set it")
    return _write_price(item, price_in, session)


@router.get("", response_model=PriceHistoryResponse)
def get_price_history(
    list_id: str,
    item_id: str,
    scope: str = Query(default="this_list", pattern="^(this_list|my_lists|all)$"),
    session: CurrentSession = None,
    current_user: CurrentUser = None,
    _: MemberDep = None,
):
    item = _get_item_or_404(session, item_id, list_id)

    community_price, community_price_per = None, None
    if item.ean:
        cached = session.exec(select(PriceCache).where(PriceCache.ean == item.ean)).first()
        if cached:
            community_price = cached.amount
            community_price_per = cached.price_per

    items = _query_by_scope(session, item, scope, current_user.id)
    entries = [PriceEntry(amount=i.price, price_per=i.price_per, store=i.price_store) for i in items]
    return PriceHistoryResponse(
        entries=entries,
        community_price=community_price,
        community_price_per=community_price_per,
    )


def _query_by_scope(session, item: ListItem, scope: str, user_id: str) -> list[ListItem]:
    base = _base_conditions(item)

    if scope == "this_list":
        return list(session.exec(
            select(ListItem).where(ListItem.list_id == item.list_id, *base)
        ).all())

    if scope == "my_lists":
        my_list_ids = list(session.exec(
            select(ListMember.list_id).where(ListMember.user_id == user_id)
        ).all())
        return list(session.exec(
            select(ListItem).where(ListItem.list_id.in_(my_list_ids), *base)
        ).all())

    # scope == "all"
    return list(session.exec(select(ListItem).where(*base)).all())


def _base_conditions(item: ListItem):
    has_price = ListItem.price.isnot(None)
    if item.ean:
        return (ListItem.ean == item.ean, has_price)
    return (ListItem.name == item.name, ListItem.brand == item.brand, has_price)
```

- [ ] **Step 4: Run the full test suite**

```bash
cd backend
uv run pytest -v
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/prices.py backend/tests/test_prices.py
git commit -m "feat: rewrite prices router with POST/PATCH semantics and scope-based history"
```

---

### Task 6: Final verification

- [ ] **Step 1: Check for any remaining PriceRecord references**

```bash
grep -rn "PriceRecord" backend/tests/ backend/app/
```

Expected: no output

- [ ] **Step 2: Verify migration round-trips**

```bash
cd backend
uv run alembic downgrade -1
uv run alembic upgrade head
```

Expected: both succeed without errors

- [ ] **Step 3: Run full test suite**

```bash
cd backend
uv run pytest -v
```

Expected: all PASS
