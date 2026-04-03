# List Emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-list emoji — random on creation, owner-only change via tap in dashboard, displayed on cards, list header, and invite screens.

**Architecture:** Backend adds `emoji VARCHAR` to `lists` table (Alembic migration also backfills existing rows). Frontend adds `EmojiPickerSheet` triggered by tapping the emoji on a `ListCard`. Emoji flows `ApiList` → `DashboardScreen` → `ListCard` (dashboard) and `ListScreen` → `ListHeader` (detail). Invite preview endpoint and OG share page also include the emoji.

**Tech Stack:** Python/FastAPI/SQLModel, Alembic, React/TypeScript/Vite, Vitest + Testing Library, pytest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/app/db/models.py` | Modify | Add `emoji` field to `List` |
| `backend/app/schemas/lists.py` | Modify | Add `emoji` to `ListCreate`, `ListUpdate`, `ListRead` |
| `backend/app/schemas/invites.py` | Modify | Add `list_emoji` to `InvitePreview` |
| `backend/app/routers/lists.py` | Modify | Handle `emoji` in create + update; rename `rename_list` → `update_list` |
| `backend/app/routers/invites.py` | Modify | Include `list_emoji` in preview response |
| `backend/app/routers/share.py` | Modify | Prepend emoji to OG title |
| `backend/alembic/versions/c1d2e3f4a5b6_add_list_emoji.py` | Create | Add column + backfill existing rows |
| `backend/tests/test_lists.py` | Modify | New emoji PATCH/create tests |
| `backend/tests/test_invites.py` | Modify | New emoji preview test |
| `frontend/src/types.ts` | Modify | Add `emoji: string \| null` to `ApiList` |
| `frontend/src/lib/api.ts` | Modify | Rename `renameList` → `updateList`; extend `createList`; update `getInvitePreview` return type |
| `frontend/src/components/EmojiPickerSheet.tsx` | Create | Bottom sheet with curated emoji grid |
| `frontend/src/components/EmojiPickerSheet.css` | Create | Styles for the sheet |
| `frontend/src/components/EmojiPickerSheet.test.tsx` | Create | Unit tests for the sheet |
| `frontend/src/components/ListCard.tsx` | Modify | Add emoji slot (owner button / non-owner span) |
| `frontend/src/components/ListCard.css` | Modify | Emoji slot styles |
| `frontend/src/components/ListCard.test.tsx` | Modify | Emoji rendering + interaction tests |
| `frontend/src/components/SortableListCard.tsx` | Modify | Forward `isOwner` and `onEmojiTap` |
| `frontend/src/components/DashboardScreen.tsx` | Modify | `emojiList` state, `handleEmojiChange`, random emoji on create, render `EmojiPickerSheet` |
| `frontend/src/components/DashboardScreen.test.tsx` | Modify | Update mocks for `updateList`; add emoji tests |
| `frontend/src/components/ListHeader.tsx` | Modify | Accept and render `emoji` prop |
| `frontend/src/components/ListScreen.tsx` | Modify | Accept `listEmoji` prop; pass to `ListHeader` |
| `frontend/src/components/ListScreen.test.tsx` | Modify | Add emoji header test |
| `frontend/src/components/InviteScreen.tsx` | Modify | Replace hardcoded `🛒` with `preview.list_emoji ?? '🛒'` |
| `frontend/src/components/InviteScreen.test.tsx` | Modify | Add emoji tests; update `previewData` |

---

### Task 1: Backend — Model and schemas

**Files:**
- Modify: `backend/app/db/models.py`
- Modify: `backend/app/schemas/lists.py`
- Modify: `backend/app/schemas/invites.py`
- Modify: `backend/tests/test_lists.py`

- [ ] **Step 1: Add `emoji` to the `List` model**

In `backend/app/db/models.py`, add `emoji` to the `List` class (after `name`):

```python
class List(SQLModel, table=True):
    __tablename__ = "lists"

    id: str = Field(default_factory=_uuid, primary_key=True)
    name: str
    emoji: Optional[str] = None
    owner_id: str = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
```

- [ ] **Step 2: Update list schemas**

Replace the entire contents of `backend/app/schemas/lists.py`:

```python
from datetime import datetime
from pydantic import BaseModel


class ListCreate(BaseModel):
    name: str
    emoji: str | None = None


class ListUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None


class ListRead(BaseModel):
    id: str
    name: str
    emoji: str | None
    owner_id: str
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    purchased_count: int = 0
```

- [ ] **Step 3: Update invite schema**

Replace the entire contents of `backend/app/schemas/invites.py`:

```python
from datetime import datetime
from pydantic import BaseModel


class InvitePreview(BaseModel):
    id: str
    list_name: str
    list_emoji: str | None
    invited_by_name: str | None


class InviteRead(BaseModel):
    id: str
    list_id: str
    invited_email: str | None
    invited_by: str
    created_at: datetime
```

- [ ] **Step 4: Write failing backend tests**

Append to `backend/tests/test_lists.py`:

```python
def test_create_list_with_emoji(client: TestClient):
    response = client.post("/lists", json={"name": "Frutas", "emoji": "🍎"})
    assert response.status_code == 201
    assert response.json()["emoji"] == "🍎"


def test_create_list_without_emoji_returns_null(client: TestClient):
    response = client.post("/lists", json={"name": "Sin emoji"})
    assert response.status_code == 201
    assert response.json()["emoji"] is None


