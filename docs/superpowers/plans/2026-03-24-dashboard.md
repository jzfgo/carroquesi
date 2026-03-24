# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ListLoader` with a full home screen (`DashboardScreen`) that shows all of a user's lists (with progress bars), lets them navigate into one, and create new ones.

**Architecture:** Navigation state lives in a single `useState<string | null>` in `DashboardScreen` — no routing library. When `selectedListId` is set, `ListScreen` is rendered in place; when null, the dashboard grid is shown. The backend's `GET /lists` is extended with `item_count` and `purchased_count` via a SQL aggregation query so the frontend needs only one API call to render the dashboard.

**Tech Stack:** FastAPI, SQLModel/SQLAlchemy, pytest (backend); React 18, TypeScript, Vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-03-24-dashboard-design.md`

---

## File Map

### Backend — modified
| File | Change |
|------|--------|
| `backend/app/schemas/lists.py` | Add `item_count: int = 0` and `purchased_count: int = 0` to `ListRead` |
| `backend/app/routers/lists.py` | Rewrite `get_lists` to use a SQL aggregation query for counts |
| `backend/tests/test_lists.py` | Add two tests: counts default to 0, counts reflect real items |

### Frontend — new files
| File | Purpose |
|------|---------|
| `frontend/src/components/ListCard.tsx` | Presentational card: name + ProgressBar + "X de Y comprados" |
| `frontend/src/components/ListCard.css` | Styles for ListCard |
| `frontend/src/components/ListCard.test.tsx` | Tests for ListCard |
| `frontend/src/components/CreateListCard.tsx` | Tap-to-expand inline create card |
| `frontend/src/components/CreateListCard.css` | Styles for CreateListCard |
| `frontend/src/components/CreateListCard.test.tsx` | Tests for CreateListCard |
| `frontend/src/components/DashboardScreen.tsx` | Top-level screen: fetches lists, owns nav state |
| `frontend/src/components/DashboardScreen.css` | Styles for DashboardScreen |
| `frontend/src/components/DashboardScreen.test.tsx` | Tests: loading, error, empty, list display, navigation |

### Frontend — modified
| File | Change |
|------|--------|
| `frontend/src/types.ts` | Add `ApiList` interface (with summary fields) |
| `frontend/src/components/ListScreen.tsx` | Add `onBack: () => void` prop |
| `frontend/src/App.tsx` | Import `DashboardScreen`, remove `ListLoader` import |

### Frontend — deleted
| File | Reason |
|------|--------|
| `frontend/src/components/ListLoader.tsx` | Replaced by `DashboardScreen` |
| `frontend/src/components/ListLoader.test.tsx` | Replaced by `DashboardScreen.test.tsx` |

---

## Task 1: Backend schema — add summary fields to `ListRead`

**Files:**
- Modify: `backend/app/schemas/lists.py`
- Modify: `backend/tests/test_lists.py`

- [ ] **Step 1.1: Write the failing test**

Add to `backend/tests/test_lists.py`:

```python
def test_get_lists_includes_zero_counts_when_no_items(client: TestClient):
    client.post("/lists", json={"name": "Empty List"})
    response = client.get("/lists")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["item_count"] == 0
    assert data[0]["purchased_count"] == 0
```

- [ ] **Step 1.2: Run test — verify it fails**

```bash
cd backend && uv run pytest tests/test_lists.py::test_get_lists_includes_zero_counts_when_no_items -v
```

Expected: FAIL — `item_count` key not present in response.

- [ ] **Step 1.3: Add fields to `ListRead`**

Replace the contents of `backend/app/schemas/lists.py`:

```python
from datetime import datetime
from pydantic import BaseModel


class ListCreate(BaseModel):
    name: str


class ListUpdate(BaseModel):
    name: str


class ListRead(BaseModel):
    id: str
    name: str
    owner_id: str
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    purchased_count: int = 0
```

- [ ] **Step 1.4: Run test — verify it passes**

```bash
cd backend && uv run pytest tests/test_lists.py::test_get_lists_includes_zero_counts_when_no_items -v
```

Expected: PASS (fields default to 0; the aggregation that fills them comes in Task 2).

---

## Task 2: Backend router — aggregation query in `get_lists`

**Files:**
- Modify: `backend/app/routers/lists.py`
- Modify: `backend/tests/test_lists.py`

- [ ] **Step 2.1: Write the failing test**

Add to `backend/tests/test_lists.py`:

```python
def test_get_lists_returns_correct_counts(client: TestClient):
    list_resp = client.post("/lists", json={"name": "Mi Lista"})
    list_id = list_resp.json()["id"]

    # Add 3 items; mark 1 as purchased
    item1 = client.post(f"/lists/{list_id}/items", json={"name": "Leche"}).json()
    client.post(f"/lists/{list_id}/items", json={"name": "Pan"})
    client.post(f"/lists/{list_id}/items", json={"name": "Huevos"})
    client.patch(f"/lists/{list_id}/items/{item1['id']}", json={"purchased": True})

    response = client.get("/lists")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["item_count"] == 3
    assert data[0]["purchased_count"] == 1
