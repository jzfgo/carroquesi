# List Members Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the hamburger menu button in ListHeader to a flat bottom sheet showing list members, with member removal, invite link creation (max 5 members, max 5 open invites, 24h expiry), and a 5-member cap enforced on invite acceptance.

**Architecture:** New `list_invites_router` added to `invites.py` handles `POST /lists/{list_id}/invites` with inline expiry cleanup and limit checks. New self-contained `ListMembersSheet` component fetches its own members, handles optimistic remove, and copies invite URLs to clipboard. `ListScreen` grows a `listOwnerId` prop and `menuOpen` state; `DashboardScreen` passes `listOwnerId` from its `ApiList` objects.

**Tech Stack:** FastAPI + SQLModel (backend), React 19 + TypeScript + Vitest + @testing-library/react (frontend)

---

## File Map

| File | Change |
|---|---|
| `backend/app/routers/invites.py` | Add `list_invites_router` + member cap in `accept_invite` |
| `backend/app/main.py` | Register `list_invites_router` |
| `backend/tests/conftest.py` | Add `list_invites_router` to test app |
| `backend/tests/test_invites.py` | New test cases |
| `frontend/src/lib/api.ts` | Add `removeMember`, `createOpenInvite` |
| `frontend/src/components/ListMembersSheet.tsx` | Create |
| `frontend/src/components/ListMembersSheet.css` | Create |
| `frontend/src/components/ListMembersSheet.test.tsx` | Create |
| `frontend/src/components/ListScreen.tsx` | Add `listOwnerId` prop, `menuOpen` state, wire sheet |
| `frontend/src/components/DashboardScreen.tsx` | Pass `listOwnerId` to `ListScreen` |
| `frontend/src/components/ListScreen.test.tsx` | Update existing render call + add menu test |

---

## Task 1: Backend — invite creation endpoint and member cap

**Files:**
- Modify: `backend/app/routers/invites.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_invites.py`

**Context:**
- `invites.py` has one `router = APIRouter(prefix="/invites")`. Add a second `list_invites_router = APIRouter(prefix="/lists/{list_id}/invites", tags=["invites"])` in the same file.
- ORM pattern used throughout: `session.exec(select(Model).where(...)).all()` and `session.exec(select(Model).where(...)).first()` — same pattern as existing code in `invites.py`, `members.py`, etc.
- Timestamps are naive UTC datetimes: `datetime.now(timezone.utc).replace(tzinfo=None)`. Use `timedelta(hours=24)` for the expiry cutoff.
- `MemberDep` is an annotated alias in `dependencies.py` — import it alongside `CurrentUser` and `CurrentSession`.
- `session.flush()` propagates deletions to the DB within the transaction without committing, so subsequent count queries see the updated state.
- `conftest.py`'s `_make_client()` builds its own `test_app` and manually includes routers — add `test_app.include_router(invites.list_invites_router)` there too.

- [ ] **Step 1: Write failing backend tests**

Add to `backend/tests/test_invites.py`. First, add this import at the top of the file:
```python
from datetime import datetime, timezone
```

Then add the following test functions at the bottom of the file:

