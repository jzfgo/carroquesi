# Invite Accept UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/invite/:id` route where users can preview and accept list invitations, with automatic Google Sign-In for unauthenticated users.

**Architecture:** Add `react-router-dom` with two routes (`/` and `/invite/:id`). New `InviteScreen` handles preview + accept. Backend gains 410 for expired invites and returns `list_id` from the accept endpoint. `DashboardScreen` reads `location.state.openListId` to auto-open the newly joined list.

**Tech Stack:** React 19 + TypeScript + react-router-dom v7, Vitest + @testing-library/react, FastAPI + SQLModel

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/routers/invites.py` | Modify | 410 expiry check in `get_invite_preview` + `accept_invite`; return `list_id` from accept |
| `backend/tests/test_invites.py` | Modify | 2 new expiry tests |
| `frontend/src/lib/api.ts` | Modify | Add `getInvitePreview`, `acceptInvite` |
| `frontend/src/lib/api.test.ts` | Modify | Tests for the two new functions |
| `frontend/src/App.tsx` | Modify | Add `BrowserRouter` + `Routes` with `/invite/:id` and `*` |
| `frontend/src/components/DashboardScreen.tsx` | Modify | Read `openListId` from router state, open list after fetch |
| `frontend/src/components/DashboardScreen.test.tsx` | Modify | Mock `useLocation`; add 1 test for auto-open |
| `frontend/src/components/InviteScreen.tsx` | Create | Preview + accept UI with all state transitions |
| `frontend/src/components/InviteScreen.css` | Create | Centered card layout |
| `frontend/src/components/InviteScreen.test.tsx` | Create | 11 test cases |

---

## Task 1: Backend — 410 for expired invites + return `list_id` from accept

Run all commands from `backend/`.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `backend/tests/test_invites.py`:

```python
def test_get_invite_preview_returns_410_when_expired(session: Session, user):
    from datetime import timedelta
    from app.db.models import List
    from fastapi import FastAPI
    from fastapi.testclient import TestClient as RawClient
    from app.db.session import get_session
    from app.routers import invites as invites_router

    lst = List(name="Old List", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    invite = ListInvite(
        list_id=lst.id,
        invited_by=user.id,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=25),
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)

    bare_app = FastAPI()
    bare_app.include_router(invites_router.router)
    bare_app.dependency_overrides[get_session] = lambda: session
    with RawClient(bare_app) as raw:
        response = raw.get(f"/invites/{invite.id}")
    assert response.status_code == 410


def test_accept_invite_returns_410_when_expired(client: TestClient, session: Session, user):
    from datetime import timedelta
    from app.db.models import List

    lst = List(name="Old List 2", owner_id=user.id)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    invite = ListInvite(
        list_id=lst.id,
        invited_by=user.id,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=25),
    )
    session.add(invite)
    session.commit()
    session.refresh(invite)

    response = client.post(f"/invites/{invite.id}/accept")
    assert response.status_code == 410
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/test_invites.py::test_get_invite_preview_returns_410_when_expired tests/test_invites.py::test_accept_invite_returns_410_when_expired -v
```

Expected: both FAIL (currently returns 200, not 410).

- [ ] **Step 3: Implement expiry check and return `list_id` from accept**

Replace `backend/app/routers/invites.py` with:

```python
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.db.models import List, ListInvite, ListMember, User
from app.dependencies import CurrentSession, CurrentUser, MemberDep
from app.schemas.invites import InvitePreview, InviteRead

router = APIRouter(prefix="/invites", tags=["invites"])

MAX_MEMBERS = 5
MAX_OPEN_INVITES = 5
INVITE_TTL_HOURS = 24


def _check_not_expired(invite: ListInvite) -> None:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=INVITE_TTL_HOURS)
    if invite.created_at < cutoff:
        raise HTTPException(status_code=410, detail="Invite expired")


list_invites_router = APIRouter(prefix="/lists/{list_id}/invites", tags=["invites"])


