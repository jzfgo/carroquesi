# Multi-store per list item — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `store: string | null` field on list items with `stores: string[]`, allowing users to associate an item with multiple stores.

**Architecture:** JSON column in Postgres (maps to TEXT in SQLite so tests are unaffected), schema change propagated through FastAPI schemas and the React frontend in one coordinated update. New `StoreEditSheet` component handles the multi-store editing UX; `BarcodeScanSheet` gets selectable store chips; `parseInput` collects all `@token` occurrences into a list.

**Tech Stack:** Python/FastAPI/SQLModel/Alembic (backend), React/TypeScript/Vitest (frontend)

---

## File map

| File | Change |
|---|---|
| `backend/alembic/versions/<new>.py` | New migration: add `stores` JSON, backfill, drop `store` |
| `backend/app/db/models.py` | `store: Optional[str]` → `stores: list[str]` |
| `backend/app/schemas/items.py` | `store: str|None` → `stores: list[str]` in all three classes |
| `backend/app/schemas/suggestions.py` | `store: str|None` → `stores: list[str]` |
| `backend/app/routers/items.py` | Drop `sort=store` support |
| `backend/app/routers/suggestions.py` | Select `stores` instead of `store` |
| `backend/tests/test_items.py` | Update fixtures and assertions |
| `backend/tests/test_suggestions.py` | Update fixtures and assertions |
| `frontend/src/types.ts` | `store → stores` on `ListItem`, `ParsedInput`, `Suggestion`; `TagField` removes `'store'`; `EditingTag.field` becomes `TagField | 'stores'` |
| `frontend/src/parseInput.ts` | Collect multiple `@` into `stores: string[]` |
| `frontend/src/parseInput.test.ts` | Update all fixtures + add multi-store tests |
| `frontend/src/lib/suggestions.ts` | Support `stores` field (flatten array) |
| `frontend/src/lib/suggestions.test.ts` | Update + add stores test |
| `frontend/src/lib/api.ts` | `store → stores` in `createItem` / `updateItem` payloads |
| `frontend/src/hooks/useListItems.ts` | `store → stores` in `addItem`; add `updateStores` |
| `frontend/src/components/StoreFilter.tsx` | Flatten `item.stores[]` to build unique store list |
| `frontend/src/components/StoreFilter.test.tsx` | Update fixtures |
| `frontend/src/components/ListScreen.tsx` | Filter predicate + `handleScanAdd` + dispatch to `StoreEditSheet` + `updateStores` |
| `frontend/src/components/ItemCard.tsx` | Render `item.stores[]` as chips; remove store from `TAG_CONFIG` |
| `frontend/src/components/ItemCard.test.tsx` | Update fixtures + add multi-store rendering test |
| `frontend/src/components/StoreEditSheet.tsx` | **New** — add/remove individual store chips |
| `frontend/src/components/StoreEditSheet.css` | **New** — styles for new sheet |
| `frontend/src/components/StoreEditSheet.test.tsx` | **New** — full test suite |
| `frontend/src/components/TagEditSheet.tsx` | Remove `store` from `TAG_META` and `tagValues` |
| `frontend/src/components/TagEditSheet.test.tsx` | Update `BASE_ITEM` fixture |
| `frontend/src/components/SmartInputBar.tsx` | Multiple `@` allowed; preview renders all stores |
| `frontend/src/components/SmartInputBar.test.tsx` | Update store fixture + add multi-store test |
| `frontend/src/components/BarcodeScanSheet.tsx` | Selectable store chips; `onAdd` receives `stores: string[]` |
| `frontend/src/components/BarcodeScanSheet.test.tsx` | Update tests for new selection behaviour |

---

## Task 1: Alembic migration

**Files:**
- Create: `backend/alembic/versions/<generated_id>_list_items_store_to_stores.py`

- [ ] **Step 1: Generate migration skeleton**

```bash
cd backend
uv run alembic revision --autogenerate -m "list_items_store_to_stores"
```

Alembic will create a file under `alembic/versions/`. Open it — it will contain `op.add_column` for `stores` and `op.drop_column` for `store`. We need to add a data migration step between those two operations.

- [ ] **Step 2: Edit the generated migration**

Replace the `upgrade` and `downgrade` functions with the following. The key steps are: (1) add the column as nullable, (2) backfill all rows, (3) make it non-null, (4) drop the old column.

```python
def upgrade() -> None:
    # 1. Add stores as nullable first so existing rows are not rejected
    op.add_column(
        'list_items',
        sa.Column('stores', sa.JSON(), nullable=True),
    )
    # 2. Backfill: single store → one-element list; NULL → empty list
    op.execute(
        "UPDATE list_items SET stores = json_build_array(store) WHERE store IS NOT NULL"
    )
    op.execute(
        "UPDATE list_items SET stores = '[]'::json WHERE store IS NULL"
    )
    # 3. Enforce NOT NULL now that every row has a value
    op.alter_column('list_items', 'stores', nullable=False)
    # 4. Drop the old column
    op.drop_column('list_items', 'store')


def downgrade() -> None:
    op.add_column(
        'list_items',
        sa.Column('store', sa.String(), nullable=True),
    )
    # Restore first element of array as the single store value
    op.execute(
        "UPDATE list_items SET store = stores->>0 WHERE json_array_length(stores) > 0"
    )
    op.drop_column('list_items', 'stores')
```

- [ ] **Step 3: Verify migration runs**

```bash
cd backend
uv run alembic upgrade head
```

Expected: migration completes without error. (Requires a local Postgres instance with the previous schema.)

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/
git commit -m "feat: migration — list_items store → stores (JSON array)"
```

---

## Task 2: Backend model + schemas

**Files:**
- Modify: `backend/app/db/models.py:55`
- Modify: `backend/app/schemas/items.py`
- Modify: `backend/app/schemas/suggestions.py`

- [ ] **Step 1: Write failing tests for new schema shape**

In `backend/tests/test_items.py`, add at the bottom:

```python
def test_add_item_with_multiple_stores(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "stores": ["Mercadona", "Carrefour"]},
    )
    assert response.status_code == 201
    assert response.json()["stores"] == ["Mercadona", "Carrefour"]


def test_update_item_stores(client: TestClient):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"}).json()
    response = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"stores": ["Lidl"]},
    )
    assert response.status_code == 200
    assert response.json()["stores"] == ["Lidl"]


def test_update_item_clears_stores(client: TestClient):
    lst = _create_list(client)
    item = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "stores": ["Mercadona"]},
    ).json()
    response = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"stores": []},
    )
    assert response.status_code == 200
    assert response.json()["stores"] == []
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend
uv run pytest tests/test_items.py::test_add_item_with_multiple_stores tests/test_items.py::test_update_item_stores tests/test_items.py::test_update_item_clears_stores -v
```

Expected: FAIL — 422 Unprocessable Entity (field `stores` not accepted yet).

- [ ] **Step 3: Update the model**

In `backend/app/db/models.py`, add imports after the existing imports block:

```python
from sqlalchemy import Column, JSON
```

Replace line 55:
```python
    store: Optional[str] = None
