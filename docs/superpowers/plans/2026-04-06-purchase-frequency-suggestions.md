# Purchase Frequency Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proactively surface items due for re-purchase in a cycling dismissable banner above the SmartInputBar, based on median purchase interval computed from each list's history.

**Architecture:** Replace `purchased: bool` on `list_items` with `purchased_at: datetime | None` (migration backfills from `updated_at`). A new `GET /lists/{list_id}/due-suggestions` endpoint computes frequency stats in Python and returns items within their relevance window. A new `FrequencySuggestionBanner` frontend component cycles through suggestions every 6 seconds with localStorage-persisted dismissals.

**Tech Stack:** Python 3.13, FastAPI, SQLModel, Alembic, Pydantic v2, React + TypeScript, Vite, Vitest

---

## File Map

**Create:**
- `backend/alembic/versions/d4e5f6a7b8c9_add_purchased_at_to_list_items.py` — migration
- `backend/app/schemas/due_suggestions.py` — `DueSuggestionRead` schema
- `backend/tests/test_due_suggestions.py` — endpoint tests
- `frontend/src/lib/dismissedSuggestions.ts` — localStorage read/write utility
- `frontend/src/lib/dismissedSuggestions.test.ts` — unit tests for dismissal utility
- `frontend/src/components/FrequencySuggestionBanner.tsx` — cycling banner component
- `frontend/src/components/FrequencySuggestionBanner.css` — banner styles
- `frontend/src/components/FrequencySuggestionBanner.test.tsx` — component tests

**Modify:**
- `backend/app/db/models.py` — replace `purchased: bool` with `purchased_at: Optional[datetime]`
- `backend/app/schemas/items.py` — `ItemRead`: compute `purchased` via `@computed_field`
- `backend/app/routers/items.py` — PATCH: translate `purchased` bool → `purchased_at` changes
- `backend/app/routers/lists.py` — `purchased_count` query: use `purchased_at.is_not(None)`
- `backend/app/routers/suggestions.py` — add `GET /lists/{list_id}/due-suggestions`
- `frontend/src/types.ts` — add `DueSuggestion` interface
- `frontend/src/lib/api.ts` — add `getDueSuggestions` function
- `frontend/src/components/ListScreen.tsx` — fetch suggestions, render banner

---

### Task 1: Alembic migration — replace purchased with purchased_at

**Files:**
- Create: `backend/alembic/versions/d4e5f6a7b8c9_add_purchased_at_to_list_items.py`

- [ ] **Step 1: Write the migration file**

Create `backend/alembic/versions/d4e5f6a7b8c9_add_purchased_at_to_list_items.py`:

```python
"""add purchased_at to list_items

Revision ID: d4e5f6a7b8c9
Revises: 661153072156
Create Date: 2026-04-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = '661153072156'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add purchased_at as nullable so existing rows are not rejected
    op.add_column(
        'list_items',
        sa.Column('purchased_at', sa.DateTime(), nullable=True),
    )
    # 2. Backfill: use updated_at as a proxy for purchase time on already-purchased rows
    op.execute(
        "UPDATE list_items SET purchased_at = updated_at WHERE purchased = true"
    )
    # 3. Drop the old boolean column
    op.drop_column('list_items', 'purchased')


def downgrade() -> None:
    op.add_column(
        'list_items',
        sa.Column('purchased', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.execute(
        "UPDATE list_items SET purchased = true WHERE purchased_at IS NOT NULL"
    )
    op.drop_column('list_items', 'purchased_at')
```

- [ ] **Step 2: Verify the migration runs (requires a local Postgres DB)**

```bash
cd backend
uv run alembic upgrade head
```

Expected: no errors, migration applies cleanly.

> If you don't have a local Postgres DB, skip this step — tests use SQLite in-memory which recreates schema from models directly.

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/d4e5f6a7b8c9_add_purchased_at_to_list_items.py
git commit -m "feat: migration — replace purchased bool with purchased_at datetime"
```

---

### Task 2: Update SQLModel model

**Files:**
- Modify: `backend/app/db/models.py:48-60`

- [ ] **Step 1: Replace `purchased: bool` with `purchased_at` in the model**

In `backend/app/db/models.py`, replace:

```python
    purchased: bool = Field(default=False)
    added_by: str = Field(foreign_key="users.id")