```

- [ ] **Step 2.2: Run test — verify it fails**

```bash
cd backend && uv run pytest tests/test_lists.py::test_get_lists_returns_correct_counts -v
```

Expected: FAIL — counts are 0 regardless of items.

- [ ] **Step 2.3: Implement aggregation in `get_lists`**

Add to the imports at the top of `backend/app/routers/lists.py`:

```python
from sqlalchemy import case, func
```

Replace the `get_lists` function:

```python
@router.get("", response_model=list[ListRead])
def get_lists(current_user: CurrentUser, session: CurrentSession):
    memberships = session.exec(
        select(ListMember).where(ListMember.user_id == current_user.id)
    ).all()
    list_ids = [m.list_id for m in memberships]

    if not list_ids:
        return []

    lists = session.exec(
        select(List).where(List.id.in_(list_ids)).order_by(List.updated_at.desc())
    ).all()

    # Single aggregation query — counts for all lists at once.
    # Uses session.execute (SQLAlchemy) rather than session.exec (SQLModel)
    # because it returns named-column Row objects from aggregation queries.
    count_stmt = (
        select(
            ListItem.list_id,
            func.count(ListItem.id).label("item_count"),
            func.coalesce(
                func.sum(case((ListItem.purchased == True, 1), else_=0)), 0
            ).label("purchased_count"),
        )
        .where(ListItem.list_id.in_(list_ids))
        .group_by(ListItem.list_id)
    )
    count_rows = session.execute(count_stmt).all()
    counts = {row.list_id: (row.item_count, row.purchased_count) for row in count_rows}

    return [
        ListRead(
            **lst.model_dump(),
            item_count=counts.get(lst.id, (0, 0))[0],
            purchased_count=counts.get(lst.id, (0, 0))[1],
        )
        for lst in lists
    ]
```

- [ ] **Step 2.4: Run all list tests**

```bash
cd backend && uv run pytest tests/test_lists.py -v
```

Expected: All PASS, including the two new tests.

- [ ] **Step 2.5: Run full test suite**

```bash
cd backend && uv run pytest -v
```

Expected: All PASS. No regressions.

- [ ] **Step 2.6: Commit**

```bash
git add backend/app/schemas/lists.py backend/app/routers/lists.py backend/tests/test_lists.py
git commit -m "feat: add item_count and purchased_count to GET /lists"
```

---

## Task 3: Frontend types — add `ApiList` interface

**Files:**
- Modify: `frontend/src/types.ts`

No test needed — type-only change verified by TypeScript compilation.

- [ ] **Step 3.1: Add `ApiList` to `types.ts`**

Add to the bottom of `frontend/src/types.ts`:

```typescript
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

- [ ] **Step 3.2: Verify TypeScript is happy**

```bash
cd frontend && npm run typecheck
```

Expected: No errors.

- [ ] **Step 3.3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add ApiList type with item_count and purchased_count"
```

---

## Task 4: `ListCard` component

A small presentational component that renders a single list's name, progress bar, and subtitle. Reuses the existing `ProgressBar` component.

**Files:**
- Create: `frontend/src/components/ListCard.tsx`
- Create: `frontend/src/components/ListCard.css`
- Create: `frontend/src/components/ListCard.test.tsx`

- [ ] **Step 4.1: Write the failing tests**

Create `frontend/src/components/ListCard.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ListCard } from './ListCard'
import type { ApiList } from '../types'

const makeList = (overrides: Partial<ApiList> = {}): ApiList => ({
  id: 'l1',
  name: 'Mercado semanal',
  owner_id: 'u1',
  created_at: '',
  updated_at: '',
  item_count: 8,
  purchased_count: 3,
  ...overrides,
})