```
with:
```python
    stores: list[str] = Field(default_factory=list, sa_column=Column(JSON))
```

- [ ] **Step 4: Update ItemCreate, ItemUpdate, ItemRead schemas**

Replace `backend/app/schemas/items.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    quantity: str | None = None
    brand: str | None = None
    variety: str | None = None
    stores: list[str] = []


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    quantity: str | None = None
    brand: str | None = None
    variety: str | None = None
    stores: list[str] | None = None  # None = don't touch; [] = remove all
    purchased: bool | None = None


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: str | None
    brand: str | None
    variety: str | None
    stores: list[str]
    purchased: bool
    added_by: str
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 5: Update SuggestionRead schema**

Replace `backend/app/schemas/suggestions.py`:

```python
from pydantic import BaseModel


class SuggestionRead(BaseModel):
    name: str
    brand: str | None
    variety: str | None
    stores: list[str]
```

- [ ] **Step 6: Run new tests**

```bash
cd backend
uv run pytest tests/test_items.py::test_add_item_with_multiple_stores tests/test_items.py::test_update_item_stores tests/test_items.py::test_update_item_clears_stores -v
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/db/models.py backend/app/schemas/items.py backend/app/schemas/suggestions.py
git commit -m "feat: model and schemas — store → stores (list[str])"
```

---

## Task 3: Backend router cleanup

**Files:**
- Modify: `backend/app/routers/items.py`
- Modify: `backend/app/routers/suggestions.py`

- [ ] **Step 1: Update items router**

Replace the entire `backend/app/routers/items.py`:

```python
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select

from app.db.models import List, ListItem
from app.dependencies import CurrentSession, MemberDep
from app.schemas.items import ItemCreate, ItemRead, ItemUpdate

router = APIRouter(prefix="/lists/{list_id}/items", tags=["items"])


def _bump(lst: List, session: Session) -> None:
    lst.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(lst)


@router.get("", response_model=list[ItemRead])
def get_items(
    list_id: str,
    list_and_user: MemberDep,
    session: CurrentSession,
    sort: str | None = None,
):
    lst, _ = list_and_user
    query = select(ListItem).where(ListItem.list_id == lst.id)
    if sort == "name":
        query = query.order_by(ListItem.name)
    elif sort == "brand":
        query = query.order_by(ListItem.brand)
    return session.exec(query).all()


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def add_item(
    body: ItemCreate,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, current_user = list_and_user
    item = ListItem(list_id=lst.id, added_by=current_user.id, **body.model_dump())
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/{item_id}", response_model=ItemRead)
def update_item(
    item_id: str,
    body: ItemUpdate,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: str,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    item = session.get(ListItem, item_id)
    if item is None or item.list_id != lst.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    session.delete(item)
    _bump(lst, session)
    session.commit()
```

- [ ] **Step 2: Update suggestions router**

Replace the entire `backend/app/routers/suggestions.py`. The key change is replacing `ListItem.store` with `ListItem.stores` in the subquery and the result construction:

```python
from typing import Annotated

from fastapi import APIRouter, Query
from sqlmodel import func, select

from app.db.models import ListItem, ListMember
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.suggestions import SuggestionRead

router = APIRouter(tags=["suggestions"])


@router.get("/suggestions", response_model=list[SuggestionRead])
def get_suggestions(
    q: Annotated[str, Query(min_length=1)],
    current_user: CurrentUser,
    session: CurrentSession,
):
    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    list_ids = [m.list_id for m in memberships]

    if not list_ids:
        return []

    escaped_q = q.lower().replace("%", "\\%").replace("_", "\\_")

    subq = (
        select(
            ListItem.name,
            ListItem.brand,
            ListItem.variety,
            ListItem.stores,
            func.row_number()
            .over(
                partition_by=func.lower(ListItem.name),
                order_by=ListItem.created_at.desc(),
            )
            .label("rn"),
        )
        .where(
            ListItem.list_id.in_(list_ids),
            func.lower(ListItem.name).like(
                f"{escaped_q}%",
                escape="\\",
            ),
        )
        .subquery()
    )

    rows = session.execute(
        select(subq.c.name, subq.c.brand, subq.c.variety, subq.c.stores)
        .where(subq.c.rn == 1)
        .order_by(subq.c.name.asc())
        .limit(10)
    ).all()

    return [
        SuggestionRead(
            name=r.name,
            brand=r.brand,
            variety=r.variety,
            stores=r.stores if r.stores is not None else [],
        )
        for r in rows
    ]


@router.get("/lists/{list_id}/updated-at")
def get_updated_at(list_and_user: MemberDep):
    lst, _ = list_and_user
    return {"updated_at": lst.updated_at.isoformat()}
```

- [ ] **Step 3: Run all backend tests — expect failures in existing tests**

```bash
cd backend
uv run pytest -v
```

Existing tests that send `"store": "..."` in request bodies or check `suggestion["store"]` will fail. Proceed to Task 4.

---

## Task 4: Fix backend tests

**Files:**
- Modify: `backend/tests/test_items.py`
- Modify: `backend/tests/test_suggestions.py`

- [ ] **Step 1: Replace test_items.py**

```python
from fastapi.testclient import TestClient
from sqlmodel import Session


def _create_list(client):
    return client.post("/lists", json={"name": "Shopping"}).json()


def test_add_item(client: TestClient):
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"})
    assert response.status_code == 201
    assert response.json()["name"] == "Milk"
    assert response.json()["purchased"] is False
    assert response.json()["stores"] == []


def test_get_items(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Eggs"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Butter"})
    response = client.get(f"/lists/{lst['id']}/items")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_items_sorted_by_name(client: TestClient):
    lst = _create_list(client)
    client.post(f"/lists/{lst['id']}/items", json={"name": "Zucchini"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Apple"})
    response = client.get(f"/lists/{lst['id']}/items?sort=name")
    names = [i["name"] for i in response.json()]
    assert names == sorted(names)


def test_update_item_marks_purchased(client: TestClient):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    assert response.status_code == 200
    assert response.json()["purchased"] is True


def test_delete_item(client: TestClient, session: Session):
    from app.db.models import ListItem
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "To Delete"}).json()
    response = client.delete(f"/lists/{lst['id']}/items/{item['id']}")
    assert response.status_code == 204
    assert session.get(ListItem, item["id"]) is None


def test_non_member_cannot_add_item(other_client: TestClient, client: TestClient):
    lst = client.post("/lists", json={"name": "Private"}).json()
    response = other_client.post(f"/lists/{lst['id']}/items", json={"name": "Hack"})
    assert response.status_code == 403


def test_add_item_bumps_updated_at(client: TestClient, session: Session):
    from app.db.models import List
    lst = _create_list(client)
    old_updated_at = session.get(List, lst["id"]).updated_at
    client.post(f"/lists/{lst['id']}/items", json={"name": "Tomato"})
    session.expire_all()
    new_updated_at = session.get(List, lst["id"]).updated_at
    assert new_updated_at >= old_updated_at


def test_add_item_with_multiple_stores(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "stores": ["Mercadona", "Carrefour"]},
    )
    assert response.status_code == 201
    assert response.json()["stores"] == ["Mercadona", "Carrefour"]


def test_update_item_stores(client: TestClient):
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"}).json()
    response = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"stores": ["Lidl"]},
    )
    assert response.status_code == 200
    assert response.json()["stores"] == ["Lidl"]


def test_update_item_clears_stores(client: TestClient):
    lst = _create_list(client)
    item = client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "stores": ["Mercadona"]},
    ).json()
    response = client.patch(
        f"/lists/{lst['id']}/items/{item['id']}",
        json={"stores": []},
    )
    assert response.status_code == 200
    assert response.json()["stores"] == []
```