def test_update_emoji(client: TestClient):
    created = client.post("/lists", json={"name": "Mi lista"}).json()
    response = client.patch(f"/lists/{created['id']}", json={"emoji": "🛒"})
    assert response.status_code == 200
    assert response.json()["emoji"] == "🛒"


def test_update_emoji_to_null(client: TestClient):
    created = client.post("/lists", json={"name": "Mi lista", "emoji": "🛒"}).json()
    response = client.patch(f"/lists/{created['id']}", json={"emoji": None})
    assert response.status_code == 200
    assert response.json()["emoji"] is None


def test_update_emoji_non_owner_returns_403(client: TestClient, other_client: TestClient):
    created = client.post("/lists", json={"name": "Mía"}).json()
    response = other_client.patch(f"/lists/{created['id']}", json={"emoji": "🍎"})
    assert response.status_code == 403
```

- [ ] **Step 5: Run tests to confirm new ones fail**

```bash
cd backend
uv run pytest tests/test_lists.py::test_create_list_with_emoji tests/test_lists.py::test_update_emoji -v
```
Expected: FAIL (router not yet updated).

- [ ] **Step 6: Commit schemas and model**

```bash
git add backend/app/db/models.py backend/app/schemas/lists.py backend/app/schemas/invites.py backend/tests/test_lists.py
git commit -m "feat(backend): add emoji field to List model and schemas"
```

---

### Task 2: Backend — Router updates

**Files:**
- Modify: `backend/app/routers/lists.py`
- Modify: `backend/app/routers/invites.py`
- Modify: `backend/app/routers/share.py`
- Modify: `backend/tests/test_invites.py`

- [ ] **Step 1: Update `lists.py` — create and update handlers**

In `backend/app/routers/lists.py`, replace the `create_list` function:

```python
@router.post("", response_model=ListRead, status_code=status.HTTP_201_CREATED)
def create_list(
    body: ListCreate,
    current_user: CurrentUser,
    session: CurrentSession,
):
    lst = List(name=body.name, emoji=body.emoji, owner_id=current_user.id)
    session.add(lst)
    session.flush()
    member = ListMember(list_id=lst.id, user_id=current_user.id)
    session.add(member)
    session.commit()
    session.refresh(lst)
    return lst