```python
def test_create_open_invite(client, session, user):
    lst = _create_list(client)
    response = client.post(f"/lists/{lst['id']}/invites")
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    invite = session.get(ListInvite, data["id"])
    assert invite is not None
    assert invite.invited_email is None


def test_non_member_cannot_create_open_invite(other_client, session, user):
    from app.db.models import List
    lst = List(name="Private", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    response = other_client.post(f"/lists/{lst.id}/invites")
    assert response.status_code == 403


def test_list_full_blocks_invite_creation(client, session, user):
    from app.db.models import List, User as DBUser
    lst = List(name="Full", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    # Add owner + 4 more = 5 members total
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    for i in range(4):
        extra = DBUser(
            firebase_uid=f"uid-full-{i}",
            display_name=f"Extra {i}",
            email=f"full{i}@example.com",
        )
        session.add(extra)
        session.commit()
        session.refresh(extra)
        session.add(ListMember(list_id=lst.id, user_id=extra.id))
    session.commit()
    response = client.post(f"/lists/{lst.id}/invites")
    assert response.status_code == 409


def test_expired_invites_cleaned_up_on_create(client, session, user):
    from datetime import timedelta
    lst = _create_list(client)
    old = ListInvite(
        list_id=lst["id"],
        invited_by=user.id,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=25),
    )
    session.add(old)
    session.commit()
    session.refresh(old)
    old_id = old.id
    response = client.post(f"/lists/{lst['id']}/invites")
    assert response.status_code == 201
    assert session.get(ListInvite, old_id) is None


def test_open_invite_limit_returns_429(client, session, user):
    lst = _create_list(client)
    for _ in range(5):
        session.add(ListInvite(list_id=lst["id"], invited_by=user.id))
    session.commit()
    response = client.post(f"/lists/{lst['id']}/invites")
    assert response.status_code == 429


def test_expired_invites_do_not_count_toward_limit(client, session, user):
    from datetime import timedelta
    lst = _create_list(client)
    for _ in range(5):
        inv = ListInvite(
            list_id=lst["id"],
            invited_by=user.id,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=25),
        )
        session.add(inv)
    session.commit()
    response = client.post(f"/lists/{lst['id']}/invites")
    assert response.status_code == 201


def test_accept_invite_blocked_when_list_full(other_client, session, user):
    from app.db.models import List, User as DBUser
    lst = List(name="Packed", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    session.add(ListMember(list_id=lst.id, user_id=user.id))
    for i in range(4):
        extra = DBUser(
            firebase_uid=f"uid-packed-{i}",
            display_name=f"P{i}",
            email=f"packed{i}@example.com",
        )
        session.add(extra)
        session.commit()
        session.refresh(extra)
        session.add(ListMember(list_id=lst.id, user_id=extra.id))
    session.commit()
    invite = ListInvite(list_id=lst.id, invited_by=user.id)
    session.add(invite)
    session.commit()
    session.refresh(invite)
    response = other_client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_invites.py -v -k "open_invite or list_full or expired or limit or accept_invite_blocked" 2>&1 | tail -20
```

Expected: all new tests FAIL with 404 or AttributeError.

- [ ] **Step 3: Implement `list_invites_router` in `invites.py`**

In `backend/app/routers/invites.py`:

**Update imports** — add `timedelta` to the datetime import, add `MemberDep` to the dependencies import, add `ListMember` to the models import:

```python
from datetime import datetime, timedelta, timezone
from app.db.models import List, ListInvite, ListMember, User
from app.dependencies import CurrentSession, CurrentUser, MemberDep
```

**Add constants and the new router** after the existing `router = APIRouter(...)` line:

```python
MAX_MEMBERS = 5
MAX_OPEN_INVITES = 5

list_invites_router = APIRouter(prefix="/lists/{list_id}/invites", tags=["invites"])


@list_invites_router.post("", status_code=status.HTTP_201_CREATED)
def create_open_invite(
    list_id: str,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    _, current_user = list_and_user

    # 1. Reject if list already has MAX_MEMBERS members
    # Query: select all ListMember rows where list_id matches; count them
    # Pattern: same as used in members.py
    # If count >= MAX_MEMBERS: raise 409 "List is full"

    # 2. Clean up expired invites (older than 24h) for this list
    # cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    # Query: select ListInvite rows where list_id matches AND created_at < cutoff
    # Delete each expired invite, then call session.flush()

    # 3. Reject if remaining open invites >= MAX_OPEN_INVITES
    # Query: select all ListInvite rows where list_id matches; count them
    # If count >= MAX_OPEN_INVITES: raise 429 "Too many open invites"

    # 4. Create and return new invite
    invite = ListInvite(list_id=list_id, invited_by=current_user.id, invited_email=None)
    session.add(invite)
    session.commit()
    session.refresh(invite)
    return {"id": invite.id}
```