```

with:

```python
    purchased_at: Optional[datetime] = Field(default=None)
    added_by: str = Field(foreign_key="users.id")
```

- [ ] **Step 2: Run existing items tests to see expected failures**

```bash
cd backend
uv run pytest tests/test_items.py -v
```

Expected: several failures — tests check `purchased` field. That's expected; fix in Task 3.

- [ ] **Step 3: Commit**

```bash
git add backend/app/db/models.py
git commit -m "feat: replace purchased bool with purchased_at on ListItem model"
```

---

### Task 3: Update ItemRead schema — compute purchased from purchased_at

**Files:**
- Modify: `backend/app/schemas/items.py`

- [ ] **Step 1: Update `ItemRead` to use `@computed_field`**

Replace the entire `backend/app/schemas/items.py` with:

```python
from datetime import datetime

from pydantic import BaseModel, Field, computed_field


class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    quantity: str | None = None
    brand: str | None = None
    stores: list[str] = Field(default_factory=list)


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    quantity: str | None = None
    brand: str | None = None
    stores: list[str] | None = None  # None = don't touch; [] = remove all
    purchased: bool | None = None


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: str | None
    brand: str | None
    stores: list[str]
    purchased_at: datetime | None
    added_by: str
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def purchased(self) -> bool:
        return self.purchased_at is not None
```

- [ ] **Step 2: Run items tests**

```bash
cd backend
uv run pytest tests/test_items.py -v
```

Expected: most pass. `test_update_item_marks_purchased` still fails — PATCH handler not updated yet.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/items.py
git commit -m "feat: ItemRead derives purchased from purchased_at via computed_field"
```

---

### Task 4: Update items PATCH handler

**Files:**
- Modify: `backend/app/routers/items.py:49-67`
- Test: `backend/tests/test_items.py`

- [ ] **Step 1: Write failing tests**

Add to `backend/tests/test_items.py`:

```python
def test_update_item_sets_purchased_at(client: TestClient, session: Session):
    from app.db.models import ListItem
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    assert item["purchased"] is False

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    assert response.status_code == 200
    assert response.json()["purchased"] is True

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    assert db_item.purchased_at is not None


def test_update_item_clears_purchased_at(client: TestClient, session: Session):
    from app.db.models import ListItem
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    response = client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": False})
    assert response.status_code == 200
    assert response.json()["purchased"] is False

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    assert db_item.purchased_at is None


def test_repurchase_does_not_overwrite_purchased_at(client: TestClient, session: Session):
    from app.db.models import ListItem
    lst = _create_list(client)
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Bread"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    db_item = session.get(ListItem, item["id"])
    session.refresh(db_item)
    original_purchased_at = db_item.purchased_at

    # Patch purchased=True again — should NOT update purchased_at
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})
    session.refresh(db_item)
    assert db_item.purchased_at == original_purchased_at
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd backend
uv run pytest tests/test_items.py::test_update_item_sets_purchased_at tests/test_items.py::test_update_item_clears_purchased_at tests/test_items.py::test_repurchase_does_not_overwrite_purchased_at -v
```

Expected: FAIL.

- [ ] **Step 3: Update the PATCH handler**

In `backend/app/routers/items.py`, replace the `update_item` function:

```python
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
    data = body.model_dump(exclude_unset=True)
    purchased = data.pop('purchased', None)
    for field, value in data.items():
        setattr(item, field, value)
    if purchased is True and item.purchased_at is None:
        item.purchased_at = datetime.now(timezone.utc).replace(tzinfo=None)
    elif purchased is False:
        item.purchased_at = None
    item.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    session.add(item)
    _bump(lst, session)
    session.commit()
    session.refresh(item)
    return item
```

- [ ] **Step 4: Run all items tests**

```bash
cd backend
uv run pytest tests/test_items.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/items.py backend/tests/test_items.py
git commit -m "feat: items PATCH translates purchased bool to purchased_at"
```

---

### Task 5: Fix purchased_count in lists router