```

Replace the `rename_list` function entirely:

```python
@router.patch("/{list_id}", response_model=ListRead)
def update_list(
    body: ListUpdate,
    list_and_user: OwnerDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    if body.name is not None:
        lst.name = body.name
    if "emoji" in body.model_fields_set:
        lst.emoji = body.emoji
    _bump(lst, session)
    session.commit()
    session.refresh(lst)
    return lst
```

- [ ] **Step 2: Update `invites.py` — include `list_emoji` in preview**

In `backend/app/routers/invites.py`, replace the return statement in `get_invite_preview`:

```python
@router.get("/{invite_id}", response_model=InvitePreview)
def get_invite_preview(invite_id: str, session: CurrentSession):
    """Public endpoint — no auth required. Used to show invite details before login."""
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    _check_not_expired(invite)
    lst = session.get(List, invite.list_id)
    inviter = session.get(User, invite.invited_by)
    return InvitePreview(
        id=invite.id,
        list_name=lst.name if lst else "Unknown list",
        list_emoji=lst.emoji if lst else None,
        invited_by_name=inviter.display_name if inviter else None,
    )
```

- [ ] **Step 3: Update `share.py` — prepend emoji to OG title**

In `backend/app/routers/share.py`, replace the block that builds `list_name`, `title`, and `description`:

```python
    if invite is not None:
        lst = session.get(List, invite.list_id)
        inviter = session.get(User, invite.invited_by)
        list_name = lst.name if lst else "una lista"
        list_emoji = lst.emoji if lst else None
        inviter_name = inviter.display_name if inviter else None
    else:
        list_name = "una lista"
        list_emoji = None
        inviter_name = None

    emoji_prefix = f"{list_emoji} " if list_emoji else ""
    title = f"{emoji_prefix}{list_name} — CarroQueSí"
    description = (
        f"{inviter_name} te invitó a unirse a '{list_name}' en CarroQueSí"
        if inviter_name
        else f"Te invitaron a unirse a '{list_name}' en CarroQueSí"
    )
```

- [ ] **Step 4: Write failing invite preview test**

Append to `backend/tests/test_invites.py`:

```python
def test_invite_preview_includes_emoji(client: TestClient, session: Session, user):
    from app.db.models import List, ListMember, ListInvite
    lst = List(name="Frutas", emoji="🍎", owner_id=user.id)
    session.add(lst)
    session.flush()
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.get(f"/invites/{invite.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["list_emoji"] == "🍎"


def test_invite_preview_list_emoji_null_when_not_set(client: TestClient, session: Session, user):
    from app.db.models import List, ListMember, ListInvite
    lst = List(name="Sin emoji", emoji=None, owner_id=user.id)
    session.add(lst)
    session.flush()
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.get(f"/invites/{invite.id}")
    assert response.status_code == 200
    assert response.json()["list_emoji"] is None
```

- [ ] **Step 5: Run all backend tests**

```bash
cd backend
uv run pytest tests/test_lists.py tests/test_invites.py -v
```
Expected: All pass. The existing `test_rename_list` tests still pass because `name` is accepted as before; new emoji tests pass because the router now handles `emoji`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/lists.py backend/app/routers/invites.py backend/app/routers/share.py backend/tests/test_invites.py
git commit -m "feat(backend): update list and invite routers to handle emoji"
```

---

### Task 3: Backend — Alembic migration

**Files:**
- Create: `backend/alembic/versions/c1d2e3f4a5b6_add_list_emoji.py`

- [ ] **Step 1: Create the migration file**

Create `backend/alembic/versions/c1d2e3f4a5b6_add_list_emoji.py`:

```python
"""add_list_emoji

Revision ID: c1d2e3f4a5b6
Revises: a3f9c2e10b47
Create Date: 2026-04-03 00:00:00.000000

"""
import random
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, Sequence[str], None] = 'a3f9c2e10b47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CURATED_EMOJIS = [
    '🍎', '🥦', '🥕', '🧅', '🧄', '🍋', '🍇', '🥩', '🍗', '🥛',
    '🧀', '🥚', '🍞', '🧁', '🍫', '🍷', '🧃',
    '🛒', '🏠', '🧹', '🧺', '🧴', '🪥', '🧻', '💊', '🐾', '👶',
    '🌿', '🌸', '⭐', '🎉', '❤️', '🔥', '💧', '🌙',
]


def upgrade() -> None:
    op.add_column('lists', sa.Column('emoji', sa.String(), nullable=True))
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM lists")).fetchall()
    for row in rows:
        conn.execute(
            sa.text("UPDATE lists SET emoji = :emoji WHERE id = :id"),
            {"emoji": random.choice(CURATED_EMOJIS), "id": row[0]},
        )


def downgrade() -> None:
    op.drop_column('lists', 'emoji')
```

- [ ] **Step 2: Apply the migration (requires running Postgres)**

```bash
cd backend
uv run alembic upgrade head
```
Expected: Completes without errors. Existing list rows now have a random emoji each.

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/c1d2e3f4a5b6_add_list_emoji.py
git commit -m "feat(backend): migration — add emoji column to lists, backfill existing rows"
```

---

### Task 4: Frontend — Types and API

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `emoji` to `ApiList`**

In `frontend/src/types.ts`, update the `ApiList` interface:

```typescript
export interface ApiList {
  id: string
  name: string
  emoji: string | null
  owner_id: string
  created_at: string
  updated_at: string
  item_count: number
  purchased_count: number
}
```

- [ ] **Step 2: Rename `renameList` → `updateList`; extend `createList`; update `getInvitePreview`**

In `frontend/src/lib/api.ts`:

Replace `createList`:
```typescript
export function createList(getToken: () => Promise<string>, payload: { name: string; emoji: string }) {
  return apiFetch(getToken, '/lists', { method: 'POST', body: JSON.stringify(payload) })
}
```

Remove `renameList` entirely and add `updateList` in its place:
```typescript
export function updateList(
  getToken: () => Promise<string>,
  listId: string,
  patch: { name?: string; emoji?: string | null },
) {
  return apiFetch(getToken, `/lists/${listId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}
```

Update `getInvitePreview` return type:
```typescript
export async function getInvitePreview(inviteId: string): Promise<{
  id: string
  list_name: string
  list_emoji: string | null
  invited_by_name: string | null
}> {
  const res = await fetch(`${BASE}/invites/${inviteId}`)
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<{
    id: string
    list_name: string
    list_emoji: string | null
    invited_by_name: string | null
  }>
}
```

- [ ] **Step 3: Typecheck — expect errors at call sites**

```bash
cd frontend
npx tsc -p tsconfig.app.json --noEmit
```
Expected: Errors in `DashboardScreen.tsx` (still calls `renameList`) and `InviteScreen.tsx` (missing `list_emoji`). These are fixed in Tasks 7 and 9.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat(frontend): add emoji to ApiList; rename renameList to updateList"
```

---

### Task 5: Frontend — EmojiPickerSheet

**Files:**
- Create: `frontend/src/components/EmojiPickerSheet.tsx`
- Create: `frontend/src/components/EmojiPickerSheet.css`
- Create: `frontend/src/components/EmojiPickerSheet.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/EmojiPickerSheet.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EmojiPickerSheet } from './EmojiPickerSheet'

describe('EmojiPickerSheet', () => {
  it('renders a "Ninguno" button', () => {
    render(<EmojiPickerSheet current={null} onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /ninguno/i })).toBeInTheDocument()
  })

  it('calls onSelect(null) when Ninguno is clicked', () => {
    const onSelect = vi.fn()
    render(<EmojiPickerSheet current="🍎" onSelect={onSelect} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /ninguno/i }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('calls onSelect with emoji when an emoji button is clicked', () => {
    const onSelect = vi.fn()
    render(<EmojiPickerSheet current={null} onSelect={onSelect} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '🛒' }))
    expect(onSelect).toHaveBeenCalledWith('🛒')
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<EmojiPickerSheet current={null} onSelect={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <EmojiPickerSheet current={null} onSelect={vi.fn()} onClose={onClose} />
    )
    fireEvent.click(container.querySelector('.emoji-picker-sheet__overlay')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('marks the current emoji button as active', () => {
    render(<EmojiPickerSheet current="🍎" onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: '🍎' })).toHaveClass('emoji-picker-sheet__item--active')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd frontend
npx vitest run src/components/EmojiPickerSheet.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `EmojiPickerSheet.tsx`**

```tsx
import { useEffect } from 'react'
import './EmojiPickerSheet.css'

export const CURATED_EMOJIS = [
  '🍎', '🥦', '🥕', '🧅', '🧄', '🍋', '🍇', '🥩', '🍗', '🥛',
  '🧀', '🥚', '🍞', '🧁', '🍫', '🍷', '🧃',
  '🛒', '🏠', '🧹', '🧺', '🧴', '🪥', '🧻', '💊', '🐾', '👶',
  '🌿', '🌸', '⭐', '🎉', '❤️', '🔥', '💧', '🌙',
]

interface Props {
  current: string | null
  onSelect: (emoji: string | null) => void
  onClose: () => void
}

export function EmojiPickerSheet({ current, onSelect, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      <div className="emoji-picker-sheet__overlay" onClick={onClose} />
      <div
        className="emoji-picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Elegir emoji"
      >
        <div className="emoji-picker-sheet__handle" />
        <p className="emoji-picker-sheet__title">Elegir emoji</p>
        <div className="emoji-picker-sheet__grid">
          <button
            className={`emoji-picker-sheet__item emoji-picker-sheet__item--none${current === null ? ' emoji-picker-sheet__item--active' : ''}`}
            onClick={() => onSelect(null)}
            aria-label="Ninguno"
          >
            ∅
          </button>
          {CURATED_EMOJIS.map(emoji => (
            <button
              key={emoji}
              className={`emoji-picker-sheet__item${emoji === current ? ' emoji-picker-sheet__item--active' : ''}`}
              onClick={() => onSelect(emoji)}
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Create `EmojiPickerSheet.css`**

```css
.emoji-picker-sheet__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.emoji-picker-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-surface, #fff);
  border-radius: 1rem 1rem 0 0;
  padding: 0.5rem 1.25rem 2rem;
  z-index: 101;
  max-height: 60vh;
  overflow-y: auto;
}

.emoji-picker-sheet__handle {
  width: 2.5rem;
  height: 4px;
  background: var(--color-border, #e5e7eb);
  border-radius: 2px;
  margin: 0.5rem auto 1rem;
}

.emoji-picker-sheet__title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--color-text-secondary, #6b7280);
  margin: 0 0 0.75rem;
  text-align: center;
}

.emoji-picker-sheet__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.5rem;
}

.emoji-picker-sheet__item {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.5rem;
  background: none;
  border: 2px solid transparent;
  cursor: pointer;
  transition: background 0.1s;
}

.emoji-picker-sheet__item:active {
  background: var(--color-bg, #f9fafb);
}

.emoji-picker-sheet__item--active {
  border-color: var(--color-accent, #2563eb);
  background: var(--color-bg, #f9fafb);
}

.emoji-picker-sheet__item--none {
  font-size: 1.25rem;
  color: var(--color-text-secondary, #6b7280);
}
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd frontend
npx vitest run src/components/EmojiPickerSheet.test.tsx
```
Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/EmojiPickerSheet.tsx frontend/src/components/EmojiPickerSheet.css frontend/src/components/EmojiPickerSheet.test.tsx
git commit -m "feat(frontend): add EmojiPickerSheet component"
```

---

### Task 6: Frontend — ListCard and SortableListCard

**Files:**
- Modify: `frontend/src/components/ListCard.tsx`
- Modify: `frontend/src/components/ListCard.css`
- Modify: `frontend/src/components/ListCard.test.tsx`
- Modify: `frontend/src/components/SortableListCard.tsx`

- [ ] **Step 1: Update `makeList` and add `isOwner` to existing tests**

In `frontend/src/components/ListCard.test.tsx`:

1. Update `makeList` to include `emoji`:

```typescript
const makeList = (overrides: Partial<ApiList> = {}): ApiList => ({
  id: 'l1',
  name: 'Mercado semanal',
  emoji: null,
  owner_id: 'u1',
  created_at: '',
  updated_at: '',
  item_count: 8,
  purchased_count: 3,
  ...overrides,
})
```

2. Add `isOwner={false}` to all five existing `render(...)` calls (the ones inside the first `describe('ListCard')` block). `isOwner` is required on the updated component — omitting it will fail at runtime. Example — every existing render call becomes:

```tsx
render(<ListCard list={makeList()} isOwner={false} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
```

- [ ] **Step 2: Write new failing emoji tests**

Append to `frontend/src/components/ListCard.test.tsx`:

```tsx
describe('ListCard — emoji', () => {
  it('renders emoji as a tappable button for the owner', () => {
    render(
      <ListCard
        list={makeList({ emoji: '🛒' })}
        isOwner={true}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
        onEmojiTap={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /cambiar emoji/i })).toHaveTextContent('🛒')
  })

  it('renders emoji as a non-interactive span for non-owners', () => {
    render(
      <ListCard
        list={makeList({ emoji: '🛒' })}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /cambiar emoji/i })).not.toBeInTheDocument()
    expect(screen.getByText('🛒')).toBeInTheDocument()
  })

  it('renders nothing in the emoji slot when emoji is null (non-owner)', () => {
    const { container } = render(
      <ListCard
        list={makeList({ emoji: null })}
        isOwner={false}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
      />
    )
    expect(container.querySelector('.list-card__emoji')).not.toBeInTheDocument()
  })

  it('owner with null emoji sees a placeholder add button', () => {
    render(
      <ListCard
        list={makeList({ emoji: null })}
        isOwner={true}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
        onEmojiTap={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /añadir emoji/i })).toBeInTheDocument()
  })

  it('tapping emoji button calls onEmojiTap', () => {
    const onEmojiTap = vi.fn()
    render(
      <ListCard
        list={makeList({ emoji: '🛒' })}
        isOwner={true}
        onClick={vi.fn()}
        onMenuOpen={vi.fn()}
        onEmojiTap={onEmojiTap}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /cambiar emoji/i }))
    expect(onEmojiTap).toHaveBeenCalledOnce()
  })

  it('tapping emoji button does not trigger the list onClick', () => {
    const onClick = vi.fn()
    render(
      <ListCard
        list={makeList({ emoji: '🛒' })}
        isOwner={true}
        onClick={onClick}
        onMenuOpen={vi.fn()}
        onEmojiTap={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /cambiar emoji/i }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
```

Note: `makeList` doesn't include `emoji` yet — you also need to add `emoji: null` to its defaults:

```typescript
const makeList = (overrides: Partial<ApiList> = {}): ApiList => ({
  id: 'l1',
  name: 'Mercado semanal',
  emoji: null,
  owner_id: 'u1',
  created_at: '',
  updated_at: '',
  item_count: 8,
  purchased_count: 3,
  ...overrides,
})
```

- [ ] **Step 3: Run tests — confirm new emoji tests fail**

```bash
cd frontend
npx vitest run src/components/ListCard.test.tsx
```
Expected: Existing tests PASS (you already added `isOwner={false}` in Step 1); new emoji tests FAIL.

- [ ] **Step 4: Replace `ListCard.tsx`**

```tsx
import type { CSSProperties } from 'react'
import './ListCard.css'
import { ProgressBar } from './ProgressBar'
import type { ApiList } from '../types'

interface Props {
  list: ApiList
  isOwner: boolean
  onClick: () => void
  onMenuOpen: () => void
  onEmojiTap?: () => void
  dragHandleProps?: Record<string, unknown>
  style?: CSSProperties
  isDragging?: boolean
}

export function ListCard({
  list,
  isOwner,
  onClick,
  onMenuOpen,
  onEmojiTap,
  dragHandleProps,
  style,
  isDragging,
}: Props) {
  const { name, emoji, item_count, purchased_count } = list

  const emojiSlot = (() => {
    if (isOwner) {
      return (
        <button
          className={`list-card__emoji${!emoji ? ' list-card__emoji--placeholder' : ''}`}
          onClick={e => { e.stopPropagation(); onEmojiTap?.() }}
          aria-label={emoji ? 'Cambiar emoji' : 'Añadir emoji'}
        >
          {emoji ?? '＋'}
        </button>
      )
    }
    if (!emoji) return null
    return <span className="list-card__emoji" aria-hidden>{emoji}</span>
  })()

  return (
    <div className={`list-card${isDragging ? ' list-card--dragging' : ''}`} style={style}>
      <span className="list-card__drag-handle" aria-hidden {...dragHandleProps}>⠿</span>
      {emojiSlot}
      <button className="list-card__tap-target" onClick={onClick} aria-label={name}>
        <span className="list-card__name">{name}</span>
        <ProgressBar purchased={purchased_count} total={item_count} />
        {item_count > 0 && (
          <span className="list-card__subtitle">
            {purchased_count} de {item_count} comprados
          </span>
        )}
      </button>
      <button className="list-card__menu-btn" onClick={onMenuOpen} aria-label="Opciones">
        ⋯
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Append emoji styles to `ListCard.css`**

```css
.list-card__emoji {
  flex-shrink: 0;
  padding: 0 0.25rem 0 0.5rem;
  align-self: stretch;
  display: flex;
  align-items: center;
  font-size: 1.25rem;
  background: none;
  border: none;
  cursor: pointer;
  line-height: 1;
}

.list-card__emoji--placeholder {
  font-size: 0.875rem;
  color: var(--color-border, #e5e7eb);
}
```

- [ ] **Step 6: Replace `SortableListCard.tsx`**

```tsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ListCard } from './ListCard'
import type { ApiList } from '../types'

interface Props {
  list: ApiList
  isOwner: boolean
  onClick: () => void
  onMenuOpen: () => void
  onEmojiTap?: () => void
}

export function SortableListCard({ list, isOwner, onClick, onMenuOpen, onEmojiTap }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef}>
      <ListCard
        list={list}
        isOwner={isOwner}
        onClick={onClick}
        onMenuOpen={onMenuOpen}
        onEmojiTap={onEmojiTap}
        dragHandleProps={{ ...attributes, ...listeners }}
        style={style}
        isDragging={isDragging}
      />
    </div>
  )
}
```

- [ ] **Step 7: Run all ListCard tests**

```bash
cd frontend
npx vitest run src/components/ListCard.test.tsx
```
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ListCard.tsx frontend/src/components/ListCard.css frontend/src/components/ListCard.test.tsx frontend/src/components/SortableListCard.tsx
git commit -m "feat(frontend): add emoji slot to ListCard and SortableListCard"
```

---

### Task 7: Frontend — DashboardScreen

**Files:**
- Modify: `frontend/src/components/DashboardScreen.tsx`
- Modify: `frontend/src/components/DashboardScreen.test.tsx`

- [ ] **Step 1: Update test fixtures and mocks**

In `DashboardScreen.test.tsx`, make these changes:

1. Add `emoji` to `twoLists`:

```typescript
const twoLists = [
  { id: 'l1', name: 'Mercado', emoji: '🛒', owner_id: 'u1', created_at: '', updated_at: '', item_count: 8, purchased_count: 3 },
  { id: 'l2', name: 'Costco', emoji: '🏠', owner_id: 'u1', created_at: '', updated_at: '', item_count: 2, purchased_count: 0 },
]
```

2. In `beforeEach`, replace `api.renameList` with `api.updateList` and update `createList` mock:

```typescript
vi.mocked(api.createList).mockResolvedValue({
  id: 'l-new', name: 'Nueva', emoji: '🍎', owner_id: 'u1',
  created_at: '', updated_at: '', item_count: 0, purchased_count: 0,
} as never)
vi.mocked(api.updateList).mockResolvedValue({} as never)
vi.mocked(api.deleteList).mockResolvedValue(null as never)
```

3. Update the rename failure test to use `api.updateList`:

```typescript
it('rename failure reverts the name and shows a toast', async () => {
  vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
  vi.mocked(api.updateList).mockRejectedValue(new Error('Network'))
  render(<DashboardScreen />)
  await waitFor(() => screen.getByText('Mercado'))
  fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mercado Nuevo' } })
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
  expect(screen.getByText(/no se pudo renombrar/i)).toBeInTheDocument()
})
```

4. Add emoji tests at the end of the file:

```typescript
describe('DashboardScreen — emoji', () => {
  it('tapping the emoji button opens the EmojiPickerSheet', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /cambiar emoji/i })[0])
    expect(screen.getByRole('dialog', { name: /elegir emoji/i })).toBeInTheDocument()
  })

  it('selecting an emoji closes the sheet and calls updateList', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /cambiar emoji/i })[0])
    fireEvent.click(screen.getByRole('button', { name: '🍎' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /elegir emoji/i })).not.toBeInTheDocument()
    )
    expect(vi.mocked(api.updateList)).toHaveBeenCalledWith(
      expect.any(Function), 'l1', { emoji: '🍎' }
    )
  })

  it('emoji update failure reverts and shows toast', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.updateList).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /cambiar emoji/i })[0])
    fireEvent.click(screen.getByRole('button', { name: '🍎' }))
    await waitFor(() =>
      expect(screen.getByText(/no se pudo cambiar el emoji/i)).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run tests — confirm failures**

```bash
cd frontend
npx vitest run src/components/DashboardScreen.test.tsx
```
Expected: Failures on rename tests (wrong mock name) and new emoji tests.

- [ ] **Step 3: Replace `DashboardScreen.tsx`**

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import './DashboardScreen.css'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { getLists, createList, updateList, deleteList } from '../lib/api'
import { SortableListCard } from './SortableListCard'
import { CreateListCard } from './CreateListCard'
import { ListScreen } from './ListScreen'
import { ListActionSheet } from './ListActionSheet'
import { InstallBanner } from './InstallBanner'
import { EmojiPickerSheet, CURATED_EMOJIS } from './EmojiPickerSheet'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { useLocation } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ApiList } from '../types'

function loadOrder(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(`list-order-${userId}`)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function saveOrder(userId: string, ids: string[]) {
  localStorage.setItem(`list-order-${userId}`, JSON.stringify(ids))
}

function applyOrder(lists: ApiList[], order: string[] | null): ApiList[] {
  if (!order) return lists
  const map = new Map(lists.map(l => [l.id, l]))
  const sorted = order.flatMap(id => (map.has(id) ? [map.get(id)!] : []))
  const rest = lists.filter(l => !order.includes(l.id))
  return [...sorted, ...rest]
}

function randomEmoji(): string {
  return CURATED_EMOJIS[Math.floor(Math.random() * CURATED_EMOJIS.length)]
}

export function DashboardScreen() {
  const { user, getToken, signOut } = useAuth()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [selectedList, setSelectedList] = useState<ApiList | null>(null)
  usePageTitle(selectedList?.name ?? undefined)
  const [activeList, setActiveList] = useState<ApiList | null>(null)
  const [emojiList, setEmojiList] = useState<ApiList | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const openListIdRef = useRef<string | null>(
    (location.state as { openListId?: string } | null)?.openListId ?? null
  )
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall()

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  const fetchLists = useCallback(async () => {
    setLists(null)
    setFetchError(false)
    try {
      const data = (await getLists(getToken)) as ApiList[]
      const ordered = applyOrder(data, loadOrder(user!.id))
      setLists(ordered)
      if (openListIdRef.current) {
        const list = ordered.find(l => l.id === openListIdRef.current)
        if (list) setSelectedList(list)
        openListIdRef.current = null
      }
    } catch {
      setFetchError(true)
    }
  }, [getToken, user])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLists(prev => {
      if (!prev) return prev
      const oldIndex = prev.findIndex(l => l.id === active.id)
      const newIndex = prev.findIndex(l => l.id === over.id)
      const next = arrayMove(prev, oldIndex, newIndex)
      saveOrder(user!.id, next.map(l => l.id))
      return next
    })
  }, [user])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLists()
  }, [fetchLists])

  const handleCreate = useCallback(
    async (name: string) => {
      await createList(getToken, { name, emoji: randomEmoji() })
      await fetchLists()
    },
    [getToken, fetchLists],
  )

  const handleRename = useCallback(
    async (list: ApiList, newName: string) => {
      let snapshot: ApiList[] | null = null
      setLists(prev => {
        snapshot = prev
        return prev ? prev.map(l => l.id === list.id ? { ...l, name: newName } : l) : prev
      })
      setActiveList(null)
      try {
        await updateList(getToken, list.id, { name: newName })
      } catch {
        setLists(snapshot)
        setToast('No se pudo renombrar la lista')
      }
    },
    [getToken],
  )

  const handleEmojiChange = useCallback(
    async (list: ApiList, emoji: string | null) => {
      let snapshot: ApiList[] | null = null
      setLists(prev => {
        snapshot = prev
        return prev ? prev.map(l => l.id === list.id ? { ...l, emoji } : l) : prev
      })
      setEmojiList(null)
      try {
        await updateList(getToken, list.id, { emoji })
      } catch {
        setLists(snapshot)
        setToast('No se pudo cambiar el emoji')
      }
    },
    [getToken],
  )

  const handleDelete = useCallback(
    async (list: ApiList) => {
      setActiveList(null)
      try {
        await deleteList(getToken, list.id)
        setLists(prev => prev ? prev.filter(l => l.id !== list.id) : prev)
      } catch {
        setToast('No se pudo eliminar la lista')
      }
    },
    [getToken],
  )

  if (selectedList) {
    return (
      <ListScreen
        listId={selectedList.id}
        listName={selectedList.name}
        listEmoji={selectedList.emoji}
        listOwnerId={selectedList.owner_id}
        onBack={() => setSelectedList(null)}
      />
    )
  }

  if (fetchError) {
    return (
      <div className="dashboard-screen dashboard-screen--centered">
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          No se pudieron cargar tus listas
        </p>
        <button className="dashboard-screen__retry" onClick={() => void fetchLists()}>
          Reintentar
        </button>
      </div>
    )
  }

  if (lists === null) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        className="dashboard-screen dashboard-screen--centered"
      >
        <span className="dashboard-screen__spinner" />
      </div>
    )
  }

  const showInstallEntry = (isInstallable || isIOS) && !isInstalled

  return (
    <div className="dashboard-screen">
      <header className="dashboard-screen__header">
        <h1 className="dashboard-screen__title">CarroQueSí</h1>
        <div className="dashboard-screen__avatar-wrapper" ref={menuRef}>
          <button
            className="dashboard-screen__avatar"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menú de usuario"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt={user.displayName} />
            ) : (
              <span>{user?.displayName?.[0] ?? '?'}</span>
            )}
          </button>
          {menuOpen && (
            <div className="dashboard-screen__avatar-menu" role="menu">
              {showInstallEntry && (
                <button
                  className="dashboard-screen__avatar-menu-item"
                  role="menuitem"
                  onClick={() => { void promptInstall(); setMenuOpen(false) }}
                >
                  Instalar app
                </button>
              )}
              <button
                className="dashboard-screen__avatar-menu-item"
                role="menuitem"
                onClick={() => { void signOut(); setMenuOpen(false) }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="dashboard-screen__lists">
        <InstallBanner
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          promptInstall={promptInstall}
        />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={lists.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {lists.map((list) => (
              <SortableListCard
                key={list.id}
                list={list}
                isOwner={list.owner_id === (user?.id ?? '')}
                onClick={() => { setSelectedList(list); setActiveList(null) }}
                onMenuOpen={() => { setActiveList(list) }}
                onEmojiTap={() => { setEmojiList(list) }}
              />
            ))}
          </SortableContext>
        </DndContext>
        <CreateListCard isFirst={lists.length === 0} onCreate={handleCreate} />
      </main>
      {activeList && (
        <ListActionSheet
          list={activeList}
          isOwner={activeList.owner_id === (user?.id ?? '')}
          onRename={newName => void handleRename(activeList, newName)}
          onDelete={() => void handleDelete(activeList)}
          onClose={() => setActiveList(null)}
        />
      )}
      {emojiList && (
        <EmojiPickerSheet
          current={emojiList.emoji}
          onSelect={emoji => void handleEmojiChange(emojiList, emoji)}
          onClose={() => setEmojiList(null)}
        />
      )}
      {toast && (
        <div className="dashboard-screen__toast" role="alert">{toast}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run all DashboardScreen tests**

```bash
cd frontend
npx vitest run src/components/DashboardScreen.test.tsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardScreen.tsx frontend/src/components/DashboardScreen.test.tsx
git commit -m "feat(frontend): wire EmojiPickerSheet into DashboardScreen"
```

---

### Task 8: Frontend — ListHeader and ListScreen

**Files:**
- Modify: `frontend/src/components/ListHeader.tsx`
- Modify: `frontend/src/components/ListScreen.tsx`
- Modify: `frontend/src/components/ListScreen.test.tsx`

- [ ] **Step 1: Replace `ListHeader.tsx`**

```tsx
import './ListHeader.css'

interface Props {
  title: string
  emoji: string | null
  onMenuOpen: () => void
  onBack?: () => void
}

export function ListHeader({ title, emoji, onMenuOpen, onBack }: Props) {
  return (
    <header className="list-header">
      {onBack ? (
        <button className="list-header__back" onClick={onBack} aria-label="Volver">
          <span aria-hidden>‹</span> Listas
        </button>
      ) : (
        <div className="list-header__back" aria-hidden />
      )}
      <h1 className="list-header__title">
        {emoji && <span className="list-header__emoji" aria-hidden>{emoji} </span>}
        {title}
      </h1>
      <button
        className="list-header__menu"
        onClick={onMenuOpen}
        aria-label="Abrir menú"
      >
        <span /><span /><span />
      </button>
    </header>
  )
}
```

- [ ] **Step 2: Update `ListScreen.tsx` — add `listEmoji` prop**

Change only the `Props` interface, the destructuring, and the `<ListHeader>` call. All other code is unchanged.

Replace the Props interface:
```tsx
interface Props {
  listId: string
  listName: string
  listEmoji?: string | null
  listOwnerId: string
  onBack?: () => void
}
```

Update the function signature:
```tsx
export function ListScreen({ listId, listName, listEmoji = null, listOwnerId, onBack }: Props) {
```

Update the `<ListHeader>` call (line 149 in the original):
```tsx
<ListHeader title={listName} emoji={listEmoji} onMenuOpen={handleMenuToggle} onBack={onBack} />
```

- [ ] **Step 3: Add test to `ListScreen.test.tsx`**

Append inside the `describe('ListScreen')` block:

```tsx
it('renders emoji before the list name in the header when provided', () => {
  render(
    <ListScreen listId="l1" listName="Mercado Semanal" listEmoji="🛒" listOwnerId="owner-1" />
  )
  const heading = screen.getByRole('heading')
  expect(heading.textContent).toContain('🛒')
  expect(heading.textContent).toContain('Mercado Semanal')
})

it('existing heading accessible name is unchanged when emoji is provided (emoji is aria-hidden)', () => {
  render(
    <ListScreen listId="l1" listName="Mercado Semanal" listEmoji="🛒" listOwnerId="owner-1" />
  )
  expect(screen.getByRole('heading', { name: 'Mercado Semanal' })).toBeInTheDocument()
})
```

- [ ] **Step 4: Run ListScreen tests**

```bash
cd frontend
npx vitest run src/components/ListScreen.test.tsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ListHeader.tsx frontend/src/components/ListScreen.tsx frontend/src/components/ListScreen.test.tsx
git commit -m "feat(frontend): show list emoji in ListHeader"
```

---

### Task 9: Frontend — InviteScreen

**Files:**
- Modify: `frontend/src/components/InviteScreen.tsx`
- Modify: `frontend/src/components/InviteScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

In `InviteScreen.test.tsx`:

1. Update `previewData` to include `list_emoji`:

```typescript
const previewData = { id: 'inv123', list_name: 'Compras', list_emoji: '🛒', invited_by_name: 'Ana' }
```

2. Append new tests:

```typescript
test('shows list emoji from preview instead of hardcoded icon', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue({ ...previewData, list_emoji: '🍎' })
  render(<InviteScreen />)
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
  expect(screen.getByText('🍎')).toBeInTheDocument()
})

test('falls back to 🛒 when list_emoji is null', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue({ ...previewData, list_emoji: null })
  render(<InviteScreen />)
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
  expect(screen.getByText('🛒')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests — confirm new tests fail**

```bash
cd frontend
npx vitest run src/components/InviteScreen.test.tsx
```
Expected: Existing tests may also fail (type mismatch on `previewData`); new tests fail.

- [ ] **Step 3: Update `InviteScreen.tsx`**

Two targeted changes:

1. Add `list_emoji` to the `Preview` interface (around line 12):

```typescript
interface Preview {
  id: string
  list_name: string
  list_emoji: string | null
  invited_by_name: string | null
}
```

2. Replace the hardcoded icon (line 138):

```tsx
<div className="invite-screen__icon">{preview.list_emoji ?? '🛒'}</div>
```

- [ ] **Step 4: Run all InviteScreen tests**

```bash
cd frontend
npx vitest run src/components/InviteScreen.test.tsx
```
Expected: All tests PASS.

- [ ] **Step 5: Full typecheck and test suite**

```bash
cd frontend
npx tsc -p tsconfig.app.json --noEmit && npx vitest run
```
Expected: Zero type errors, all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/InviteScreen.tsx frontend/src/components/InviteScreen.test.tsx
git commit -m "feat(frontend): show dynamic list emoji in InviteScreen"
```

---

### Task 10: Final integration check

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend
uv run pytest -v
```
Expected: All tests PASS.

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend
npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 3: Manual smoke test**

1. Start the backend: `cd backend && uv run uvicorn app.main:app --reload`
2. Start the frontend: `cd frontend && npm run dev`
3. Create a new list — confirm it appears with a random emoji on the card.
4. Tap the emoji — confirm `EmojiPickerSheet` opens with a grid.
5. Pick a new emoji — confirm the card updates immediately.
6. Navigate into the list — confirm the emoji appears in the header title.
7. Create an invite link and open it — confirm the emoji appears on the invite preview screen.
8. Set emoji to "Ninguno" — confirm the emoji disappears from the card and header.
9. As a non-owner member, confirm no emoji button is shown (read-only span or nothing).