Fill in steps 1-3 using the `session.exec(select(...).where(...))` pattern from the existing code in `invites.py` and `members.py`.

**Add member cap to `accept_invite`** — in the existing `accept_invite` function, before the `if not existing:` block, add:

```python
    # Member cap guard (race condition protection)
    # Query: count ListMember rows for invite.list_id
    # If count >= MAX_MEMBERS: raise 409 "List is full"
```

Use the same ORM pattern. `MAX_MEMBERS` is in scope since it's defined at module level in the same file.

- [ ] **Step 4: Register `list_invites_router` in `main.py`**

In `backend/app/main.py`, add one line after `app.include_router(invites.router)`:

```python
app.include_router(invites.list_invites_router)
```

- [ ] **Step 5: Add `list_invites_router` to `conftest.py`**

In `backend/tests/conftest.py`, in `_make_client`, add after `test_app.include_router(invites.router)`:

```python
test_app.include_router(invites.list_invites_router)
```

- [ ] **Step 6: Run all invite tests**

```bash
cd backend && uv run pytest tests/test_invites.py -v 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
cd backend
git add app/routers/invites.py app/main.py tests/conftest.py tests/test_invites.py
git commit -m "feat: add POST /lists/{list_id}/invites with member cap and invite limits"
```

---

## Task 2: Frontend — API functions

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Context:** `apiFetch` throws `ApiError` on non-2xx. `DELETE /lists/{id}/members/{userId}` returns 204 (no body — `apiFetch` returns `null` for 204). `POST /lists/{id}/invites` returns `{ "id": "..." }` with 201. `ApiError` is already exported.

- [ ] **Step 1: Add two functions at the end of `frontend/src/lib/api.ts`**

```typescript
export function removeMember(
  getToken: () => Promise<string>,
  listId: string,
  userId: string,
) {
  return apiFetch(getToken, `/lists/${listId}/members/${userId}`, { method: 'DELETE' })
}

export function createOpenInvite(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}/invites`, { method: 'POST' })
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && npm run typecheck 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/lib/api.ts
git commit -m "feat: add removeMember and createOpenInvite API functions"
```

---

## Task 3: Frontend — ListMembersSheet component and CSS

**Files:**
- Create: `frontend/src/components/ListMembersSheet.tsx`
- Create: `frontend/src/components/ListMembersSheet.css`

**Context:**
- Follow the same CSS variable conventions as `TagEditSheet.css` (`--color-bg`, `--color-border`, `--color-primary`, `--color-muted`, `--color-text`, `--color-danger`).
- `BackendMember` shape: `{ id, user_id, list_id, display_name, photo_url, created_at }` — matches `getListMembers` response (same shape as `BackendMember` in `useListItems.ts` lines 14-21).
- The component calls `useAuth()` for `getToken` only — NOT for ownership checks (those come in as props).
- The crown 👑 is shown on the current user's own row when `isOwner=true`. No crown on other rows (we don't know which other member is the owner from the API response).
- `Toast` component: `import { Toast } from './Toast'`, props: `{ message: string, onDismiss: () => void }`.

- [ ] **Step 1: Create `ListMembersSheet.css`**

```css
.list-members-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg, #fff);
  border-top: 1px solid var(--color-border, #e5e5e5);
  padding: 12px 16px 28px;
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 100;
}

.list-members-sheet__handle {
  width: 36px;
  height: 4px;
  background: var(--color-border, #e5e5e5);
  border-radius: 2px;
  margin: 0 auto 16px;
}

.list-members-sheet__section-title {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-muted, #888);
  margin-bottom: 8px;
}

.list-members-sheet__member-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.list-members-sheet__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-primary, #7c3aed);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  flex-shrink: 0;
  overflow: hidden;
}