- [ ] **Step 2: Replace test_suggestions.py**

```python
from fastapi.testclient import TestClient
from sqlmodel import Session


def test_suggestions_returns_matching_names(client: TestClient):
    lst = client.post("/lists", json={"name": "List"}).json()
    client.post(f"/lists/{lst['id']}/items", json={"name": "Milk", "brand": "Pascual"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Mineral Water"})
    client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"})

    response = client.get("/suggestions?q=mi")
    assert response.status_code == 200
    names = [s["name"] for s in response.json()]
    assert "Milk" in names
    assert "Mineral Water" in names
    assert "Bread" not in names


def test_suggestions_includes_hints(client: TestClient):
    lst = client.post("/lists", json={"name": "List"}).json()
    client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "brand": "Pascual", "stores": ["Mercadona"]},
    )

    response = client.get("/suggestions?q=Milk")
    assert response.status_code == 200
    suggestion = next(s for s in response.json() if s["name"] == "Milk")
    assert suggestion["brand"] == "Pascual"
    assert suggestion["stores"] == ["Mercadona"]


def test_suggestions_returns_multiple_stores(client: TestClient):
    lst = client.post("/lists", json={"name": "List"}).json()
    client.post(
        f"/lists/{lst['id']}/items",
        json={"name": "Milk", "stores": ["Mercadona", "Carrefour"]},
    )

    response = client.get("/suggestions?q=Milk")
    assert response.status_code == 200
    suggestion = next(s for s in response.json() if s["name"] == "Milk")
    assert suggestion["stores"] == ["Mercadona", "Carrefour"]


def test_suggestions_limited_to_current_membership(
    client: TestClient, other_client: TestClient, session: Session
):
    other_lst = other_client.post("/lists", json={"name": "Other"}).json()
    other_client.post(f"/lists/{other_lst['id']}/items", json={"name": "SecretItem"})

    response = client.get("/suggestions?q=Secret")
    names = [s["name"] for s in response.json()]
    assert "SecretItem" not in names


def test_polling_updated_at(client: TestClient):
    lst = client.post("/lists", json={"name": "Polling Test"}).json()
    response = client.get(f"/lists/{lst['id']}/updated-at")
    assert response.status_code == 200
    assert "updated_at" in response.json()


def test_polling_updated_at_changes_after_item_add(client: TestClient):
    import time
    lst = client.post("/lists", json={"name": "Polling Test"}).json()
    before = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]
    time.sleep(0.01)
    client.post(f"/lists/{lst['id']}/items", json={"name": "New Item"})
    after = client.get(f"/lists/{lst['id']}/updated-at").json()["updated_at"]
    assert after > before
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend
uv run pytest -v
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/items.py backend/app/routers/suggestions.py \
        backend/tests/test_items.py backend/tests/test_suggestions.py
git commit -m "feat: backend routers and tests updated for multi-store"
```

---

## Task 5: Frontend types + parseInput + suggestions

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/parseInput.ts`
- Modify: `frontend/src/lib/suggestions.ts`
- Modify: `frontend/src/parseInput.test.ts`

- [ ] **Step 1: Replace parseInput.test.ts with failing tests**

```typescript
import { parseInput } from './parseInput'

describe('parseInput', () => {
  test('empty string returns empty ParsedInput', () => {
    expect(parseInput('')).toEqual({ name: '', quantity: null, variety: null, brand: null, stores: [] })
  })

  test('plain name with no sigils', () => {
    expect(parseInput('Leche entera')).toEqual({
      name: 'Leche entera', quantity: null, variety: null, brand: null, stores: [],
    })
  })

  test('name + single-word quantity', () => {
    const result = parseInput('Leche +3')
    expect(result.name).toBe('Leche')
    expect(result.quantity).toBe('3')
  })

  test('multi-word quantity: +1 bolsa', () => {
    const result = parseInput('Tomates +1 bolsa')
    expect(result.name).toBe('Tomates')
    expect(result.quantity).toBe('1 bolsa')
  })

  test('multi-word quantity: +6 litros de leche', () => {
    const result = parseInput('Agua +6 litros de leche')
    expect(result.quantity).toBe('6 litros de leche')
  })

  test('single store sigil', () => {
    const result = parseInput('Leche entera +3 *Desnatada #Puleva @Mercadona')
    expect(result.name).toBe('Leche entera')
    expect(result.quantity).toBe('3')
    expect(result.variety).toBe('Desnatada')
    expect(result.brand).toBe('Puleva')
    expect(result.stores).toEqual(['Mercadona'])
  })

  test('two store sigils produce two entries', () => {
    const result = parseInput('Leche @Mercadona @Carrefour')
    expect(result.name).toBe('Leche')
    expect(result.stores).toEqual(['Mercadona', 'Carrefour'])
  })

  test('three store sigils', () => {
    const result = parseInput('Leche @Mercadona @Carrefour @Lidl')
    expect(result.stores).toEqual(['Mercadona', 'Carrefour', 'Lidl'])
  })

  test('multi-word first store then second store', () => {
    const result = parseInput('Jamón @El Corte Inglés @Mercadona')
    expect(result.stores).toEqual(['El Corte Inglés', 'Mercadona'])
  })

  test('sigils in any order — single store', () => {
    const result = parseInput('Leche @Mercadona #Puleva *Entera +2')
    expect(result.name).toBe('Leche')
    expect(result.stores).toEqual(['Mercadona'])
    expect(result.brand).toBe('Puleva')
    expect(result.variety).toBe('Entera')
    expect(result.quantity).toBe('2')
  })

  test('multi-word store: @El Corte Inglés', () => {
    const result = parseInput('Jamón @El Corte Inglés')
    expect(result.name).toBe('Jamón')
    expect(result.stores).toEqual(['El Corte Inglés'])
  })

  test('first occurrence of same sigil wins for non-@ sigils', () => {
    const result = parseInput('Leche +2 +3')
    expect(result.quantity).toBe('2')
  })

  test('subsequent same non-@ sigil is ignored even with multi-word tokens', () => {
    const result = parseInput('Pan #Bimbo extra #Hacendado')
    expect(result.brand).toBe('Bimbo extra')
  })

  test('word starting with sigil is never part of name', () => {
    const result = parseInput('+2')
    expect(result.name).toBe('')
    expect(result.quantity).toBe('2')
  })

  test('trailing partial store token (typing in progress)', () => {
    const result = parseInput('Leche +3 @Mer')
    expect(result.stores).toEqual(['Mer'])
  })

  test('only whitespace returns empty', () => {
    expect(parseInput('   ')).toEqual({ name: '', quantity: null, variety: null, brand: null, stores: [] })
  })
})
```

- [ ] **Step 2: Update types.ts**

```typescript
export interface ListItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  brand: string | null
  variety: string | null
  stores: string[]
  purchased: boolean
  added_by: string
  created_at: string
  updated_at: string
}