@list_invites_router.post("", status_code=status.HTTP_201_CREATED)
def create_open_invite(
    list_id: str,
    list_and_user: MemberDep,
    session: CurrentSession,
):
    _, current_user = list_and_user

    members = session.exec(select(ListMember).where(ListMember.list_id == list_id)).all()
    if len(members) >= MAX_MEMBERS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="List is full")

    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=INVITE_TTL_HOURS)
    expired = session.exec(
        select(ListInvite).where(ListInvite.list_id == list_id, ListInvite.created_at < cutoff)
    ).all()
    for inv in expired:
        session.delete(inv)
    session.flush()

    open_invites = session.exec(select(ListInvite).where(ListInvite.list_id == list_id)).all()
    if len(open_invites) >= MAX_OPEN_INVITES:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many open invites")

    invite = ListInvite(list_id=list_id, invited_by=current_user.id, invited_email=None)
    session.add(invite)
    session.commit()
    session.refresh(invite)
    return {"id": invite.id}


@router.get("", response_model=list[InviteRead])
def get_my_invites(
    current_user: CurrentUser,
    session: CurrentSession,
):
    invites = session.exec(
        select(ListInvite).where(ListInvite.invited_email == current_user.email)
    ).all()
    return invites


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
        invited_by_name=inviter.display_name if inviter else None,
    )


@router.post("/{invite_id}/accept")
def accept_invite(
    invite_id: str,
    current_user: CurrentUser,
    session: CurrentSession,
):
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    _check_not_expired(invite)

    # Email-locked invite: only the matching user can accept
    if invite.invited_email is not None and invite.invited_email != current_user.email:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This invite is not for you")

    # Member cap guard (race condition protection)
    member_count = len(session.exec(select(ListMember).where(ListMember.list_id == invite.list_id)).all())
    if member_count >= MAX_MEMBERS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="List is full")

    # Idempotent: already a member — just delete the invite
    existing = session.exec(
        select(ListMember).where(
            ListMember.list_id == invite.list_id, ListMember.user_id == current_user.id
        )
    ).first()
    if not existing:
        member = ListMember(list_id=invite.list_id, user_id=current_user.id)
        session.add(member)
        # Bump lists.updated_at for polling
        lst = session.get(List, invite.list_id)
        if lst:
            lst.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(lst)

    list_id = invite.list_id
    session.delete(invite)
    session.commit()
    return {"list_id": list_id}