**Files:**
- Modify: `backend/app/routers/lists.py:42`
- Test: `backend/tests/test_lists.py`

- [ ] **Step 1: Write a failing test**

Add to `backend/tests/test_lists.py`:

```python
def test_purchased_count_reflects_purchased_at(client: TestClient):
    lst = client.post("/lists", json={"name": "Shopping"}).json()
    item = client.post(f"/lists/{lst['id']}/items", json={"name": "Milk"}).json()
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    lists = client.get("/lists").json()
    target = next(l for l in lists if l["id"] == lst["id"])
    assert target["purchased_count"] == 1
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd backend
uv run pytest tests/test_lists.py::test_purchased_count_reflects_purchased_at -v
```

Expected: FAIL.

- [ ] **Step 3: Fix the query in lists.py**

In `backend/app/routers/lists.py`, replace:

```python
            func.coalesce(
                func.sum(case((ListItem.purchased == True, 1), else_=0)), 0
            ).label("purchased_count"),
```

with:

```python
            func.coalesce(
                func.sum(case((ListItem.purchased_at.is_not(None), 1), else_=0)), 0
            ).label("purchased_count"),
```

- [ ] **Step 4: Run all lists tests**

```bash
cd backend
uv run pytest tests/test_lists.py -v
```

Expected: all pass.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend
uv run pytest -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/lists.py backend/tests/test_lists.py
git commit -m "feat: fix purchased_count to use purchased_at IS NOT NULL"
```

---

### Task 6: Add DueSuggestionRead schema

**Files:**
- Create: `backend/app/schemas/due_suggestions.py`

- [ ] **Step 1: Create the schema file**

Create `backend/app/schemas/due_suggestions.py`:

```python
from pydantic import BaseModel


class DueSuggestionRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]
    days_overdue: float        # days past the 0.9× threshold
    dismissal_ttl_days: float  # (1.5 × median_interval) - days_since_last
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/due_suggestions.py
git commit -m "feat: add DueSuggestionRead schema"
```

---

### Task 7: Add due suggestions endpoint

**Files:**
- Modify: `backend/app/routers/suggestions.py`
- Create: `backend/tests/test_due_suggestions.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_due_suggestions.py`:

```python
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.models import ListItem


def _create_list(client):
    return client.post("/lists", json={"name": "Shopping"}).json()


def _add_purchased(session: Session, list_id: str, user_id: str, name: str, purchased_at: datetime):
    """Insert a ListItem directly with a specific purchased_at timestamp."""
    item = ListItem(
        list_id=list_id,
        name=name,
        added_by=user_id,
        purchased_at=purchased_at,
    )
    session.add(item)
    session.commit()