export interface ParsedInput {
  name: string
  quantity: string | null
  variety: string | null
  brand: string | null
  stores: string[]
}

export interface Member {
  id: string
  displayName: string
  initial: string
  colour: string
  photoUrl: string | null
}

export interface Suggestion {
  name: string
  brand: string | null
  variety: string | null
  stores: string[]
}

export interface BarcodeRead {
  name: string
  brand: string | null
  stores: string[]
}

export type TagField = 'variety' | 'brand' | 'quantity'

export interface EditingTag {
  itemId: string
  field: TagField | 'stores'
}

export interface ApiList {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
  item_count: number
  purchased_count: number
}
```

- [ ] **Step 3: Replace parseInput.ts**

```typescript
import type { ParsedInput } from './types'

const SINGLE_SIGIL_MAP: Record<string, keyof Omit<ParsedInput, 'name' | 'stores'>> = {
  '+': 'quantity',
  '*': 'variety',
  '#': 'brand',
}

export function parseInput(raw: string): ParsedInput {
  const words = raw.trim().split(/\s+/).filter(Boolean)

  const result: ParsedInput = { name: '', quantity: null, variety: null, brand: null, stores: [] }
  const nameWords: string[] = []

  let currentField: keyof Omit<ParsedInput, 'name' | 'stores'> | '@' | null = null
  const tokenWords: Record<string, string[]> = {}
  const storeEntries: string[][] = []

  for (const word of words) {
    const sigil = word[0]

    if (sigil === '@') {
      storeEntries.push([word.slice(1)])
      currentField = '@'
    } else if (sigil in SINGLE_SIGIL_MAP) {
      const field = SINGLE_SIGIL_MAP[sigil]
      if (!(field in tokenWords)) {
        tokenWords[field] = [word.slice(1)]
      }
      currentField = field
    } else if (currentField === '@') {
      storeEntries[storeEntries.length - 1].push(word)
    } else if (currentField) {
      tokenWords[currentField as string].push(word)
    } else {
      nameWords.push(word)
    }
  }

  result.name = nameWords.join(' ')

  for (const [field, parts] of Object.entries(tokenWords)) {
    if (parts.length > 0 && parts.join('').length > 0) {
      (result as unknown as Record<string, unknown>)[field] = parts.join(' ')
    }
  }

  result.stores = storeEntries
    .map(parts => parts.join(' ').trim())
    .filter(s => s.length > 0)

  return result
}
```

- [ ] **Step 4: Replace lib/suggestions.ts**

```typescript
import type { ListItem } from '../types'

export function clientSideSuggestions(
  items: ListItem[],
  field: 'variety' | 'brand' | 'stores',
  partial: string,
): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  for (const item of items) {
    const vals: (string | null)[] =
      field === 'stores' ? item.stores : [item[field]]
    for (const val of vals) {
      if (val && val.toLowerCase().startsWith(partial.toLowerCase()) && !seen.has(val)) {
        seen.add(val)
        results.push(val)
      }
    }
  }
  return results.slice(0, 5)
}
```

- [ ] **Step 5: Run parseInput tests**

```bash
cd frontend
npx vitest run src/parseInput.test.ts
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/parseInput.ts frontend/src/lib/suggestions.ts \
        frontend/src/parseInput.test.ts
git commit -m "feat: frontend types, parseInput, suggestions — multi-store"
```

---

## Task 6: Frontend api.ts + useListItems

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useListItems.ts`

- [ ] **Step 1: Update createItem and updateItem in api.ts**

In `frontend/src/lib/api.ts`, replace `createItem`:

```typescript
export function createItem(
  getToken: () => Promise<string>,
  listId: string,
  payload: {
    name: string
    quantity?: string | null
    brand?: string | null
    variety?: string | null
    stores?: string[]
  },
) {
  return apiFetch(getToken, `/lists/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
```

Replace `updateItem`:

```typescript
export function updateItem(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
  patch: Partial<{
    purchased: boolean
    name: string
    quantity: string | null
    brand: string | null
    variety: string | null
    stores: string[]
  }>,
) {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}
```

- [ ] **Step 2: Update useListItems.ts**

In `frontend/src/hooks/useListItems.ts`:

**2a.** In `addItem`, change the `temp` object and `createItem` call:

```typescript
// In temp ListItem:
stores: parsed.stores,   // was: store: parsed.store

// In createItem call:
stores: parsed.stores,   // was: store: parsed.store
```

**2b.** Add `updateStores` after `updateTag`:

```typescript
  const updateStores = useCallback(
    async (itemId: string, stores: string[]) => {
      const snapshot = itemsRef.current
      setItems(snapshot.map((i) => (i.id === itemId ? { ...i, stores } : i)))
      try {
        await updateItem(getToken, listId, itemId, { stores })
      } catch {
        setItems(snapshot)
        showToast('No se pudo actualizar el producto')
      }
    },
    [getToken, listId, showToast],
  )
```

**2c.** Add `updateStores` to the return object:

```typescript
  return {
    status, items, members,
    togglePurchased, addItem, updateTag, updateStores,
    renameItem, removeItem, retry: fetchAll,
  }
```

- [ ] **Step 3: Run typecheck**

```bash
cd frontend
npm run typecheck 2>&1 | grep -v "node_modules" | head -40
```

Errors will appear in components that still reference `store` — those are fixed in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useListItems.ts
git commit -m "feat: api and useListItems updated for multi-store"
```

---

## Task 7: StoreFilter + ListScreen

**Files:**
- Modify: `frontend/src/components/StoreFilter.test.tsx`
- Modify: `frontend/src/components/ListScreen.tsx`

- [ ] **Step 1: Update StoreFilter test fixtures**

Open `frontend/src/components/StoreFilter.test.tsx`. Find every `ListItem`-shaped object and change `store: 'X'` to `stores: ['X']` and `store: null` to `stores: []`. Run:

```bash
cd frontend
npx vitest run src/components/StoreFilter.test.tsx
```

Fix until green.

- [ ] **Step 2: Update ListScreen.tsx**

Make five targeted changes:

**2a.** Add import for `StoreEditSheet` at the top:
```typescript
import { StoreEditSheet } from './StoreEditSheet'
```

**2b.** Destructure `updateStores` from the hook:
```typescript
  const { status, items, members, togglePurchased, addItem, updateTag, updateStores, renameItem, removeItem, retry } =
    useListItems(listId, getToken, setToast)
```

**2c.** Replace `handleScanAdd`:
```typescript
  const handleScanAdd = useCallback((item: { name: string; brand: string | null; stores: string[] }) => {
    setScannedProduct(null)
    void addItem({ name: item.name, brand: item.brand, stores: item.stores, quantity: null, variety: null })
  }, [addItem])
```