@router.delete("/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def decline_invite(
    invite_id: str,
    current_user: CurrentUser,
    session: CurrentSession,
):
    invite = session.get(ListInvite, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    lst = session.get(List, invite.list_id)
    is_owner = lst and lst.owner_id == current_user.id
    is_invitee = invite.invited_email is not None and invite.invited_email == current_user.email

    if not is_owner and not is_invitee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    session.delete(invite)
    session.commit()
```

- [ ] **Step 4: Run all invite tests**

```bash
uv run pytest tests/test_invites.py -v
```

Expected: all tests PASS including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/invites.py backend/tests/test_invites.py
git commit -m "feat: add 410 for expired invites and return list_id from accept"
```

---

## Task 2: Frontend — add `getInvitePreview` and `acceptInvite` to api.ts

Run all commands from `frontend/`.

- [ ] **Step 1: Write the failing tests**

Update the import line at the top of `frontend/src/lib/api.test.ts`:

```typescript
import { getLists, createList, createItem, updateItem, getListUpdatedAt, renameList, deleteList, getInvitePreview, acceptInvite, ApiError } from './api'
```

Add to the bottom of `frontend/src/lib/api.test.ts`:

```typescript
describe('getInvitePreview', () => {
  it('GET /invites/:id — fetches without auth header', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'inv1', list_name: 'Compras', invited_by_name: 'Ana' }))
    const result = await getInvitePreview('inv1')
    expect(result).toEqual({ id: 'inv1', list_name: 'Compras', invited_by_name: 'Ana' })
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/invites/inv1'))
    expect(mockFetch.mock.calls[0][1]).toBeUndefined()
  })

  it('throws ApiError on non-2xx', async () => {
    mockFetch.mockReturnValue(mockResponse('Not found', 404))
    await expect(getInvitePreview('bad-id')).rejects.toMatchObject({ status: 404 })
  })
})

describe('acceptInvite', () => {
  it('POST /invites/:id/accept — sends auth header and returns list_id', async () => {
    mockFetch.mockReturnValue(mockResponse({ list_id: 'l1' }))
    const result = await acceptInvite(mockGetToken, 'inv1')
    expect(result).toEqual({ list_id: 'l1' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/invites/inv1/accept'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- api.test
```

Expected: 3 new tests FAIL with "getInvitePreview is not a function" / "acceptInvite is not a function".

- [ ] **Step 3: Add the two functions to api.ts**

Append to the bottom of `frontend/src/lib/api.ts`:

```typescript
export async function getInvitePreview(inviteId: string): Promise<{ id: string; list_name: string; invited_by_name: string | null }> {
  const res = await fetch(`${BASE}/invites/${inviteId}`)
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<{ id: string; list_name: string; invited_by_name: string | null }>
}

export function acceptInvite(
  getToken: () => Promise<string>,
  inviteId: string,
): Promise<{ list_id: string }> {
  return apiFetch(getToken, `/invites/${inviteId}/accept`, { method: 'POST' }) as Promise<{ list_id: string }>
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- api.test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "feat: add getInvitePreview and acceptInvite to API client"
```

---

## Task 3: Frontend — InviteScreen component (TDD)

Run all commands from `frontend/`.

- [ ] **Step 1: Install react-router-dom**

```bash
npm install react-router-dom
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/components/InviteScreen.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, beforeEach, test, expect } from 'vitest'
import { InviteScreen } from './InviteScreen'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api')

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'inv123' }),
}))

const mockGetToken = vi.fn().mockResolvedValue('token')
const authedUser = { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' }

function mockAuth(user: typeof authedUser | null = authedUser) {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user,
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  })
}

const previewData = { id: 'inv123', list_name: 'Compras', invited_by_name: 'Ana' }

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth()
})

test('shows spinner while loading', () => {
  vi.mocked(api.getInvitePreview).mockReturnValue(new Promise(() => {}))
  render(<InviteScreen />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})

test('shows list name and inviter name in preview', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
  expect(screen.getByText('Invitado por Ana')).toBeInTheDocument()
})

test('shows "Unirse a la lista" button when signed in', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Unirse a la lista' })).toBeInTheDocument()
  )
})

test('shows "Iniciar sesión para unirse" button when not signed in', async () => {
  mockAuth(null)
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Iniciar sesión para unirse' })).toBeInTheDocument()
  )
})

test('accepts invite and navigates to dashboard on success', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  vi.mocked(api.acceptInvite).mockResolvedValue({ list_id: 'l1' })
  render(<InviteScreen />)
  await waitFor(() => screen.getByRole('button', { name: 'Unirse a la lista' }))
  fireEvent.click(screen.getByRole('button', { name: 'Unirse a la lista' }))
  await waitFor(() =>
    expect(mockNavigate).toHaveBeenCalledWith('/', { state: { openListId: 'l1' } })
  )
})

test('calls signIn when not authenticated and button clicked', async () => {
  const mockSignIn = vi.fn().mockResolvedValue(undefined)
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: null,
    getToken: mockGetToken,
    signIn: mockSignIn,
    signOut: vi.fn(),
    loading: false,
  })
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() => screen.getByRole('button', { name: 'Iniciar sesión para unirse' }))
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión para unirse' }))
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledOnce())
})

test('shows error message for 404', async () => {
  vi.mocked(api.getInvitePreview).mockRejectedValue(new api.ApiError(404, 'Not found'))
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByText('Esta invitación no existe')).toBeInTheDocument()
  )
  expect(screen.getByText('Ir al inicio \u2192')).toBeInTheDocument()
})

test('shows error message for 410', async () => {
  vi.mocked(api.getInvitePreview).mockRejectedValue(new api.ApiError(410, 'Gone'))
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByText('Esta invitación ha expirado')).toBeInTheDocument()
  )
})

test('shows error message for 409', async () => {
  vi.mocked(api.getInvitePreview).mockRejectedValue(new api.ApiError(409, 'Conflict'))
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByText('La lista ya está llena')).toBeInTheDocument()
  )
})

test('shows error message for 403 on accept', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  vi.mocked(api.acceptInvite).mockRejectedValue(new api.ApiError(403, 'Forbidden'))
  render(<InviteScreen />)
  await waitFor(() => screen.getByRole('button', { name: 'Unirse a la lista' }))
  fireEvent.click(screen.getByRole('button', { name: 'Unirse a la lista' }))
  await waitFor(() =>
    expect(screen.getByText('Esta invitación es para otra cuenta')).toBeInTheDocument()
  )
})

test('shows network error with retry button, retry re-fetches on success', async () => {
  vi.mocked(api.getInvitePreview)
    .mockRejectedValueOnce(new Error('Network'))
    .mockResolvedValueOnce(previewData)
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByText('No se pudo conectar. Inténtalo de nuevo.')).toBeInTheDocument()
  )
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- InviteScreen.test
```

Expected: all 11 FAIL with "Cannot find module './InviteScreen'".

- [ ] **Step 4: Create `InviteScreen.css`**

Create `frontend/src/components/InviteScreen.css`:

```css
.invite-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 1.5rem;
  background: var(--color-bg);
}

.invite-screen__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 360px;
  padding: 2rem 1.5rem;
  background: var(--color-surface);
  border-radius: 1rem;
  border: 1px solid var(--color-border);
  text-align: center;
}

.invite-screen__icon {
  font-size: 3rem;
  line-height: 1;
}

.invite-screen__list-name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
}

.invite-screen__inviter {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

.invite-screen__btn {
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  margin-top: 0.5rem;
}

.invite-screen__error {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.9375rem;
}

.invite-screen__home-link {
  font-size: 0.875rem;
  color: var(--color-primary);
  text-decoration: none;
}

.invite-screen__spinner {
  display: block;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}
```

- [ ] **Step 5: Create `InviteScreen.tsx`**

Create `frontend/src/components/InviteScreen.tsx`:

```typescript
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getInvitePreview, acceptInvite, ApiError } from '../lib/api'
import './InviteScreen.css'

type ScreenState = 'loading' | 'preview' | 'accepting' | 'error'

interface Preview {
  id: string
  list_name: string
  invited_by_name: string | null
}

const ERROR_MESSAGES: Record<number, string> = {
  403: 'Esta invitación es para otra cuenta',
  404: 'Esta invitación no existe',
  409: 'La lista ya está llena',
  410: 'Esta invitación ha expirado',
}

export function InviteScreen() {
  const { id: inviteId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, getToken, signIn, loading: authLoading } = useAuth()
  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const pendingAcceptRef = useRef(false)

  useEffect(() => {
    if (!inviteId) return
    setScreenState('loading')
    setIsNetworkError(false)
    void (async () => {
      try {
        const data = await getInvitePreview(inviteId)
        setPreview(data)
        setScreenState('preview')
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMessage(ERROR_MESSAGES[err.status] ?? 'No se pudo conectar. Inténtalo de nuevo.')
          setIsNetworkError(false)
        } else {
          setErrorMessage('No se pudo conectar. Inténtalo de nuevo.')
          setIsNetworkError(true)
        }
        setScreenState('error')
      }
    })()
  }, [inviteId, retryCount])

  // Auto-accept after sign-in completes (unauthenticated flow)
  useEffect(() => {
    if (authLoading || !user || !pendingAcceptRef.current || !inviteId) return
    pendingAcceptRef.current = false
    setScreenState('accepting')
    void (async () => {
      try {
        const data = await acceptInvite(getToken, inviteId)
        navigate('/', { state: { openListId: data.list_id } })
      } catch (err) {
        setErrorMessage(
          err instanceof ApiError
            ? (ERROR_MESSAGES[err.status] ?? 'No se pudo conectar. Inténtalo de nuevo.')
            : 'No se pudo conectar. Inténtalo de nuevo.'
        )
        setIsNetworkError(!(err instanceof ApiError))
        setScreenState('error')
      }
    })()
  }, [authLoading, user, inviteId, getToken, navigate])

  async function handleAccept() {
    if (!inviteId) return
    if (!user) {
      pendingAcceptRef.current = true
      try {
        await signIn()
      } catch {
        pendingAcceptRef.current = false
      }
      return
    }
    setScreenState('accepting')
    try {
      const data = await acceptInvite(getToken, inviteId)
      navigate('/', { state: { openListId: data.list_id } })
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError
          ? (ERROR_MESSAGES[err.status] ?? 'No se pudo conectar. Inténtalo de nuevo.')
          : 'No se pudo conectar. Inténtalo de nuevo.'
      )
      setIsNetworkError(!(err instanceof ApiError))
      setScreenState('error')
    }
  }

  if (screenState === 'loading' || screenState === 'accepting') {
    return (
      <div
        className="invite-screen"
        role="status"
        aria-label={screenState === 'accepting' ? 'Uniéndose' : 'Cargando'}
      >
        <span className="invite-screen__spinner" />
      </div>
    )
  }

  if (screenState === 'error') {
    return (
      <div className="invite-screen">
        <div className="invite-screen__card">
          <p className="invite-screen__error">{errorMessage}</p>
          {isNetworkError && (
            <button
              className="invite-screen__btn"
              onClick={() => setRetryCount(c => c + 1)}
            >
              Reintentar
            </button>
          )}
          <a href="/" className="invite-screen__home-link">Ir al inicio &rarr;</a>
        </div>
      </div>
    )
  }

  return (
    <div className="invite-screen">
      <div className="invite-screen__card">
        <div className="invite-screen__icon">&#x1F6D2;</div>
        <h1 className="invite-screen__list-name">{preview?.list_name}</h1>
        {preview?.invited_by_name && (
          <p className="invite-screen__inviter">Invitado por {preview.invited_by_name}</p>
        )}
        <button className="invite-screen__btn" onClick={() => void handleAccept()}>
          {user ? 'Unirse a la lista' : 'Iniciar sesión para unirse'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- InviteScreen.test
```

Expected: all 11 PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/InviteScreen.tsx frontend/src/components/InviteScreen.css frontend/src/components/InviteScreen.test.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add InviteScreen component"
```

---

## Task 4: Frontend — wire React Router in App.tsx

Run all commands from `frontend/`.

- [ ] **Step 1: Replace `frontend/src/App.tsx`**

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SignInScreen } from './components/SignInScreen'
import { DashboardScreen } from './components/DashboardScreen'
import { InviteScreen } from './components/InviteScreen'

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
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/invite/:id" element={<InviteScreen />} />
          <Route path="*" element={<AppContent />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add React Router with /invite/:id route"
```

---

## Task 5: Frontend — DashboardScreen reads openListId from router state

Run all commands from `frontend/`.

- [ ] **Step 1: Update DashboardScreen tests**

At the top of `frontend/src/components/DashboardScreen.test.tsx`, add after the existing `vi.mock` calls:

```typescript
import * as reactRouter from 'react-router-dom'
vi.mock('react-router-dom', () => ({
  useLocation: vi.fn().mockReturnValue({ state: null }),
}))
```

Then add a new test at the end of the `describe('DashboardScreen', ...)` block (after the `'calls signOut...'` test):

```typescript
  it('auto-opens a list when openListId is passed via router state', async () => {
    vi.mocked(reactRouter.useLocation).mockReturnValue({ state: { openListId: 'l2' } } as never)
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() =>
      expect(screen.getByText('ListScreen:l2:Costco')).toBeInTheDocument()
    )
  })
```

- [ ] **Step 2: Run DashboardScreen tests to see what fails**

```bash
npm test -- DashboardScreen.test
```

Expected: all existing tests FAIL (DashboardScreen does not yet call `useLocation`) and the new test also fails.

- [ ] **Step 3: Update `DashboardScreen.tsx`**

Add `useRef` to the existing React import:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
```

Add `useLocation` import below the existing imports:

```typescript
import { useLocation } from 'react-router-dom'
```

Add inside `DashboardScreen` body, right after the existing `useState` declarations:

```typescript
  const location = useLocation()
  const openListIdRef = useRef<string | null>(
    (location.state as { openListId?: string } | null)?.openListId ?? null
  )
```

Replace the existing `fetchLists` callback with:

```typescript
  const fetchLists = useCallback(async () => {
    setLists(null)
    setFetchError(false)
    try {
      const data = (await getLists(getToken)) as ApiList[]
      setLists(data)
      if (openListIdRef.current) {
        const list = data.find(l => l.id === openListIdRef.current)
        if (list) setSelectedList(list)
        openListIdRef.current = null
      }
    } catch {
      setFetchError(true)
    }
  }, [getToken])
```

- [ ] **Step 4: Run DashboardScreen tests to verify they all pass**

```bash
npm test -- DashboardScreen.test
```

Expected: all tests PASS including the new one.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardScreen.tsx frontend/src/components/DashboardScreen.test.tsx
git commit -m "feat: auto-open list from router state after invite accept"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && uv run pytest -v
```

Expected: all tests PASS.

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend && npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run frontend typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.