describe('ListCard', () => {
  it('shows the list name', () => {
    render(<ListCard list={makeList()} onClick={vi.fn()} />)
    expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
  })

  it('shows "X de Y comprados" subtitle when items exist', () => {
    render(<ListCard list={makeList({ item_count: 8, purchased_count: 3 })} onClick={vi.fn()} />)
    expect(screen.getByText('3 de 8 comprados')).toBeInTheDocument()
  })

  it('hides subtitle when item_count is 0', () => {
    render(<ListCard list={makeList({ item_count: 0, purchased_count: 0 })} onClick={vi.fn()} />)
    expect(screen.queryByText(/comprados/)).not.toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<ListCard list={makeList()} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 4.2: Run tests — verify they fail**

```bash
cd frontend && npx vitest run src/components/ListCard.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4.3: Create `ListCard.tsx`**

```typescript
import './ListCard.css'
import { ProgressBar } from './ProgressBar'
import type { ApiList } from '../types'

interface Props {
  list: ApiList
  onClick: () => void
}

export function ListCard({ list, onClick }: Props) {
  const { name, item_count, purchased_count } = list
  return (
    <button className="list-card" onClick={onClick}>
      <span className="list-card__name">{name}</span>
      <ProgressBar purchased={purchased_count} total={item_count} />
      {item_count > 0 && (
        <span className="list-card__subtitle">
          {purchased_count} de {item_count} comprados
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 4.4: Create `ListCard.css`**

```css
.list-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.list-card:active {
  background: var(--color-bg, #f9fafb);
}

.list-card__name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--color-text, #111827);
}

.list-card__subtitle {
  font-size: 0.75rem;
  color: var(--color-text-secondary, #6b7280);
}
```

- [ ] **Step 4.5: Run tests — verify they pass**

```bash
cd frontend && npx vitest run src/components/ListCard.test.tsx
```

Expected: All PASS.

- [ ] **Step 4.6: Commit**

```bash
git add frontend/src/components/ListCard.tsx frontend/src/components/ListCard.css frontend/src/components/ListCard.test.tsx
git commit -m "feat: add ListCard component with progress bar"
```

---

## Task 5: `CreateListCard` component

Tap-to-expand inline card for creating a new list. Collapsed: dashed "+" card. Expanded: input + confirm button.

**Files:**
- Create: `frontend/src/components/CreateListCard.tsx`
- Create: `frontend/src/components/CreateListCard.css`
- Create: `frontend/src/components/CreateListCard.test.tsx`

- [ ] **Step 5.1: Write the failing tests**

Create `frontend/src/components/CreateListCard.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CreateListCard } from './CreateListCard'

describe('CreateListCard', () => {
  it('shows "Crea tu primera lista" when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(screen.getByText(/primera lista/i)).toBeInTheDocument()
  })

  it('shows "+ Nueva lista" when not isFirst', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    expect(screen.getByText(/nueva lista/i)).toBeInTheDocument()
  })

  it('expands to input when clicked', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument()
  })

  it('confirm button is disabled when name is empty', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: /crear/i })).toBeDisabled()
  })

  it('calls onCreate with the typed name and collapses', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<CreateListCard onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Costco' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Costco'))
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/nombre/i)).not.toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 5.2: Run tests — verify they fail**

```bash
cd frontend && npx vitest run src/components/CreateListCard.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Create `CreateListCard.tsx`**

```typescript
import { useState } from 'react'
import './CreateListCard.css'

interface Props {
  isFirst?: boolean
  onCreate: (name: string) => Promise<void>
}

export function CreateListCard({ isFirst, onCreate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  if (!expanded) {
    return (
      <button className="create-list-card" onClick={() => setExpanded(true)}>
        {isFirst ? 'Crea tu primera lista' : '+ Nueva lista'}
      </button>
    )
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setCreating(true)
    await onCreate(name.trim())
    setName('')
    setExpanded(false)
    setCreating(false)
  }

  return (
    <div className="create-list-card create-list-card--expanded">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la lista"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit()
          if (e.key === 'Escape') { setExpanded(false); setName('') }
        }}
      />
      <button
        disabled={!name.trim() || creating}
        onClick={() => void handleSubmit()}
      >
        Crear lista
      </button>
    </div>
  )
}
```

- [ ] **Step 5.4: Create `CreateListCard.css`**

```css
.create-list-card {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 1rem;
  border: 1.5px dashed var(--color-border, #d1d5db);
  border-radius: 0.75rem;
  background: transparent;
  color: var(--color-text-secondary, #6b7280);
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.create-list-card:hover {
  border-color: var(--color-primary, #6366f1);
  color: var(--color-primary, #6366f1);
}

.create-list-card--expanded {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1.5px solid var(--color-border, #d1d5db);
  border-radius: 0.75rem;
  background: var(--color-surface, #fff);
}

.create-list-card--expanded input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.9rem;
  background: transparent;
}

.create-list-card--expanded button {
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  background: var(--color-primary, #6366f1);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 0.875rem;
  white-space: nowrap;
}

.create-list-card--expanded button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 5.5: Run tests — verify they pass**

```bash
cd frontend && npx vitest run src/components/CreateListCard.test.tsx
```

Expected: All PASS.

- [ ] **Step 5.6: Commit**

```bash
git add frontend/src/components/CreateListCard.tsx frontend/src/components/CreateListCard.css frontend/src/components/CreateListCard.test.tsx
git commit -m "feat: add CreateListCard with tap-to-expand behavior"
```

---

## Task 6: Add `onBack` prop to `ListScreen`

Small change so `DashboardScreen` can pass a callback that returns the user to the list picker.

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`

- [ ] **Step 6.1: Update the `Props` interface in `ListScreen.tsx`**

Change:

```typescript
interface Props {
  listId: string
}

export function ListScreen({ listId }: Props) {
```

To:

```typescript
interface Props {
  listId: string
  onBack?: () => void
}

export function ListScreen({ listId, onBack }: Props) {
```

- [ ] **Step 6.2: Add the back button to the render output**

Inside the `return (...)`, add a back button as the first child of `<div className="list-screen">`. The existing `.list-screen` CSS rule already sets `position: relative`, so `position: absolute` on the button will anchor correctly inside the list screen container.

```typescript
  return (
    <div className="list-screen">
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Volver"
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.25rem',
            color: 'var(--color-text-secondary)',
            zIndex: 10,
          }}
        >
          ←
        </button>
      )}
      <ListHeader title="Mi lista" onMenuOpen={() => {}} />
      {/* ... rest unchanged ... */}
```

- [ ] **Step 6.3: TypeScript check**

```bash
cd frontend && npm run typecheck
```

Expected: No errors. The prop is optional so no call sites break.

- [ ] **Step 6.4: Commit**

```bash
git add frontend/src/components/ListScreen.tsx
git commit -m "feat: add optional onBack prop to ListScreen"
```

---

## Task 7: `DashboardScreen` — main dashboard

The heart of the feature: fetches lists, owns navigation state, renders header + cards + create card.

**Files:**
- Create: `frontend/src/components/DashboardScreen.tsx`
- Create: `frontend/src/components/DashboardScreen.css`
- Create: `frontend/src/components/DashboardScreen.test.tsx`

- [ ] **Step 7.1: Write the failing tests**

Create `frontend/src/components/DashboardScreen.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DashboardScreen } from './DashboardScreen'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api')
vi.mock('./ListScreen', () => ({
  ListScreen: ({ listId, onBack }: { listId: string; onBack: () => void }) => (
    <div>
      <span>ListScreen:{listId}</span>
      <button onClick={onBack}>Volver</button>
    </div>
  ),
}))

const mockGetToken = vi.fn().mockResolvedValue('token')
const mockSignOut = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: mockSignOut,
    loading: false,
  })
  vi.mocked(api.createList).mockResolvedValue({
    id: 'l-new', name: 'Nueva', owner_id: 'u1',
    created_at: '', updated_at: '', item_count: 0, purchased_count: 0,
  } as never)
})

const twoLists = [
  { id: 'l1', name: 'Mercado', owner_id: 'u1', created_at: '', updated_at: '', item_count: 8, purchased_count: 3 },
  { id: 'l2', name: 'Costco', owner_id: 'u1', created_at: '', updated_at: '', item_count: 2, purchased_count: 0 },
]

describe('DashboardScreen', () => {
  it('shows loading spinner while fetching', () => {
    vi.mocked(api.getLists).mockReturnValue(new Promise(() => {}))
    render(<DashboardScreen />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows list cards after successful fetch', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(screen.getByText('Costco')).toBeInTheDocument()
  })

  it('shows progress subtitle on list cards', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('3 de 8 comprados')).toBeInTheDocument())
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(api.getLists).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument(),
    )
  })

  it('shows create-first-list prompt when no lists', async () => {
    vi.mocked(api.getLists).mockResolvedValue([] as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText(/primera lista/i)).toBeInTheDocument())
  })

  it('navigates into a list when a card is tapped', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByText('Mercado'))
    expect(screen.getByText('ListScreen:l1')).toBeInTheDocument()
  })

  it('returns to dashboard when onBack is called from ListScreen', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /volver/i }))
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
  })

  it('calls signOut when avatar is clicked', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 7.2: Run tests — verify they fail**

```bash
cd frontend && npx vitest run src/components/DashboardScreen.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 7.3: Create `DashboardScreen.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import './DashboardScreen.css'
import { useAuth } from '../contexts/AuthContext'
import { getLists, createList } from '../lib/api'
import { ListCard } from './ListCard'
import { CreateListCard } from './CreateListCard'
import { ListScreen } from './ListScreen'
import type { ApiList } from '../types'

export function DashboardScreen() {
  const { user, getToken, signOut } = useAuth()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)

  const fetchLists = useCallback(async () => {
    setLists(null)
    setFetchError(false)
    try {
      const data = (await getLists(getToken)) as ApiList[]
      setLists(data)
    } catch {
      setFetchError(true)
    }
  }, [getToken])

  useEffect(() => {
    void fetchLists()
  }, [fetchLists])

  const handleCreate = useCallback(
    async (name: string) => {
      await createList(getToken, name)
      await fetchLists()
    },
    [getToken, fetchLists],
  )

  if (selectedListId) {
    return (
      <ListScreen
        listId={selectedListId}
        onBack={() => setSelectedListId(null)}
      />
    )
  }

  if (fetchError) {
    return (
      <div className="dashboard-screen dashboard-screen--centered">
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          No se pudieron cargar tus listas
        </p>
        <button onClick={() => void fetchLists()}>Reintentar</button>
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

  return (
    <div className="dashboard-screen">
      <header className="dashboard-screen__header">
        <h1 className="dashboard-screen__title">CarroQueSí</h1>
        <button
          className="dashboard-screen__avatar"
          onClick={() => void signOut()}
          aria-label="Cerrar sesión"
        >
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user.displayName} />
          ) : (
            <span>{user?.displayName?.[0] ?? '?'}</span>
          )}
        </button>
      </header>
      <main className="dashboard-screen__lists">
        {lists.map((list) => (
          <ListCard
            key={list.id}
            list={list}
            onClick={() => setSelectedListId(list.id)}
          />
        ))}
        <CreateListCard isFirst={lists.length === 0} onCreate={handleCreate} />
      </main>
    </div>
  )
}
```

- [ ] **Step 7.4: Create `DashboardScreen.css`**

```css
.dashboard-screen {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--color-bg, #f9fafb);
}

.dashboard-screen--centered {
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
}

.dashboard-screen__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.25rem 0.75rem;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.dashboard-screen__title {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-text, #111827);
}

.dashboard-screen__avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: none;
  background: var(--color-primary, #6366f1);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard-screen__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dashboard-screen__lists {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
}

.dashboard-screen__spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--color-border, #e5e7eb);
  border-top-color: var(--color-primary, #6366f1);
  animation: spin 0.8s linear infinite;
  display: block;
}
```

- [ ] **Step 7.5: Run tests — verify they pass**

```bash
cd frontend && npx vitest run src/components/DashboardScreen.test.tsx
```

Expected: All PASS.

- [ ] **Step 7.6: Commit**

```bash
git add frontend/src/components/DashboardScreen.tsx frontend/src/components/DashboardScreen.css frontend/src/components/DashboardScreen.test.tsx
git commit -m "feat: add DashboardScreen with list navigation and create"
```

---

## Task 8: Wire `App.tsx` and remove `ListLoader`

**Files:**
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/components/ListLoader.tsx`
- Delete: `frontend/src/components/ListLoader.test.tsx`

- [ ] **Step 8.1: Update `App.tsx`**

Replace the full contents of `frontend/src/App.tsx`:

```typescript
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SignInScreen } from './components/SignInScreen'
import { DashboardScreen } from './components/DashboardScreen'

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-primary)',
            animation: 'spin 0.8s linear infinite',
            display: 'block',
          }}
        />
      </div>
    )
  }

  if (!user) return <SignInScreen />
  return <DashboardScreen />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
```

- [ ] **Step 8.2: Delete `ListLoader` files**

```bash
git rm frontend/src/components/ListLoader.tsx frontend/src/components/ListLoader.test.tsx
```

- [ ] **Step 8.3: Run the full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: All PASS. No references to `ListLoader` remain.

- [ ] **Step 8.4: TypeScript check and lint**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: No errors.

- [ ] **Step 8.5: Commit**

Note: the `git rm` in Step 8.2 already staged the deletions. Only `App.tsx` needs to be added.

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire DashboardScreen into App; remove ListLoader"
```

---

## Done

At this point:
- `GET /lists` returns `item_count` and `purchased_count`
- The dashboard shows all lists with progress bars
- Tapping a list opens `ListScreen`; the back arrow returns to the dashboard
- Creating a list works from the dashboard
- All tests pass

Final verification:

```bash
cd backend && uv run pytest -v
cd frontend && npx vitest run && npm run typecheck && npm run lint
```