**2d.** Replace the `stores` memo:
```typescript
  const stores = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of items) {
      for (const s of item.stores) {
        if (!seen.has(s)) {
          seen.add(s)
          result.push(s)
        }
      }
    }
    return result.sort()
  }, [items])
```

**2e.** Replace the `filteredItems` line:
```typescript
  const filteredItems = activeStore
    ? items.filter(i => i.stores.includes(activeStore) || i.stores.length === 0)
    : items
```

**2f.** Replace the `editingTag` JSX block (the IIFE that renders TagEditSheet) with:
```typescript
      {editingTag && (() => {
        const editedItem = items.find(i => i.id === editingTag.itemId)
        if (!editedItem) return null
        if (editingTag.field === 'stores') {
          return (
            <StoreEditSheet
              key={editingTag.itemId}
              item={editedItem}
              items={items}
              onSave={(stores) => { void updateStores(editingTag.itemId, stores); setEditingTag(null) }}
              onClose={() => setEditingTag(null)}
            />
          )
        }
        return (
          <TagEditSheet
            key={`${editingTag.itemId}-${editingTag.field}`}
            item={editedItem}
            field={editingTag.field}
            items={items}
            onSave={(value) => { void updateTag(editingTag.itemId, editingTag.field, value); setEditingTag(null) }}
            onClose={() => setEditingTag(null)}
          />
        )
      })()}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StoreFilter.test.tsx frontend/src/components/ListScreen.tsx
git commit -m "feat: StoreFilter and ListScreen updated for multi-store"
```

---

## Task 8: ItemCard

**Files:**
- Modify: `frontend/src/components/ItemCard.tsx`
- Modify: `frontend/src/components/ItemCard.test.tsx`

- [ ] **Step 1: Update test fixtures and add new tests**

In `frontend/src/components/ItemCard.test.tsx`:

Change `BASE_ITEM`:
```typescript
const BASE_ITEM: ListItem = {
  id: 'i1', list_id: 'l1',
  name: 'Leche', quantity: '2 unidades',
  variety: 'Entera', brand: 'Hacendado', stores: ['Mercadona'],
  purchased: false, added_by: 'user-1',
  created_at: '', updated_at: '',
}
```

Change the two tests that use `store: null` to use `stores: []`.

Add at the bottom:
```typescript
test('renders multiple store chips when item has multiple stores', () => {
  const item = { ...BASE_ITEM, stores: ['Mercadona', 'Carrefour'] }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} />)
  expect(screen.getByText(/Mercadona/)).toBeInTheDocument()
  expect(screen.getByText(/Carrefour/)).toBeInTheDocument()
})

test('tapping a store chip calls onTagClick with stores field', () => {
  const handler = vi.fn()
  const item = { ...BASE_ITEM, stores: ['Mercadona'] }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} onMenuOpen={() => {}} />)
  fireEvent.click(screen.getByText(/Mercadona/))
  expect(handler).toHaveBeenCalledWith('i1', 'stores')
})
```

- [ ] **Step 2: Run to verify failures**

```bash
cd frontend
npx vitest run src/components/ItemCard.test.tsx
```

- [ ] **Step 3: Replace ItemCard.tsx**

```typescript
import './ItemCard.css'
import type { ListItem, Member, TagField } from '../types'

const TAG_CONFIG: { field: TagField; emoji: string; label: string }[] = [
  { field: 'variety', emoji: '✨', label: 'variedad' },
  { field: 'brand',   emoji: '🏷️', label: 'marca' },
]

interface Props {
  item: ListItem
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField | 'stores') => void
  onMenuOpen: (itemId: string) => void
}

export function ItemCard({ item, members, onTogglePurchased, onTagClick, onMenuOpen }: Props) {
  const member = members.get(item.added_by)
  const initial = member?.initial ?? '?'
  const colour  = member?.colour ?? '#b0adb5'

  return (
    <div className={`item-card${item.purchased ? ' item-card--purchased' : ''}`}>
      <button
        role="checkbox"
        aria-checked={item.purchased}
        className="item-card__checkbox"
        onClick={() => onTogglePurchased(item.id)}
        aria-label={item.purchased ? 'Marcar como no comprado' : 'Marcar como comprado'}
      />

      <div className="item-card__body">
        <div className="item-card__name-row">
          <span className="item-card__name">{item.name}</span>
          {item.quantity ? (
            <button
              className="item-card__qty"
              onClick={() => onTagClick(item.id, 'quantity')}
              aria-label={item.quantity}
            >
              {item.quantity}
            </button>
          ) : (
            <button
              className="item-card__tag item-card__tag--cta"
              onClick={() => onTagClick(item.id, 'quantity')}
              aria-label="Añadir cantidad"
            >
              <span aria-hidden>+ 🔢</span>
            </button>
          )}
        </div>

        <div className="item-card__tags">
          {TAG_CONFIG.map(({ field, emoji, label }) =>
            item[field] ? (
              <button
                key={field}
                className="item-card__tag"
                onClick={() => onTagClick(item.id, field)}
              >
                <span aria-hidden>{emoji}</span> {item[field]}
              </button>
            ) : (
              <button
                key={field}
                className="item-card__tag item-card__tag--cta"
                onClick={() => onTagClick(item.id, field)}
                aria-label={`Añadir ${label}`}
              >
                <span aria-hidden>+ {emoji}</span>
              </button>
            )
          )}

          {item.stores.length > 0 ? (
            item.stores.map(store => (
              <button
                key={store}
                className="item-card__tag"
                onClick={() => onTagClick(item.id, 'stores')}
              >
                <span aria-hidden>🏪</span> {store}
              </button>
            ))
          ) : (
            <button
              className="item-card__tag item-card__tag--cta"
              onClick={() => onTagClick(item.id, 'stores')}
              aria-label="Añadir tienda"
            >
              <span aria-hidden>+ 🏪</span>
            </button>
          )}
        </div>
      </div>

      <div className="item-card__right">
        <div
          className="item-card__avatar"
          style={{ background: member?.photoUrl ? 'transparent' : colour }}
          aria-hidden
        >
          {member?.photoUrl
            ? <img src={member.photoUrl} alt={member.displayName} className="item-card__avatar-img" />
            : initial
          }
        </div>
        <button
          className="item-card__menu"
          onClick={e => { e.stopPropagation(); onMenuOpen(item.id) }}
          aria-label="Opciones del producto"
        >
          ⋯
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run ItemCard tests**

```bash
cd frontend
npx vitest run src/components/ItemCard.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ItemCard.tsx frontend/src/components/ItemCard.test.tsx
git commit -m "feat: ItemCard renders multiple store chips"
```

---

## Task 9: StoreEditSheet (new component)

**Files:**
- Create: `frontend/src/components/StoreEditSheet.tsx`
- Create: `frontend/src/components/StoreEditSheet.css`
- Create: `frontend/src/components/StoreEditSheet.test.tsx`

- [ ] **Step 1: Create StoreEditSheet.test.tsx**

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { StoreEditSheet } from './StoreEditSheet'
import type { ListItem } from '../types'

const BASE_ITEM: ListItem = {
  id: 'i1', list_id: 'l1', name: 'Leche', quantity: null,
  variety: null, brand: null, stores: ['Mercadona', 'Carrefour'],
  purchased: false, added_by: 'u1', created_at: '', updated_at: '',
}

const OTHER_ITEMS: ListItem[] = [
  { ...BASE_ITEM, id: 'i2', stores: ['Lidl'] },
  { ...BASE_ITEM, id: 'i3', stores: ['Alcampo'] },
]

describe('StoreEditSheet', () => {
  it('renders existing stores as chips', () => {
    render(<StoreEditSheet item={BASE_ITEM} items={[]} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Mercadona')).toBeInTheDocument()
    expect(screen.getByText('Carrefour')).toBeInTheDocument()
  })

  it('clicking the remove button on a store removes it and calls onSave', () => {
    const onSave = vi.fn()
    render(<StoreEditSheet item={BASE_ITEM} items={[]} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /eliminar mercadona/i }))
    expect(onSave).toHaveBeenCalledWith(['Carrefour'])
  })

  it('typing a new store and clicking + adds it and calls onSave', () => {
    const onSave = vi.fn()
    render(<StoreEditSheet item={BASE_ITEM} items={[]} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lidl' } })
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))
    expect(onSave).toHaveBeenCalledWith(['Mercadona', 'Carrefour', 'Lidl'])
  })

  it('pressing Enter in the input adds the store', () => {
    const onSave = vi.fn()
    render(<StoreEditSheet item={BASE_ITEM} items={[]} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dia' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSave).toHaveBeenCalledWith(['Mercadona', 'Carrefour', 'Dia'])
  })

  it('does not add duplicate stores', () => {
    const onSave = vi.fn()
    render(<StoreEditSheet item={BASE_ITEM} items={[]} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mercadona' } })
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not add empty string', () => {
    const onSave = vi.fn()
    render(<StoreEditSheet item={BASE_ITEM} items={[]} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows client-side suggestions from other items', () => {
    render(<StoreEditSheet item={BASE_ITEM} items={OTHER_ITEMS} onSave={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Li' } })
    expect(screen.getByText('Lidl')).toBeInTheDocument()
  })

  it('clicking a suggestion adds the store', () => {
    const onSave = vi.fn()
    render(<StoreEditSheet item={BASE_ITEM} items={OTHER_ITEMS} onSave={onSave} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Li' } })
    fireEvent.click(screen.getByText('Lidl'))
    expect(onSave).toHaveBeenCalledWith(['Mercadona', 'Carrefour', 'Lidl'])
  })

  it('ESC key calls onClose', () => {
    const onClose = vi.fn()
    render(<StoreEditSheet item={BASE_ITEM} items={[]} onSave={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('tapping overlay calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(<StoreEditSheet item={BASE_ITEM} items={[]} onSave={vi.fn()} onClose={onClose} />)
    fireEvent.click(container.querySelector('.store-edit-sheet__overlay')!)
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failures**

```bash
cd frontend
npx vitest run src/components/StoreEditSheet.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create StoreEditSheet.tsx**