def test_due_suggestions_returns_due_item(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.utcnow()
    # 3 purchases ~14 days apart; last was 14 days ago
    # median=14, 0.9×14=12.6 <= 14 <= 1.5×14=21 ✓
    for i in range(3, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Bananas", now - timedelta(days=14 * i))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    assert response.status_code == 200
    names = [s["name"] for s in response.json()]
    assert "Bananas" in names


def test_due_suggestions_requires_3_purchases(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.utcnow()
    for i in range(2, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Milk", now - timedelta(days=7 * i))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert "Milk" not in names


def test_due_suggestions_excludes_unpurchased_items(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.utcnow()
    for i in range(3, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Eggs", now - timedelta(days=14 * i))

    # Add Eggs as currently unpurchased on this list
    client.post(f"/lists/{lst['id']}/items", json={"name": "Eggs"})

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert "Eggs" not in names


def test_due_suggestions_excludes_items_outside_upper_bound(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.utcnow()
    # median=14, upper=21. Last purchase 30 days ago → outside window
    _add_purchased(session, lst["id"], user.id, "Cheese", now - timedelta(days=42))
    _add_purchased(session, lst["id"], user.id, "Cheese", now - timedelta(days=28))
    _add_purchased(session, lst["id"], user.id, "Cheese", now - timedelta(days=30))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert "Cheese" not in names


def test_due_suggestions_excludes_items_below_lower_bound(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.utcnow()
    # median=14, lower=12.6. Last purchase 10 days ago → below lower bound
    _add_purchased(session, lst["id"], user.id, "Yogurt", now - timedelta(days=28))
    _add_purchased(session, lst["id"], user.id, "Yogurt", now - timedelta(days=14))
    _add_purchased(session, lst["id"], user.id, "Yogurt", now - timedelta(days=10))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert "Yogurt" not in names


def test_due_suggestions_sorted_most_overdue_first(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.utcnow()
    # Apples: median=14, last=18d → days_overdue=18-12.6=5.4
    _add_purchased(session, lst["id"], user.id, "Apples", now - timedelta(days=42))
    _add_purchased(session, lst["id"], user.id, "Apples", now - timedelta(days=28))
    _add_purchased(session, lst["id"], user.id, "Apples", now - timedelta(days=18))
    # Bread: median=14, last=20d → days_overdue=20-12.6=7.4 (more overdue)
    _add_purchased(session, lst["id"], user.id, "Bread", now - timedelta(days=42))
    _add_purchased(session, lst["id"], user.id, "Bread", now - timedelta(days=28))
    _add_purchased(session, lst["id"], user.id, "Bread", now - timedelta(days=20))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    names = [s["name"] for s in response.json()]
    assert names.index("Bread") < names.index("Apples")


def test_due_suggestions_non_member_forbidden(other_client: TestClient, client: TestClient):
    lst = client.post("/lists", json={"name": "Private"}).json()
    response = other_client.get(f"/lists/{lst['id']}/due-suggestions")
    assert response.status_code == 403
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
uv run pytest tests/test_due_suggestions.py -v
```

Expected: FAIL with 404 (endpoint doesn't exist yet).

- [ ] **Step 3: Add the endpoint to suggestions.py**

Replace the entire `backend/app/routers/suggestions.py` with:

```python
from collections import defaultdict
from datetime import datetime, timezone
from statistics import median
from typing import Annotated

from fastapi import APIRouter, Query
from sqlmodel import func, select

from app.db.models import ListItem, ListMember
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.due_suggestions import DueSuggestionRead
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
        select(subq.c.name, subq.c.brand, subq.c.stores)
        .where(subq.c.rn == 1)
        .order_by(subq.c.name.asc())
        .limit(10)
    ).all()

    return [
        SuggestionRead(
            name=r.name,
            brand=r.brand,
            stores=r.stores if r.stores is not None else [],
        )
        for r in rows
    ]


@router.get("/lists/{list_id}/due-suggestions", response_model=list[DueSuggestionRead])
def get_due_suggestions(
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    purchased_items = session.exec(
        select(ListItem).where(
            ListItem.list_id == lst.id,
            ListItem.purchased_at.is_not(None),
        )
    ).all()

    groups: dict[str, list[ListItem]] = defaultdict(list)
    for item in purchased_items:
        groups[item.name.lower()].append(item)

    unpurchased_names = {
        row.lower()
        for row in session.exec(
            select(ListItem.name).where(
                ListItem.list_id == lst.id,
                ListItem.purchased_at.is_(None),
            )
        ).all()
    }

    results = []
    for name_key, items in groups.items():
        if len(items) < 3:
            continue
        if name_key in unpurchased_names:
            continue

        sorted_items = sorted(items, key=lambda i: i.purchased_at)
        timestamps = [i.purchased_at for i in sorted_items]
        gaps = [
            (timestamps[i + 1] - timestamps[i]).total_seconds() / 86400
            for i in range(len(timestamps) - 1)
        ]
        median_interval = median(gaps)
        if median_interval <= 0:
            continue

        last_purchased_at = sorted_items[-1].purchased_at
        days_since_last = (now - last_purchased_at).total_seconds() / 86400
        lower = 0.9 * median_interval
        upper = 1.5 * median_interval

        if not (lower <= days_since_last <= upper):
            continue

        most_recent = max(items, key=lambda i: i.purchased_at)
        results.append(
            DueSuggestionRead(
                name=most_recent.name,
                brand=most_recent.brand,
                stores=most_recent.stores if most_recent.stores is not None else [],
                days_overdue=days_since_last - lower,
                dismissal_ttl_days=upper - days_since_last,
            )
        )

    results.sort(key=lambda r: r.days_overdue, reverse=True)
    return results[:10]


@router.get("/lists/{list_id}/updated-at")
def get_updated_at(list_and_user: MemberDep):
    lst, _ = list_and_user
    return {"updated_at": lst.updated_at.isoformat()}
```

- [ ] **Step 4: Run due suggestions tests**

```bash
cd backend
uv run pytest tests/test_due_suggestions.py -v
```

Expected: all pass.

- [ ] **Step 5: Run the full backend test suite**

```bash
cd backend
uv run pytest -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/suggestions.py backend/app/schemas/due_suggestions.py backend/tests/test_due_suggestions.py
git commit -m "feat: add GET /lists/{list_id}/due-suggestions endpoint"
```

---

### Task 8: Frontend — add DueSuggestion type and API function

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `DueSuggestion` to types.ts**

In `frontend/src/types.ts`, add after the `Suggestion` interface:

```typescript
export interface DueSuggestion {
  name: string
  brand: string | null
  stores: string[]
  days_overdue: number
  dismissal_ttl_days: number
}
```

- [ ] **Step 2: Update the import line at the top of api.ts**

Change:

```typescript
import type { BarcodeRead, Suggestion } from '../types'
```

to:

```typescript
import type { BarcodeRead, DueSuggestion, Suggestion } from '../types'
```

- [ ] **Step 3: Add `getDueSuggestions` to api.ts**

Add after the `getSuggestions` function (after line 116):

```typescript
export async function getDueSuggestions(
  getToken: () => Promise<string>,
  listId: string,
): Promise<DueSuggestion[]> {
  return apiFetch(getToken, `/lists/${listId}/due-suggestions`) as Promise<DueSuggestion[]>
}
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend
npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: add DueSuggestion type and getDueSuggestions API function"
```

---

### Task 9: Frontend — localStorage dismissal utility

**Files:**
- Create: `frontend/src/lib/dismissedSuggestions.ts`
- Create: `frontend/src/lib/dismissedSuggestions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/dismissedSuggestions.test.ts`:

```typescript
import { beforeEach, expect, test, vi } from 'vitest'
import { isDismissed, writeDismissal } from './dismissedSuggestions'

const KEY = 'cqs_dismissed_suggestions'

beforeEach(() => {
  localStorage.clear()
})

test('isDismissed returns false when no entry exists', () => {
  expect(isDismissed('Bananas')).toBe(false)
})

test('isDismissed returns true within TTL', () => {
  writeDismissal('Bananas', 3)
  expect(isDismissed('Bananas')).toBe(true)
})

test('isDismissed returns false after TTL expires', () => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  writeDismissal('Bananas', 3)
  vi.spyOn(Date, 'now').mockReturnValue(now + 4 * 86400000)
  expect(isDismissed('Bananas')).toBe(false)
  vi.restoreAllMocks()
})

test('writeDismissal prunes expired entries', () => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  writeDismissal('OldItem', 1)
  vi.spyOn(Date, 'now').mockReturnValue(now + 2 * 86400000)
  writeDismissal('NewItem', 3)
  const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  expect(stored['OldItem']).toBeUndefined()
  expect(stored['NewItem']).toBeDefined()
  vi.restoreAllMocks()
})

test('isDismissed is case-sensitive', () => {
  writeDismissal('Bananas', 3)
  expect(isDismissed('bananas')).toBe(false)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend
npm run test -- dismissedSuggestions
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the utility**

Create `frontend/src/lib/dismissedSuggestions.ts`:

```typescript
const KEY = 'cqs_dismissed_suggestions'

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function isDismissed(name: string): boolean {
  const map = read()
  const expiry = map[name]
  if (!expiry) return false
  return Date.now() < Date.parse(expiry)
}

export function writeDismissal(name: string, ttlDays: number): void {
  const map = read()
  const now = Date.now()
  for (const [k, v] of Object.entries(map)) {
    if (Date.now() >= Date.parse(v)) delete map[k]
  }
  map[name] = new Date(now + ttlDays * 86400000).toISOString()
  localStorage.setItem(KEY, JSON.stringify(map))
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend
npm run test -- dismissedSuggestions
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dismissedSuggestions.ts frontend/src/lib/dismissedSuggestions.test.ts
git commit -m "feat: localStorage dismissal utility for frequency suggestions"
```

---

### Task 10: Frontend — FrequencySuggestionBanner component

**Files:**
- Create: `frontend/src/components/FrequencySuggestionBanner.tsx`
- Create: `frontend/src/components/FrequencySuggestionBanner.css`
- Create: `frontend/src/components/FrequencySuggestionBanner.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/FrequencySuggestionBanner.test.tsx`:

```typescript
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { FrequencySuggestionBanner } from './FrequencySuggestionBanner'
import type { DueSuggestion } from '../types'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const suggestions: DueSuggestion[] = [
  { name: 'Bananas', brand: null, stores: [], days_overdue: 1, dismissal_ttl_days: 3 },
  { name: 'Milk', brand: 'Pascual', stores: ['Mercadona'], days_overdue: 0.5, dismissal_ttl_days: 2 },
]

test('renders first suggestion', () => {
  render(<FrequencySuggestionBanner suggestions={suggestions} onAdd={vi.fn()} />)
  expect(screen.getByText('Bananas')).toBeInTheDocument()
})

test('renders nothing when suggestions is empty', () => {
  const { container } = render(<FrequencySuggestionBanner suggestions={[]} onAdd={vi.fn()} />)
  expect(container.firstChild).toBeNull()
})

test('cycles to next suggestion after 6 seconds', () => {
  render(<FrequencySuggestionBanner suggestions={suggestions} onAdd={vi.fn()} />)
  expect(screen.getByText('Bananas')).toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(6000) })
  expect(screen.getByText('Milk')).toBeInTheDocument()
})

test('dismiss hides current suggestion and shows next', async () => {
  render(<FrequencySuggestionBanner suggestions={suggestions} onAdd={vi.fn()} />)
  await userEvent.click(screen.getByLabelText('Ignorar'))
  expect(screen.queryByText('Bananas')).not.toBeInTheDocument()
  expect(screen.getByText('Milk')).toBeInTheDocument()
})

test('add calls onAdd with the suggestion', async () => {
  const onAdd = vi.fn()
  render(<FrequencySuggestionBanner suggestions={suggestions} onAdd={onAdd} />)
  await userEvent.click(screen.getByText('+ Añadir'))
  expect(onAdd).toHaveBeenCalledWith(suggestions[0])
})

test('shows brand and stores as secondary text', () => {
  render(<FrequencySuggestionBanner suggestions={[suggestions[1]]} onAdd={vi.fn()} />)
  expect(screen.getByText('Pascual · Mercadona')).toBeInTheDocument()
})

test('hides banner when last suggestion is dismissed', async () => {
  const single = [suggestions[0]]
  const { container } = render(<FrequencySuggestionBanner suggestions={single} onAdd={vi.fn()} />)
  await userEvent.click(screen.getByLabelText('Ignorar'))
  expect(container.firstChild).toBeNull()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend
npm run test -- FrequencySuggestionBanner
```

Expected: FAIL with module not found.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/FrequencySuggestionBanner.tsx`:

```typescript
import { useState, useEffect } from 'react'
import './FrequencySuggestionBanner.css'
import type { DueSuggestion } from '../types'
import { isDismissed, writeDismissal } from '../lib/dismissedSuggestions'

interface Props {
  suggestions: DueSuggestion[]
  onAdd: (suggestion: DueSuggestion) => void
}

export function FrequencySuggestionBanner({ suggestions, onAdd }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [, setDismissTick] = useState(0)

  const eligible = suggestions.filter(s => !isDismissed(s.name))

  useEffect(() => {
    if (eligible.length === 0) return
    const id = setInterval(() => {
      setCurrentIndex(i => (i + 1) % eligible.length)
    }, 6000)
    return () => clearInterval(id)
  }, [eligible.length])

  if (eligible.length === 0) return null

  const current = eligible[currentIndex % eligible.length]
  const meta = [current.brand, ...current.stores].filter(Boolean).join(' · ')

  function handleDismiss() {
    writeDismissal(current.name, current.dismissal_ttl_days)
    setDismissTick(t => t + 1)
  }

  return (
    <div className="freq-banner">
      <div className="freq-banner__content">
        <span className="freq-banner__name">{current.name}</span>
        {meta && <span className="freq-banner__meta">{meta}</span>}
      </div>
      <button className="freq-banner__add" onClick={() => onAdd(current)}>
        + Añadir
      </button>
      <button className="freq-banner__dismiss" onClick={handleDismiss} aria-label="Ignorar">
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Create the CSS**

Create `frontend/src/components/FrequencySuggestionBanner.css`:

```css
.freq-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border, rgba(170,59,255,0.25));
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.freq-banner__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.freq-banner__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-h);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.freq-banner__meta {
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.freq-banner__add {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  background: none;
  border: 1px solid var(--accent-border, rgba(170,59,255,0.25));
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
}

.freq-banner__dismiss {
  font-size: 13px;
  color: var(--text);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  flex-shrink: 0;
  font-family: inherit;
  line-height: 1;
}
```

- [ ] **Step 5: Run component tests**

```bash
cd frontend
npm run test -- FrequencySuggestionBanner
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FrequencySuggestionBanner.tsx frontend/src/components/FrequencySuggestionBanner.css frontend/src/components/FrequencySuggestionBanner.test.tsx
git commit -m "feat: FrequencySuggestionBanner component"
```

---

### Task 11: Frontend — integrate banner into ListScreen

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`

- [ ] **Step 1: Add imports**

In `frontend/src/components/ListScreen.tsx`, add to the import block:

```typescript
import { FrequencySuggestionBanner } from './FrequencySuggestionBanner'
import { getDueSuggestions } from '../lib/api'
import type { BarcodeRead, DueSuggestion, EditingTag, TagField } from '../types'
```

(Replace the existing `import type { BarcodeRead, EditingTag, TagField } from '../types'` line.)

- [ ] **Step 2: Add state and fetch**

Inside the `ListScreen` component, after the other `useState` declarations (around line 40), add:

```typescript
  const [dueSuggestions, setDueSuggestions] = useState<DueSuggestion[]>([])
```

After the existing suggestions `useEffect` (around line 64), add:

```typescript
  useEffect(() => {
    void getDueSuggestions(getToken, listId)
      .then(setDueSuggestions)
      .catch(() => {/* non-critical */})
  }, [listId, getToken])
```

- [ ] **Step 3: Add handler**

After `handleScanEdit` (around line 119), add:

```typescript
  const handleSuggestionAdd = useCallback((s: DueSuggestion) => {
    void addItem({ name: s.name, brand: s.brand, stores: s.stores, quantity: null })
    setDueSuggestions(prev => prev.filter(x => x.name !== s.name))
  }, [addItem])
```

- [ ] **Step 4: Render the banner**

In the JSX, replace:

```typescript
      {!editingTag && !menuOpen && !activeItemId && (
        <SmartInputBar
          value={inputValue}
          parsed={parsed}
          items={items}
          suggestions={suggestions}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          onScanRequest={handleScanRequest}
        />
      )}
```

with:

```typescript
      {!editingTag && !menuOpen && !activeItemId && (
        <>
          <FrequencySuggestionBanner
            suggestions={dueSuggestions}
            onAdd={handleSuggestionAdd}
          />
          <SmartInputBar
            value={inputValue}
            parsed={parsed}
            items={items}
            suggestions={suggestions}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            onScanRequest={handleScanRequest}
          />
        </>
      )}
```

- [ ] **Step 5: Typecheck**

```bash
cd frontend
npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run the full frontend test suite**

```bash
cd frontend
npm run test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ListScreen.tsx
git commit -m "feat: integrate FrequencySuggestionBanner into ListScreen"
```

---

### Task 12: Final integration check

- [ ] **Step 1: Run complete backend test suite**

```bash
cd backend
uv run pytest -v
```

Expected: all pass.

- [ ] **Step 2: Run complete frontend test suite**

```bash
cd frontend
npm run test
```

Expected: all pass.

- [ ] **Step 3: Run frontend linter**

```bash
cd frontend
npm run lint
```

Expected: no errors.