.list-members-sheet__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-members-sheet__member-name {
  flex: 1;
  font-size: 0.95rem;
  color: var(--color-text, #111);
}

.list-members-sheet__action-btn {
  font-size: 0.75rem;
  padding: 4px 10px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: var(--color-danger, #dc2626);
  background: color-mix(in srgb, var(--color-danger, #dc2626) 10%, transparent);
}

.list-members-sheet__divider {
  height: 1px;
  background: var(--color-border, #e5e5e5);
  margin: 12px 0;
}

.list-members-sheet__invite-btn {
  width: 100%;
  background: var(--color-primary, #7c3aed);
  color: #fff;
  border: none;
  border-radius: 14px;
  padding: 14px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.list-members-sheet__invite-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.list-members-sheet__invite-limit {
  font-size: 0.8rem;
  color: var(--color-muted, #888);
  text-align: center;
  margin-top: 6px;
}

.list-members-sheet__fallback-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 8px;
  font-size: 0.8rem;
  color: var(--color-text, #111);
  background: var(--color-bg, #fff);
  box-sizing: border-box;
}

.list-members-sheet__spinner {
  display: block;
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-border, #e5e5e5);
  border-top-color: var(--color-primary, #7c3aed);
  border-radius: 50%;
  animation: lms-spin 0.7s linear infinite;
  margin: 24px auto;
}

@keyframes lms-spin {
  to { transform: rotate(360deg); }
}

.list-members-sheet__error {
  text-align: center;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.list-members-sheet__retry-btn {
  background: none;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 8px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text, #111);
}
```

- [ ] **Step 2: Create `ListMembersSheet.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react'
import './ListMembersSheet.css'
import { Toast } from './Toast'
import { useAuth } from '../contexts/AuthContext'
import { getListMembers, removeMember, createOpenInvite, ApiError } from '../lib/api'

export interface BackendMember {
  id: string
  user_id: string
  list_id: string
  display_name: string
  photo_url: string | null
  created_at: string
}

interface Props {
  listId: string
  currentUserId: string
  isOwner: boolean
  onClose: () => void
}

type LoadState = 'loading' | 'error' | 'ready'

const MAX_MEMBERS = 5

export function ListMembersSheet({ listId, currentUserId, isOwner, onClose }: Props) {
  const { getToken } = useAuth()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [members, setMembers] = useState<BackendMember[]>([])
  const [inviteLimitReached, setInviteLimitReached] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const data = (await getListMembers(getToken, listId)) as BackendMember[]
      setMembers(data)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [getToken, listId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleRemove(userId: string) {
    const snapshot = members
    setMembers(prev => prev.filter(m => m.user_id !== userId))
    try {
      await removeMember(getToken, listId, userId)
    } catch {
      setMembers(snapshot)
      setToast('No se pudo eliminar el miembro')
    }
  }

  async function handleCopyInvite() {
    setInviteLimitReached(false)
    setFallbackUrl(null)
    try {
      const data = (await createOpenInvite(getToken, listId)) as { id: string }
      const url = `${window.location.origin}/invite/${data.id}`
      try {
        await navigator.clipboard.writeText(url)
        setToast('Enlace copiado')
      } catch {
        setFallbackUrl(url)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setInviteLimitReached(true)
      }
    }
  }

  const listFull = members.length >= MAX_MEMBERS

  return (
    <div
      className="list-members-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Miembros"
    >
      <div className="list-members-sheet__handle" />

      {loadState === 'loading' && (
        <span
          className="list-members-sheet__spinner"
          role="status"
          aria-label="Cargando"
        />
      )}

      {loadState === 'error' && (
        <div className="list-members-sheet__error">
          <span>No se pudieron cargar los miembros</span>
          <button
            className="list-members-sheet__retry-btn"
            onClick={() => void load()}
          >
            Reintentar
          </button>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          <p className="list-members-sheet__section-title">
            Miembros · {members.length}
          </p>

          {members.map(member => {
            const isCurrentUser = member.user_id === currentUserId
            const isOwnerRow = isCurrentUser && isOwner

            return (
              <div key={member.user_id} className="list-members-sheet__member-row">
                <div className="list-members-sheet__avatar">
                  {member.photo_url ? (
                    <img src={member.photo_url} alt={member.display_name} />
                  ) : (
                    <span>{member.display_name?.[0]?.toUpperCase() ?? '?'}</span>
                  )}
                </div>
                <span className="list-members-sheet__member-name">
                  {member.display_name}{isOwnerRow ? ' 👑' : ''}
                </span>
                {isOwner && !isCurrentUser && (
                  <button
                    className="list-members-sheet__action-btn"
                    onClick={() => void handleRemove(member.user_id)}
                    aria-label={`Expulsar a ${member.display_name}`}
                  >
                    Expulsar
                  </button>
                )}
                {!isOwner && isCurrentUser && (
                  <button
                    className="list-members-sheet__action-btn"
                    onClick={() => void handleRemove(member.user_id)}
                    aria-label="Salir de la lista"
                  >
                    Salir
                  </button>
                )}
              </div>
            )
          })}

          {!listFull && (
            <>
              <div className="list-members-sheet__divider" />
              {fallbackUrl ? (
                <input
                  className="list-members-sheet__fallback-input"
                  readOnly
                  value={fallbackUrl}
                  aria-label="Enlace de invitación"
                  onFocus={e => e.target.select()}
                />
              ) : (
                <button
                  className="list-members-sheet__invite-btn"
                  onClick={() => void handleCopyInvite()}
                  disabled={inviteLimitReached}
                >
                  🔗 Copiar enlace de invitación
                </button>
              )}
              {inviteLimitReached && (
                <p className="list-members-sheet__invite-limit">
                  Límite de invitaciones alcanzado. Espera a que expiren o sean aceptadas.
                </p>
              )}
            </>
          )}
        </>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd frontend && npm run typecheck 2>&1 | tail -15
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/components/ListMembersSheet.tsx src/components/ListMembersSheet.css
git commit -m "feat: add ListMembersSheet component and styles"
```

---

## Task 4: Frontend — ListMembersSheet tests

**Files:**
- Create: `frontend/src/components/ListMembersSheet.test.tsx`

**Context:**
- Mock `../contexts/AuthContext` and `../lib/api` (same pattern as `ListScreen.test.tsx`).
- `BackendMember` is now exported from `ListMembersSheet.tsx` — import it.
- Use `findBy*` for post-fetch assertions (component is async on mount).
- For clipboard mock: `Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn() }, writable: true, configurable: true })`.
- `ApiError` is exported from `../lib/api` — use it to simulate a 429.

- [ ] **Step 1: Create the test file**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { ListMembersSheet, type BackendMember } from './ListMembersSheet'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getListMembers: vi.fn(),
    removeMember: vi.fn(),
    createOpenInvite: vi.fn(),
  }
})

const mockGetToken = vi.fn().mockResolvedValue('token')

const ALICE: BackendMember = {
  id: 'lm1', user_id: 'u1', list_id: 'l1',
  display_name: 'Alice', photo_url: null, created_at: '',
}
const BOB: BackendMember = {
  id: 'lm2', user_id: 'u2', list_id: 'l1',
  display_name: 'Bob', photo_url: null, created_at: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  })
})

test('shows spinner while loading', () => {
  vi.mocked(api.getListMembers).mockReturnValue(new Promise(() => {}))
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
})

test('shows error and retry button when fetch fails', async () => {
  vi.mocked(api.getListMembers).mockRejectedValue(new Error('net'))
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  expect(await screen.findByText(/no se pudieron cargar/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
})

test('renders member list after fetch', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  expect(await screen.findByText('Alice')).toBeInTheDocument()
  expect(screen.getByText('Bob')).toBeInTheDocument()
})

test('owner is sole member — no Expulsar buttons', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  await screen.findByText('Alice')
  expect(screen.queryByRole('button', { name: /expulsar/i })).not.toBeInTheDocument()
})

test('owner row has no action button', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  await screen.findByText('Alice')
  expect(screen.queryByRole('button', { name: /expulsar a alice/i })).not.toBeInTheDocument()
})

test('owner sees Expulsar on other members', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  expect(await screen.findByRole('button', { name: /expulsar a bob/i })).toBeInTheDocument()
})

test('non-owner sees Salir on own row only', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u2" isOwner={false} onClose={vi.fn()} />)
  expect(await screen.findByRole('button', { name: /salir de la lista/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /expulsar/i })).not.toBeInTheDocument()
})

test('non-owner does not see action on other members', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u2" isOwner={false} onClose={vi.fn()} />)
  await screen.findByText('Alice')
  expect(screen.queryByRole('button', { name: /expulsar a alice/i })).not.toBeInTheDocument()
})

test('Expulsar removes member optimistically and calls DELETE', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockResolvedValue(null)
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /expulsar a bob/i }))
  await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument())
  expect(api.removeMember).toHaveBeenCalledWith(mockGetToken, 'l1', 'u2')
})

test('Salir removes current user from list', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockResolvedValue(null)
  render(<ListMembersSheet listId="l1" currentUserId="u2" isOwner={false} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /salir de la lista/i }))
  await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument())
  expect(api.removeMember).toHaveBeenCalledWith(mockGetToken, 'l1', 'u2')
})

test('remove failure reverts member list and shows toast', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockRejectedValue(new Error('fail'))
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /expulsar a bob/i }))
  expect(await screen.findByText('Bob')).toBeInTheDocument()
  expect(screen.getByText(/no se pudo eliminar/i)).toBeInTheDocument()
})

test('copy invite success writes to clipboard and shows toast', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockResolvedValue({ id: 'inv-123' })
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/invite/inv-123'))
  )
  expect(await screen.findByText(/enlace copiado/i)).toBeInTheDocument()
})

test('invite limit reached shows message and disables button', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockRejectedValue(new api.ApiError(429, 'Too many'))
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  expect(await screen.findByText(/límite de invitaciones/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /copiar enlace/i })).toBeDisabled()
})

test('clipboard unavailable shows fallback URL input', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockResolvedValue({ id: 'inv-456' })
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockRejectedValue(new Error('no clipboard')) },
    writable: true,
    configurable: true,
  })
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  expect(
    await screen.findByRole('textbox', { name: /enlace de invitación/i })
  ).toBeInTheDocument()
})

test('invite button hidden when list has 5 members', async () => {
  const fiveMembers: BackendMember[] = Array.from({ length: 5 }, (_, i) => ({
    id: `lm${i}`, user_id: `u${i}`, list_id: 'l1',
    display_name: `User ${i}`, photo_url: null, created_at: '',
  }))
  vi.mocked(api.getListMembers).mockResolvedValue(fiveMembers)
  render(<ListMembersSheet listId="l1" currentUserId="u0" isOwner={true} onClose={vi.fn()} />)
  await screen.findByText('User 0')
  expect(screen.queryByRole('button', { name: /copiar enlace/i })).not.toBeInTheDocument()
})

test('ESC key calls onClose', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  const onClose = vi.fn()
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={onClose} />)
  await screen.findByText('Alice')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npm test -- ListMembersSheet 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/components/ListMembersSheet.test.tsx
git commit -m "test: add ListMembersSheet tests"
```

---

## Task 5: Frontend — Wire ListScreen and DashboardScreen

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`
- Modify: `frontend/src/components/DashboardScreen.tsx`
- Modify: `frontend/src/components/ListScreen.test.tsx`

**Context:**
- `ListScreen` currently has `const { getToken } = useAuth()` at line 22. Add `user` to this destructuring.
- `ListScreen` currently renders `<ListHeader title={listName} onMenuOpen={() => {}} onBack={onBack} />` — replace the stub with `setMenuOpen(true)`.
- `DashboardScreen` renders `<ListScreen listId={selectedList.id} listName={selectedList.name} onBack={...} />` — add `listOwnerId={selectedList.owner_id}`.
- `ListScreen.test.tsx` has one test rendering `<ListScreen listId="l1" listName="Mercado Semanal" />` — add `listOwnerId="owner-1"` to avoid TypeScript error.

- [ ] **Step 1: Update `ListScreen.test.tsx`**

Two changes:

**a) Add a mock for `ListMembersSheet`** at the top of the mocks section (after `vi.mock('../lib/api')`):

```tsx
vi.mock('./ListMembersSheet', () => ({
  ListMembersSheet: () => <div role="dialog" aria-label="Miembros">Sheet</div>,
}))
```

**b) Update the existing render call** — add `listOwnerId="owner-1"` to `<ListScreen ... />`.

**c) Add a new test** inside the `describe('ListScreen', ...)` block:

```tsx
it('opens ListMembersSheet when menu button is clicked', () => {
  render(<ListScreen listId="l1" listName="Mercado Semanal" listOwnerId="u1" />)
  fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
  expect(screen.getByRole('dialog', { name: /miembros/i })).toBeInTheDocument()
})
```

Also add `fireEvent` to the import from `@testing-library/react` if not already there.

- [ ] **Step 2: Update `ListScreen.tsx`**

Make these five targeted changes:

**a) Add `ListMembersSheet` import** after the existing component imports:
```tsx
import { ListMembersSheet } from './ListMembersSheet'
```

**b) Add `listOwnerId` to Props**:
```tsx
interface Props {
  listId: string
  listName: string
  listOwnerId: string
  onBack?: () => void
}
```

**c) Destructure `user` alongside `getToken`** (line ~22):
```tsx
const { getToken, user } = useAuth()
```

**d) Add `menuOpen` state and derived values** after existing `useState` calls:
```tsx
const [menuOpen, setMenuOpen] = useState(false)
const currentUserId = user!.id
const isOwner = listOwnerId === currentUserId
```

**e) In the JSX, make three changes:**

Replace the stub `onMenuOpen`:
```tsx
<ListHeader title={listName} onMenuOpen={() => setMenuOpen(true)} onBack={onBack} />
```

Add `ListMembersSheet` after `<ItemList .../>`:
```tsx
{menuOpen && (
  <ListMembersSheet
    listId={listId}
    currentUserId={currentUserId}
    isOwner={isOwner}
    onClose={() => setMenuOpen(false)}
  />
)}
```

Update `SmartInputBar` condition:
```tsx
{!editingTag && !menuOpen && (
```

- [ ] **Step 3: Update `DashboardScreen.tsx`**

Add `listOwnerId={selectedList.owner_id}` to the `<ListScreen>` render:

```tsx
<ListScreen
  listId={selectedList.id}
  listName={selectedList.name}
  listOwnerId={selectedList.owner_id}
  onBack={() => setSelectedList(null)}
/>
```

- [ ] **Step 4: Run typecheck and all frontend tests**

```bash
cd frontend && npm run typecheck 2>&1 | tail -10
```

```bash
cd frontend && npm test 2>&1 | tail -20
```

Expected: no type errors, all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/components/ListScreen.tsx src/components/DashboardScreen.tsx src/components/ListScreen.test.tsx
git commit -m "feat: wire ListMembersSheet into ListScreen via menu button"
```

---

## Final verification

- [ ] **Run full backend test suite**

```bash
cd backend && uv run pytest -v 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Run full frontend test suite**

```bash
cd frontend && npm test 2>&1 | tail -20
```

Expected: all tests PASS.