```typescript
import { useState, useEffect } from 'react'
import './StoreEditSheet.css'
import type { ListItem } from '../types'
import { clientSideSuggestions } from '../lib/suggestions'

interface Props {
  item: ListItem
  items: ListItem[]
  onSave: (stores: string[]) => void
  onClose: () => void
}

export function StoreEditSheet({ item, items, onSave, onClose }: Props) {
  const [input, setInput] = useState('')
  const currentStores = item.stores

  const suggestions = clientSideSuggestions(items, 'stores', input).filter(
    s => !currentStores.includes(s),
  )

  function addStore(name: string) {
    const trimmed = name.trim()
    if (!trimmed || currentStores.includes(trimmed)) return
    onSave([...currentStores, trimmed])
  }

  function removeStore(name: string) {
    onSave(currentStores.filter(s => s !== name))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addStore(input)
    }
  }

  useEffect(() => {
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onDocKeyDown)
    return () => document.removeEventListener('keydown', onDocKeyDown)
  }, [onClose])

  return (
    <>
      <div className="store-edit-sheet__overlay" onClick={onClose} />
      <div className="store-edit-sheet">
        <div className="store-edit-sheet__header">
          <span>🏪 Tiendas</span>
          <span className="store-edit-sheet__item-name"> · {item.name}</span>
        </div>

        {currentStores.length > 0 && (
          <div className="store-edit-sheet__chips">
            {currentStores.map(store => (
              <span key={store} className="store-edit-sheet__chip">
                {store}
                <button
                  className="store-edit-sheet__chip-remove"
                  onClick={() => removeStore(store)}
                  aria-label={`Eliminar ${store}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="store-edit-sheet__input-row">
          <input
            className="store-edit-sheet__input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Añadir tienda…"
            autoFocus
            aria-label="Nueva tienda"
          />
          <button
            className="store-edit-sheet__add"
            onClick={() => addStore(input)}
            aria-label="Añadir tienda"
          >
            +
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="store-edit-sheet__suggestions">
            {suggestions.map(s => (
              <button
                key={s}
                className="store-edit-sheet__suggestion"
                onClick={() => addStore(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Create StoreEditSheet.css**

```css
.store-edit-sheet__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
}

.store-edit-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 20px 16px 32px;
  z-index: 201;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
}

.store-edit-sheet__header {
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 14px;
}

.store-edit-sheet__item-name {
  font-weight: 400;
  color: #888;
}

.store-edit-sheet__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.store-edit-sheet__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 12px;
  padding: 5px 10px;
  font-size: 14px;
}

.store-edit-sheet__chip-remove {
  background: none;
  border: none;
  padding: 0 0 0 2px;
  cursor: pointer;
  color: #2e7d32;
  font-size: 16px;
  line-height: 1;
  opacity: 0.6;
}

.store-edit-sheet__input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.store-edit-sheet__input {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 15px;
  outline: none;
}

.store-edit-sheet__input:focus {
  border-color: #4caf50;
}

.store-edit-sheet__add {
  background: #4caf50;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 18px;
  cursor: pointer;
}

.store-edit-sheet__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.store-edit-sheet__suggestion {
  background: #f5f5f5;
  border: none;
  border-radius: 10px;
  padding: 5px 12px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
}
```

- [ ] **Step 5: Run tests**

```bash
cd frontend
npx vitest run src/components/StoreEditSheet.test.tsx
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StoreEditSheet.tsx frontend/src/components/StoreEditSheet.css \
        frontend/src/components/StoreEditSheet.test.tsx
git commit -m "feat: StoreEditSheet — add/remove individual store chips"
```

---

## Task 10: TagEditSheet

**Files:**
- Modify: `frontend/src/components/TagEditSheet.tsx`
- Modify: `frontend/src/components/TagEditSheet.test.tsx`

- [ ] **Step 1: Update TagEditSheet test fixtures**

In `frontend/src/components/TagEditSheet.test.tsx`, update `BASE_ITEM`:

```typescript
const BASE_ITEM: ListItem = {
  id: 'i1', list_id: 'l1',
  name: 'Leche entera',
  quantity: '2', variety: 'Entera', brand: 'Hacendado', stores: ['Mercadona'],
  purchased: false, added_by: 'u1', created_at: '', updated_at: '',
}

const OTHER_ITEMS: ListItem[] = [
  { ...BASE_ITEM, id: 'i2', brand: 'Danone' },
  { ...BASE_ITEM, id: 'i3', brand: 'Pascual' },
]
```

- [ ] **Step 2: Replace TagEditSheet.tsx**

```typescript
import { useState, useEffect } from 'react'
import './TagEditSheet.css'
import type { ListItem, TagField } from '../types'
import { clientSideSuggestions } from '../lib/suggestions'

const TAG_META: Record<TagField, { emoji: string; label: string }> = {
  variety:  { emoji: '✨', label: 'Variedad' },
  brand:    { emoji: '🏷️', label: 'Marca' },
  quantity: { emoji: '🔢', label: 'Cantidad' },
}

interface Props {
  item: ListItem
  field: TagField
  items: ListItem[]
  onSave: (value: string | null) => void
  onClose: () => void
}

export function TagEditSheet({ item, field, items, onSave, onClose }: Props) {
  const tagValues = { variety: item.variety, brand: item.brand, quantity: item.quantity } satisfies Record<TagField, string | null>
  const currentValue = tagValues[field]
  const [input, setInput] = useState(currentValue ?? '')
  const { emoji, label } = TAG_META[field]

  const suggestions = field !== 'quantity'
    ? clientSideSuggestions(items, field, input)
    : []

  function handleSave() {
    const trimmed = input.trim()
    onSave(trimmed.length > 0 ? trimmed : null)
  }

  useEffect(() => {
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onDocKeyDown)
    return () => document.removeEventListener('keydown', onDocKeyDown)
  }, [onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <>
    <div className="tag-edit-sheet__overlay" onClick={onClose} />
    <div className="tag-edit-sheet">
      <div className="tag-edit-sheet__header">
        <span>{emoji} {label}</span>
        <span className="tag-edit-sheet__item-name"> · {item.name}</span>
      </div>

      <div className="tag-edit-sheet__input-row">
        <input
          className="tag-edit-sheet__input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          aria-label={label}
        />
        <button className="tag-edit-sheet__save" onClick={handleSave} aria-label="Guardar">
          Guardar
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="tag-edit-sheet__suggestions">
          {suggestions.map(s => (
            <button key={s} className="tag-edit-sheet__suggestion" onClick={() => setInput(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {currentValue !== null && (
        <button
          className="tag-edit-sheet__remove"
          onClick={() => onSave(null)}
          aria-label={`Eliminar ${label}`}
        >
          Eliminar {label}
        </button>
      )}
    </div>
    </>
  )
}
```

- [ ] **Step 3: Run TagEditSheet tests**

```bash
cd frontend
npx vitest run src/components/TagEditSheet.test.tsx
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TagEditSheet.tsx frontend/src/components/TagEditSheet.test.tsx
git commit -m "feat: TagEditSheet — remove store field (now handled by StoreEditSheet)"
```

---

## Task 11: SmartInputBar

**Files:**
- Modify: `frontend/src/components/SmartInputBar.tsx`
- Modify: `frontend/src/components/SmartInputBar.test.tsx`

- [ ] **Step 1: Update SmartInputBar test fixtures and add new tests**

In `frontend/src/components/SmartInputBar.test.tsx`:

Update the store suggestions test — change `store: 'Mercadona'` to `stores: ['Mercadona']` and `store: 'Lidl'` to `stores: ['Lidl']`.

Update `tapping a legend chip is a no-op when sigil is already present` to test brand specifically (not store):
```typescript
test('tapping brand chip is a no-op when # already present', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="Leche #Puleva" parsed={parseInput('Leche #Puleva')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onScanRequest={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir marca/i }))
  expect(onChange).not.toHaveBeenCalled()
})
```

Add two new tests:
```typescript
test('parse preview shows multiple store chips', () => {
  render(<SmartInputBar value="Leche @Mercadona @Carrefour" parsed={parseInput('Leche @Mercadona @Carrefour')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onScanRequest={noop} />)
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Mercadona')
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Carrefour')
})

test('tapping tienda chip appends another @ when one is already present', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="Leche @Mercadona" parsed={parseInput('Leche @Mercadona')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onScanRequest={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }))
  expect(onChange).toHaveBeenCalledWith('Leche @Mercadona @')
})
```

- [ ] **Step 2: Run to verify failures**

```bash
cd frontend
npx vitest run src/components/SmartInputBar.test.tsx
```

- [ ] **Step 3: Update SmartInputBar.tsx — four targeted changes**

**3a.** Change `SIGIL_FIELDS`:
```typescript
const SIGIL_FIELDS: Record<string, 'variety' | 'brand' | 'stores'> = {
  '*': 'variety', '#': 'brand', '@': 'stores',
}
```

**3b.** Change `hasSigil`:
```typescript
function hasSigil(parsed: ParsedInput): boolean {
  return parsed.quantity !== null || parsed.variety !== null ||
         parsed.brand !== null || parsed.stores.length > 0
}
```

**3c.** Change `sigilChipAction` — allow `@` to be appended even when already present:
```typescript
function sigilChipAction(currentValue: string, sigil: string): string | null {
  const trimmed = currentValue.trimEnd()
  const words = trimmed ? trimmed.split(/\s+/) : []
  const lastWord = words[words.length - 1] ?? ''
  const endsWithBareSigil = lastWord.length === 1 && ALL_SIGILS.has(lastWord)

  if (endsWithBareSigil) {
    if (lastWord === sigil) return null
    words[words.length - 1] = sigil
    return words.join(' ')
  }

  if (sigil !== '@' && currentValue.includes(sigil)) return null
  const sep = currentValue === '' || currentValue.endsWith(' ') ? '' : ' '
  return currentValue + sep + sigil
}
```

**3d.** Change the preview `parsed.store` chip to `parsed.stores.map(...)`:
```typescript
          {parsed.stores.map(s => (
            <span key={s} className="smart-input__preview-tag">🏪 {s}</span>
          ))}
```
(Replace the single `{parsed.store && ...}` line.)

- [ ] **Step 4: Run SmartInputBar tests**

```bash
cd frontend
npx vitest run src/components/SmartInputBar.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SmartInputBar.tsx frontend/src/components/SmartInputBar.test.tsx
git commit -m "feat: SmartInputBar supports multiple @store sigils"
```

---

## Task 12: BarcodeScanSheet

**Files:**
- Modify: `frontend/src/components/BarcodeScanSheet.tsx`
- Modify: `frontend/src/components/BarcodeScanSheet.test.tsx`

- [ ] **Step 1: Replace BarcodeScanSheet.test.tsx**

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import type { BarcodeRead } from '../types'

const product: BarcodeRead = {
  name: 'Leche Entera',
  brand: 'Pascual',
  stores: ['Mercadona', 'Alcampo'],
}

const productNoExtras: BarcodeRead = {
  name: 'Producto Genérico',
  brand: null,
  stores: [],
}

describe('BarcodeScanSheet', () => {
  it('renders product name', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Leche Entera')).toBeInTheDocument()
  })

  it('renders brand tag when present', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Pascual/)).toBeInTheDocument()
  })

  it('renders store chips as selectable buttons when stores present', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /mercadona/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /alcampo/i })).toBeInTheDocument()
  })

  it('no store chips when stores empty', () => {
    render(<BarcodeScanSheet product={productNoExtras} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByTestId('store-chips')).not.toBeInTheDocument()
  })

  it('store chips start unselected', () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /mercadona/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /alcampo/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a chip toggles its selected state', async () => {
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={vi.fn()} />)
    const chip = screen.getByRole('button', { name: /mercadona/i })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  it('add button passes only selected stores to onAdd', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /mercadona/i }))
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', stores: ['Mercadona'] })
  })

  it('add button passes empty stores when none selected', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', stores: [] })
  })

  it('add button passes all selected stores', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /mercadona/i }))
    await userEvent.click(screen.getByRole('button', { name: /alcampo/i }))
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Leche Entera', brand: 'Pascual', stores: ['Mercadona', 'Alcampo'] })
  })

  it('add button passes empty stores when no stores on product', async () => {
    const onAdd = vi.fn()
    render(<BarcodeScanSheet product={productNoExtras} onAdd={onAdd} onEdit={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /añadir a la lista/i }))
    expect(onAdd).toHaveBeenCalledWith({ name: 'Producto Genérico', brand: null, stores: [] })
  })

  it('edit button calls onEdit with name and brand sigil', async () => {
    const onEdit = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={onEdit} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect(onEdit).toHaveBeenCalledWith('Leche Entera #Pascual')
  })

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn()
    render(<BarcodeScanSheet product={product} onAdd={vi.fn()} onEdit={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failures**

```bash
cd frontend
npx vitest run src/components/BarcodeScanSheet.test.tsx
```

Expected: failures on selectable chip tests.

- [ ] **Step 3: Replace BarcodeScanSheet.tsx**

```typescript
import { useState } from 'react'
import './BarcodeScanSheet.css'
import type { BarcodeRead } from '../types'

interface Props {
  product: BarcodeRead
  onAdd: (item: { name: string; brand: string | null; stores: string[] }) => void
  onEdit: (prefill: string) => void
  onClose: () => void
}

function buildPrefill(product: BarcodeRead): string {
  const parts = [product.name]
  if (product.brand) parts.push(`#${product.brand}`)
  return parts.join(' ')
}

export function BarcodeScanSheet({ product, onAdd, onEdit, onClose }: Props) {
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set())

  function toggleStore(store: string) {
    setSelectedStores(prev => {
      const next = new Set(prev)
      if (next.has(store)) next.delete(store)
      else next.add(store)
      return next
    })
  }

  return (
    <>
      <div className="bss__overlay" onClick={onClose} />
      <div className="bss">
        <div className="bss__header">Producto encontrado</div>

        <div className="bss__product-row">
          <div className="bss__product-info">
            <div className="bss__name">{product.name}</div>
            {(product.brand || product.stores.length > 0) && (
              <div className="bss__tags">
                {product.brand && (
                  <span className="bss__tag">🏷️ {product.brand}</span>
                )}
                {product.stores.length > 0 && (
                  <div className="bss__store-chips" data-testid="store-chips">
                    {product.stores.map(s => (
                      <button
                        key={s}
                        className={`bss__tag bss__tag--store${selectedStores.has(s) ? ' bss__tag--store-selected' : ''}`}
                        onClick={() => toggleStore(s)}
                        aria-pressed={selectedStores.has(s)}
                        aria-label={s}
                      >
                        <span aria-hidden="true">🏪</span> <span>{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="bss__edit"
            onClick={() => onEdit(buildPrefill(product))}
            aria-label="Editar"
          >
            ✏️
          </button>
        </div>

        <div className="bss__actions">
          <button className="bss__cancel" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="bss__add"
            onClick={() => onAdd({
              name: product.name,
              brand: product.brand,
              stores: product.stores.filter(s => selectedStores.has(s)),
            })}
          >
            Añadir a la lista
          </button>
        </div>
      </div>
    </>
  )
}
```

Add to `BarcodeScanSheet.css` (at the end of the file):
```css
.bss__tag--store-selected {
  background: #c8e6c9;
  border: 2px solid #2e7d32;
  color: #1b5e20;
  cursor: pointer;
}
```

Note: also add `cursor: pointer` to `.bss__tag--store` since it's now a button.

- [ ] **Step 4: Run BarcodeScanSheet tests**

```bash
cd frontend
npx vitest run src/components/BarcodeScanSheet.test.tsx
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BarcodeScanSheet.tsx frontend/src/components/BarcodeScanSheet.test.tsx
git commit -m "feat: BarcodeScanSheet — selectable store chips"
```

---

## Task 13: Final sweep — remaining broken tests

- [ ] **Step 1: Run full frontend test suite**

```bash
cd frontend
npx vitest run
```

Remaining failures are in files that construct `ListItem` objects with `store:` — expected in `useListItems.test.tsx`, `api.test.ts`, `ListScreen.test.tsx`, `suggestions.test.ts`, and similar.

- [ ] **Step 2: Fix each failing test file**

For each file, find every `ListItem`-shaped object and change:
- `store: 'X'` → `stores: ['X']`
- `store: null` → `stores: []`
- `suggestion["store"]` → `suggestion["stores"]`

- [ ] **Step 3: Run full test suite again**

```bash
cd frontend
npx vitest run
```

Expected: all PASS.

- [ ] **Step 4: Run backend tests**

```bash
cd backend
uv run pytest -v
```

Expected: all PASS.

- [ ] **Step 5: Run typecheck**

```bash
cd frontend
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -p
git commit -m "fix: update remaining test fixtures for multi-store"
```

---

## Task 14: Final verification

- [ ] **Step 1: Run linter**

```bash
cd frontend
npm run lint
```

Fix any reported issues.

- [ ] **Step 2: Run full test suites**

```bash
cd backend && uv run pytest -v
cd ../frontend && npx vitest run
```

Expected: all PASS in both.

- [ ] **Step 3: Manual smoke test**

Start both servers:
```bash
# Terminal 1
cd backend && uv run uvicorn app.main:app --reload
# Terminal 2
cd frontend && npm run dev
```

Verify:
- Adding `Leche @Mercadona @Carrefour` shows two store chips on the item card
- Tapping a store chip opens StoreEditSheet with both stores; × removes individual stores; adding a new store persists
- Store filter shows unique stores flattened from all items; filter shows matching items + untagged items
- Barcode scan shows selectable store chips; only checked ones are saved to the item

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: multi-store per list item — complete implementation"
```
