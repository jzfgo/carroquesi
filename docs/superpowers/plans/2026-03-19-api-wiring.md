# API Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock state in `ListScreen` with real Firebase Auth + FastAPI backend calls, using SQLite for local dev.

**Architecture:** AuthProvider wraps the app; `useAuth()` provides `getToken: () => Promise<string>` so every API call always has a fresh Firebase ID token. `useListItems` owns all list state with optimistic updates and 5-second polling.

**Tech Stack:** React 19 + TypeScript + Vite, FastAPI + SQLModel (backend), Vitest + React Testing Library (tests).

---

## File Structure

| File                                            | Action                                            |
| ----------------------------------------------- | ------------------------------------------------- |
| `backend/.env`                                  | Add `DATABASE_URL=sqlite:///./carroquesi.db`      |
| `backend/app/schemas/members.py`                | Add `display_name`, `photo_url` to `MemberRead`   |
| `backend/app/routers/members.py`                | JOIN with `User` in GET endpoint                  |
| `backend/tests/test_members.py`                 | Add test for new fields                           |
| `frontend/src/lib/firebase.ts`                  | Remove unused Firestore/Storage exports           |
| `frontend/src/types.ts`                         | Add `photoUrl: string \| null` to `Member`        |
| `frontend/src/mockData.ts`                      | Add `photoUrl: null` to each `MOCK_MEMBERS` entry |
| `frontend/src/lib/api.ts`                       | Create: ApiError + all API functions              |
| `frontend/src/lib/api.test.ts`                  | Create: unit tests for api.ts                     |
| `frontend/src/contexts/AuthContext.tsx`         | Create: AuthProvider + useAuth                    |
| `frontend/src/components/SignInScreen.tsx`      | Create: minimal Google sign-in card               |
| `frontend/src/components/SignInScreen.test.tsx` | Create: render + click tests                      |
| `frontend/src/hooks/useListItems.ts`            | Create: list state, polling, optimistic updates   |
| `frontend/src/hooks/useListItems.test.tsx`      | Create: unit tests                                |
| `frontend/src/components/ListLoader.tsx`        | Create: loading/empty/success states              |
| `frontend/src/components/ListLoader.test.tsx`   | Create: render tests                              |
| `frontend/src/components/ListScreen.tsx`        | Modify: accept `listId` prop, use hook            |
| `frontend/src/App.tsx`                          | Modify: AuthProvider + AppContent                 |

---

### Task 1: Backend — SQLite dev config + MemberRead extension

**Files:**

- Modify: `backend/.env`
- Modify: `backend/app/schemas/members.py`
- Modify: `backend/app/routers/members.py`
- Test: `backend/tests/test_members.py`

- [ ] **Step 1: Add SQLite DATABASE_URL to backend/.env**

If `backend/.env` does not exist, create it. Add this line (keep any existing content):

```
DATABASE_URL=sqlite:///./carroquesi.db
```

- [ ] **Step 2: Run Alembic to create the SQLite database**

```bash
cd backend && uv run alembic upgrade head
```

Expected: `INFO  [alembic.runtime.migration] Running upgrade ...` with no errors. A `carroquesi.db` file is created in `backend/`.

- [ ] **Step 3: Write the failing test for MemberRead fields**

Add to `backend/tests/test_members.py`:

```python
def test_get_members_includes_user_fields(client: TestClient, user):
    lst = _create_list(client)
    response = client.get(f"/lists/{lst['id']}/members")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    member = data[0]
    assert member["display_name"] == "Alice"
    assert member["photo_url"] is None
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd backend && uv run pytest tests/test_members.py::test_get_members_includes_user_fields -v
```

Expected: FAIL — `KeyError: 'display_name'` or validation error.

- [ ] **Step 5: Add fields to MemberRead schema**

Replace `backend/app/schemas/members.py`:

```python
from datetime import datetime

from pydantic import BaseModel, EmailStr


class AddMemberRequest(BaseModel):
    email: EmailStr


class MemberRead(BaseModel):
    id: str
    user_id: str
    list_id: str
    display_name: str
    photo_url: str | None
    created_at: datetime
```

- [ ] **Step 6: Update the GET endpoint to JOIN with User**

Replace the `get_members` function in `backend/app/routers/members.py`.

The `User` import is already present (`from app.db.models import List, ListInvite, ListMember, User`).

Use `select(ListMember, User).join(User, User.id == ListMember.user_id).where(ListMember.list_id == lst.id)` — SQLModel's `session.exec()` returns `(ListMember, User)` tuples. Build a `MemberRead` for each pair, populating `display_name` from `user.display_name or ""` and `photo_url` from `user.photo_url`.

```python
@router.get("", response_model=list[MemberRead])
def get_members(
    list_and_user: MemberDep,
    session: CurrentSession,
):
    lst, _ = list_and_user
    results = session.exec(
        select(ListMember, User)
        .join(User, User.id == ListMember.user_id)
        .where(ListMember.list_id == lst.id)
    ).all()
    return [
        MemberRead(
            id=member.id,
            user_id=member.user_id,
            list_id=member.list_id,
            created_at=member.created_at,
            display_name=user.display_name or "",
            photo_url=user.photo_url,
        )
        for member, user in results
    ]
```

- [ ] **Step 7: Run all backend member tests**

```bash
cd backend && uv run pytest tests/test_members.py -v
```

Expected: All tests PASS.

- [ ] **Step 8: Run full backend test suite**

```bash
cd backend && uv run pytest -v
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/.env backend/app/schemas/members.py backend/app/routers/members.py backend/tests/test_members.py
git commit -m "feat: extend MemberRead with display_name and photo_url via JOIN"
```

---

### Task 2: Frontend Foundation — firebase cleanup, types, mockData

**Files:**

- Modify: `frontend/src/lib/firebase.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/mockData.ts`

- [ ] **Step 1: Clean up firebase.ts**

Replace `frontend/src/lib/firebase.ts` — keep only `app` and `auth`, remove `db` (Firestore) and `storage`:

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
```

- [ ] **Step 2: Add photoUrl to Member interface**

In `frontend/src/types.ts`, add `photoUrl` field to `Member`:

```typescript
export interface Member {
  id: string;
  displayName: string;
  initial: string;
  colour: string;
  photoUrl: string | null;
}
```

- [ ] **Step 3: Add photoUrl: null to MOCK_MEMBERS**

In `frontend/src/mockData.ts`, update `MOCK_MEMBERS`:

```typescript
export const MOCK_MEMBERS: Member[] = [
  {
    id: 'user-javi',
    displayName: 'Javier',
    initial: 'J',
    colour: AVATAR_COLOURS[0],
    photoUrl: null,
  },
  {
    id: 'user-elena',
    displayName: 'Elena',
    initial: 'E',
    colour: AVATAR_COLOURS[1],
    photoUrl: null,
  },
];
```

- [ ] **Step 4: Verify TypeScript is happy**

```bash
cd frontend && npm run typecheck
```

Expected: No errors. The compiler catches any `Member` usage that is missing `photoUrl`.

- [ ] **Step 5: Run existing tests to confirm nothing broke**

```bash
cd frontend && npx vitest run
```

Expected: All existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/firebase.ts frontend/src/types.ts frontend/src/mockData.ts
git commit -m "feat: add photoUrl to Member type, clean up firebase.ts"
```

---

### Task 3: API client — src/lib/api.ts

**Files:**

- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLists,
  createList,
  createItem,
  updateItem,
  getListUpdatedAt,
  ApiError,
} from './api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockGetToken = () => vi.fn().mockResolvedValue('test-token');

function mockResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(String(body)),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('apiFetch — authorization', () => {
  it('sends Authorization: Bearer <token> on every request', async () => {
    mockFetch.mockReturnValue(mockResponse([]));
    await getLists(mockGetToken());
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });
});

describe('ApiError', () => {
  it('carries .status on non-2xx response', async () => {
    mockFetch.mockReturnValue(mockResponse('Not found', 404));
    await expect(getLists(mockGetToken())).rejects.toMatchObject({
      status: 404,
    });
  });

  it('is an instance of ApiError', async () => {
    mockFetch.mockReturnValue(mockResponse('Server error', 500));
    try {
      await getLists(mockGetToken());
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
    }
  });
});

describe('getLists', () => {
  it('GET /lists returns parsed JSON', async () => {
    mockFetch.mockReturnValue(mockResponse([{ id: 'l1', name: 'Compras' }]));
    const result = await getLists(mockGetToken());
    expect(result).toEqual([{ id: 'l1', name: 'Compras' }]);
  });
});

describe('createList', () => {
  it('POST /lists with name body', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'l1', name: 'Compras' }));
    await createList(mockGetToken(), 'Compras');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Compras' }),
      }),
    );
  });
});

describe('createItem', () => {
  it('POST /lists/{id}/items', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'item-1', name: 'Leche' }));
    await createItem(mockGetToken(), 'list-1', { name: 'Leche' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/list-1/items'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('updateItem', () => {
  it('PATCH /lists/{id}/items/{itemId}', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'item-1', purchased: true }));
    await updateItem(mockGetToken(), 'list-1', 'item-1', { purchased: true });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/list-1/items/item-1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('getListUpdatedAt', () => {
  it('GET /lists/{id}/updated-at', async () => {
    mockFetch.mockReturnValue(
      mockResponse({ updated_at: '2026-01-01T00:00:00' }),
    );
    const result = (await getListUpdatedAt(mockGetToken(), 'list-1')) as {
      updated_at: string;
    };
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/list-1/updated-at'),
      expect.any(Object),
    );
    expect(result.updated_at).toBe('2026-01-01T00:00:00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/lib/api.test.ts
```

Expected: FAIL — `Cannot find module './api'`.

- [ ] **Step 3: Create src/lib/api.ts**

```typescript
const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch(
  getToken: () => Promise<string>,
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return null;
  return res.json();
}

export function syncUser(getToken: () => Promise<string>) {
  return apiFetch(getToken, '/auth/sync', { method: 'POST' });
}

export function getLists(getToken: () => Promise<string>) {
  return apiFetch(getToken, '/lists');
}

export function createList(getToken: () => Promise<string>, name: string) {
  return apiFetch(getToken, '/lists', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function getListItems(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}/items`);
}

export function getListMembers(
  getToken: () => Promise<string>,
  listId: string,
) {
  return apiFetch(getToken, `/lists/${listId}/members`);
}

export function getListUpdatedAt(
  getToken: () => Promise<string>,
  listId: string,
) {
  return apiFetch(getToken, `/lists/${listId}/updated-at`);
}

export function createItem(
  getToken: () => Promise<string>,
  listId: string,
  payload: {
    name: string;
    quantity?: string | null;
    brand?: string | null;
    variety?: string | null;
    store?: string | null;
  },
) {
  return apiFetch(getToken, `/lists/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateItem(
  getToken: () => Promise<string>,
  listId: string,
  itemId: string,
  patch: Partial<{
    purchased: boolean;
    name: string;
    quantity: string | null;
    brand: string | null;
    variety: string | null;
    store: string | null;
  }>,
) {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function getSuggestions(getToken: () => Promise<string>, q: string) {
  return apiFetch(getToken, `/suggestions?q=${encodeURIComponent(q)}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/lib/api.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "feat: add api.ts with ApiError and typed API functions"
```

---

### Task 4: Auth layer — AuthContext + SignInScreen

**Files:**

- Create: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/components/SignInScreen.tsx`
- Create: `frontend/src/components/SignInScreen.test.tsx`

- [ ] **Step 1: Write the failing SignInScreen tests**

Create `frontend/src/components/SignInScreen.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignInScreen } from './SignInScreen'
import * as AuthContext from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: null,
    getToken: vi.fn(),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    loading: false,
  })
})

describe('SignInScreen', () => {
  it('renders app name', () => {
    render(<SignInScreen />)
    expect(screen.getByText(/carroquesí/i)).toBeInTheDocument()
  })

  it('renders Google sign-in button', () => {
    render(<SignInScreen />)
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })

  it('calls signIn when button is clicked', () => {
    const mockSignIn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      getToken: vi.fn(),
      signIn: mockSignIn,
      signOut: vi.fn(),
      loading: false,
    })
    render(<SignInScreen />)
    fireEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(mockSignIn).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/SignInScreen.test.tsx
```

Expected: FAIL — `Cannot find module './SignInScreen'`.

- [ ] **Step 3: Create AuthContext.tsx**

Create `frontend/src/contexts/AuthContext.tsx`:

```typescript
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  getIdToken,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { syncUser } from '../lib/api'

interface AuthUser {
  id: string
  displayName: string
  photoUrl: string | null
  email: string
}

interface AuthContextValue {
  user: AuthUser | null
  getToken: () => Promise<string>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser)
        try {
          const getToken = () => getIdToken(fbUser, false)
          const data = await syncUser(getToken) as {
            id: string
            display_name: string
            photo_url: string | null
            email: string
          }
          setUser({
            id: data.id,
            displayName: data.display_name,
            photoUrl: data.photo_url,
            email: data.email,
          })
        } catch {
          setUser(null)
        }
      } else {
        setFirebaseUser(null)
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const getToken = async (): Promise<string> => {
    if (!firebaseUser) throw new Error('Not authenticated')
    return getIdToken(firebaseUser, false)
  }

  const signIn = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider())
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, getToken, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
```

- [ ] **Step 4: Create SignInScreen.tsx**

Create `frontend/src/components/SignInScreen.tsx`:

```typescript
import { useAuth } from '../contexts/AuthContext'

export function SignInScreen() {
  const { signIn } = useAuth()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        gap: '1.5rem',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>CarroQueSí</h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
        Lista de compras compartida
      </p>
      <button
        onClick={() => void signIn()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: 500,
        }}
      >
        Continuar con Google
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npx vitest run src/components/SignInScreen.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 6: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx frontend/src/components/SignInScreen.tsx frontend/src/components/SignInScreen.test.tsx
git commit -m "feat: add AuthContext with getToken pattern and SignInScreen"
```

---

### Task 5: Data layer — useListItems hook

**Files:**

- Create: `frontend/src/hooks/useListItems.ts`
- Create: `frontend/src/hooks/useListItems.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hooks/useListItems.test.tsx`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useListItems } from './useListItems';
import * as api from '../lib/api';
import type { ListItem } from '../types';

vi.mock('../lib/api');

const mockGetToken = vi.fn().mockResolvedValue('token');
const mockShowToast = vi.fn();

const item1: ListItem = {
  id: 'item-1',
  list_id: 'list-1',
  name: 'Leche',
  quantity: null,
  brand: null,
  variety: null,
  store: null,
  purchased: false,
  added_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockRawMembers = [
  {
    id: 'mem-1',
    user_id: 'user-1',
    list_id: 'list-1',
    display_name: 'Alice',
    photo_url: null,
    created_at: '',
  },
];

beforeEach(() => {
  vi.mocked(api.getListItems).mockResolvedValue([item1] as never);
  vi.mocked(api.getListMembers).mockResolvedValue(mockRawMembers as never);
  vi.mocked(api.getListUpdatedAt).mockResolvedValue({
    updated_at: '2026-01-01T00:00:00',
  } as never);
  mockShowToast.mockReset();
});

describe('useListItems — initial fetch', () => {
  it('starts in loading state', () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    );
    expect(result.current.status).toBe('loading');
  });

  it('resolves to success with items and members', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('Leche');
    expect(result.current.members.get('user-1')?.displayName).toBe('Alice');
    expect(result.current.members.get('user-1')?.photoUrl).toBeNull();
  });

  it('sets status to error when fetch fails', async () => {
    vi.mocked(api.getListItems).mockRejectedValue(new Error('Network'));
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});

describe('useListItems — togglePurchased', () => {
  it('optimistically flips purchased', async () => {
    vi.mocked(api.updateItem).mockResolvedValue({} as never);
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      await result.current.togglePurchased('item-1');
    });

    expect(result.current.items[0].purchased).toBe(true);
  });

  it('rolls back and shows toast on error', async () => {
    vi.mocked(api.updateItem).mockRejectedValue(new Error('Network'));
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      await result.current.togglePurchased('item-1');
    });

    expect(result.current.items[0].purchased).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith("Couldn't update item");
  });
});

describe('useListItems — addItem', () => {
  it('replaces temp item with real item on success', async () => {
    const realItem: ListItem = {
      ...item1,
      id: 'item-real',
      name: 'Leche Real',
    };
    vi.mocked(api.createItem).mockResolvedValue(realItem as never);
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));

    await act(async () => {
      await result.current.addItem({
        name: 'Leche Real',
        quantity: null,
        brand: null,
        variety: null,
        store: null,
      });
    });

    expect(result.current.items[0].id).toBe('item-real');
    expect(result.current.items[0].name).toBe('Leche Real');
  });

  it('removes temp item and shows toast on error', async () => {
    vi.mocked(api.createItem).mockRejectedValue(new Error('Network'));
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
    const initialLength = result.current.items.length;

    await act(async () => {
      await result.current.addItem({
        name: 'Leche',
        quantity: null,
        brand: null,
        variety: null,
        store: null,
      });
    });

    expect(result.current.items).toHaveLength(initialLength);
    expect(mockShowToast).toHaveBeenCalledWith("Couldn't add item");
  });
});

describe('useListItems — polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('re-fetches items when updated_at timestamp changes', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    );
    await waitFor(() => expect(result.current.status).toBe('success'));

    const updatedItem: ListItem = { ...item1, name: 'Leche Updated' };
    vi.mocked(api.getListUpdatedAt).mockResolvedValue({
      updated_at: '2026-01-02T00:00:00',
    } as never);
    vi.mocked(api.getListItems).mockResolvedValue([updatedItem] as never);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() =>
      expect(result.current.items[0].name).toBe('Leche Updated'),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/hooks/useListItems.test.tsx
```

Expected: FAIL — `Cannot find module './useListItems'`.

- [ ] **Step 3: Create frontend/src/hooks/useListItems.ts**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ListItem, Member, ParsedInput } from '../types';
import {
  getListItems,
  getListMembers,
  getListUpdatedAt,
  createItem,
  updateItem,
} from '../lib/api';
import { AVATAR_COLOURS } from '../mockData';

type Status = 'loading' | 'error' | 'success';

interface BackendMember {
  id: string;
  user_id: string;
  list_id: string;
  display_name: string;
  photo_url: string | null;
  created_at: string;
}

function toMember(m: BackendMember, index: number): Member {
  return {
    id: m.user_id,
    displayName: m.display_name,
    initial: m.display_name ? m.display_name[0].toUpperCase() : '?',
    colour: AVATAR_COLOURS[index % AVATAR_COLOURS.length],
    photoUrl: m.photo_url,
  };
}

export function useListItems(
  listId: string,
  getToken: () => Promise<string>,
  showToast: (msg: string) => void,
) {
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<ListItem[]>([]);
  const [members, setMembers] = useState<Map<string, Member>>(new Map());
  const lastUpdatedAt = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    setStatus('loading');
    try {
      const [rawItems, rawMembers] = await Promise.all([
        getListItems(getToken, listId) as Promise<ListItem[]>,
        getListMembers(getToken, listId) as Promise<BackendMember[]>,
      ]);
      setItems(rawItems);
      const map = new Map<string, Member>();
      rawMembers.forEach((m, i) => map.set(m.user_id, toMember(m, i)));
      setMembers(map);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [listId, getToken]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // 5-second polling: re-fetch items only when updated_at changes
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const data = (await getListUpdatedAt(getToken, listId)) as {
          updated_at: string;
        };
        if (
          lastUpdatedAt.current !== null &&
          data.updated_at !== lastUpdatedAt.current
        ) {
          const raw = (await getListItems(getToken, listId)) as ListItem[];
          setItems(raw);
        }
        lastUpdatedAt.current = data.updated_at;
      } catch {
        // polling failures are silent
      }
    }, 5000);
    return () => clearInterval(id);
  }, [listId, getToken]);

  const togglePurchased = useCallback(
    async (itemId: string) => {
      let snapshot: ListItem[] = [];
      let prevPurchased = false;
      setItems((prev) => {
        snapshot = prev;
        prevPurchased = prev.find((i) => i.id === itemId)?.purchased ?? false;
        return prev.map((i) =>
          i.id === itemId ? { ...i, purchased: !i.purchased } : i,
        );
      });
      try {
        await updateItem(getToken, listId, itemId, {
          purchased: !prevPurchased,
        });
      } catch {
        setItems(snapshot);
        showToast("Couldn't update item");
      }
    },
    [getToken, listId, showToast],
  );

  const addItem = useCallback(
    async (parsed: ParsedInput) => {
      const tempId = `tmp-${Date.now()}`;
      const temp: ListItem = {
        id: tempId,
        list_id: listId,
        name: parsed.name,
        quantity: parsed.quantity,
        variety: parsed.variety,
        brand: parsed.brand,
        store: parsed.store,
        purchased: false,
        added_by: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setItems((prev) => [temp, ...prev]);
      try {
        const created = (await createItem(getToken, listId, {
          name: parsed.name,
          quantity: parsed.quantity,
          variety: parsed.variety,
          brand: parsed.brand,
          store: parsed.store,
        })) as ListItem;
        setItems((prev) => prev.map((i) => (i.id === tempId ? created : i)));
      } catch {
        setItems((prev) => prev.filter((i) => i.id !== tempId));
        showToast("Couldn't add item");
      }
    },
    [getToken, listId, showToast],
  );

  return { status, items, members, togglePurchased, addItem, retry: fetchAll };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/hooks/useListItems.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useListItems.ts frontend/src/hooks/useListItems.test.tsx
git commit -m "feat: add useListItems hook with polling and optimistic updates"
```

---

### Task 6: ListLoader component

**Files:**

- Create: `frontend/src/components/ListLoader.tsx`
- Create: `frontend/src/components/ListLoader.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/ListLoader.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListLoader } from './ListLoader'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api')
vi.mock('./ListScreen', () => ({
  ListScreen: ({ listId }: { listId: string }) => <div>ListScreen:{listId}</div>,
}))

const mockGetToken = vi.fn().mockResolvedValue('token')

beforeEach(() => {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  })
  vi.mocked(api.createList).mockResolvedValue({ id: 'l1', name: 'New List' } as never)
})

describe('ListLoader', () => {
  it('shows a loading indicator initially', () => {
    vi.mocked(api.getLists).mockReturnValue(new Promise(() => {}))
    render(<ListLoader />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders ListScreen with the first list id on success', async () => {
    vi.mocked(api.getLists).mockResolvedValue([
      { id: 'list-42', name: 'Compras', owner_id: 'u1', created_at: '', updated_at: '' },
    ] as never)
    render(<ListLoader />)
    await waitFor(() =>
      expect(screen.getByText('ListScreen:list-42')).toBeInTheDocument(),
    )
  })

  it('shows empty state with name input when no lists', async () => {
    vi.mocked(api.getLists).mockResolvedValue([] as never)
    render(<ListLoader />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /crear/i })).toBeInTheDocument()
  })

  it('creates a list and loads it on form submit', async () => {
    vi.mocked(api.getLists)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValue([
        { id: 'list-new', name: 'Compras', owner_id: 'u1', created_at: '', updated_at: '' },
      ] as never)
    render(<ListLoader />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Compras' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear/i }))
    await waitFor(() =>
      expect(screen.getByText('ListScreen:list-new')).toBeInTheDocument(),
    )
    expect(api.createList).toHaveBeenCalledWith(mockGetToken, 'Compras')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/ListLoader.test.tsx
```

Expected: FAIL — `Cannot find module './ListLoader'`.

- [ ] **Step 3: Create ListLoader.tsx**

Create `frontend/src/components/ListLoader.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getLists, createList } from '../lib/api'
import { ListScreen } from './ListScreen'

interface ApiList {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
}

export function ListLoader() {
  const { getToken } = useAuth()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [listName, setListName] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchLists = async () => {
    setLists(null)
    const data = (await getLists(getToken)) as ApiList[]
    setLists(data)
  }

  useEffect(() => {
    void fetchLists()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (lists === null) {
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

  if (lists.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          gap: '1rem',
          padding: '2rem',
        }}
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          Aún no tienes ninguna lista
        </p>
        <input
          value={listName}
          onChange={(e) => setListName(e.target.value)}
          placeholder="Nombre de la lista"
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--color-border)',
            fontSize: '1rem',
            width: '100%',
            maxWidth: 320,
          }}
        />
        <button
          onClick={async () => {
            if (!listName.trim()) return
            setCreating(true)
            await createList(getToken, listName.trim())
            await fetchLists()
            setCreating(false)
          }}
          disabled={creating || !listName.trim()}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.375rem',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Crear lista
        </button>
      </div>
    )
  }

  return <ListScreen listId={lists[0].id} />
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/ListLoader.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ListLoader.tsx frontend/src/components/ListLoader.test.tsx
git commit -m "feat: add ListLoader with loading/empty/success states"
```

---

### Task 7: Wire ListScreen and App.tsx

**Files:**

- Modify: `frontend/src/components/ListScreen.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Rewrite ListScreen.tsx**

Replace `frontend/src/components/ListScreen.tsx`:

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react'
import './ListScreen.css'
import { ListHeader } from './ListHeader'
import { ProgressBar } from './ProgressBar'
import { ItemList } from './ItemList'
import { SmartInputBar } from './SmartInputBar'
import { Toast } from './Toast'
import { parseInput } from '../parseInput'
import { useAuth } from '../contexts/AuthContext'
import { useListItems } from '../hooks/useListItems'
import { getSuggestions } from '../lib/api'
import type { TagField } from '../types'

interface Props {
  listId: string
}

export function ListScreen({ listId }: Props) {
  const { getToken } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const parsed = useMemo(() => parseInput(inputValue), [inputValue])
  const { status, items, members, togglePurchased, addItem, retry } =
    useListItems(listId, getToken, setToast)

  // Debounced suggestions — only when name has 2+ chars
  useEffect(() => {
    const q = parsed.name.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const data = (await getSuggestions(getToken, q)) as string[]
        setSuggestions(data)
      } catch {
        // suggestion errors are non-critical
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [parsed.name, getToken])

  const handleTogglePurchased = useCallback(
    (itemId: string) => {
      void togglePurchased(itemId)
    },
    [togglePurchased],
  )

  const handleTagClick = useCallback((_itemId: string, _field: TagField) => {
    // tag editing wired in a future task
  }, [])

  const handleSubmit = useCallback(() => {
    if (!parsed.name.trim()) return
    void addItem(parsed)
    setInputValue('')
  }, [parsed, addItem])

  const purchasedCount = items.filter((i) => i.purchased).length

  return (
    <div className="list-screen">
      <ListHeader title="Mi lista" onMenuOpen={() => {}} />
      <ProgressBar purchased={purchasedCount} total={items.length} />
      <ItemList
        status={status}
        items={items}
        members={members}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onRetry={retry}
      />
      <SmartInputBar
        value={inputValue}
        parsed={parsed}
        items={items}
        suggestions={suggestions}
        onChange={setInputValue}
        onSubmit={handleSubmit}
      />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
```

- [ ] **Step 2: Rewrite App.tsx**

Replace `frontend/src/App.tsx`:

```typescript
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SignInScreen } from './components/SignInScreen'
import { ListLoader } from './components/ListLoader'

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
  return <ListLoader />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: No errors.

- [ ] **Step 4: Run the full test suite**

```bash
cd frontend && npx vitest run
```

Expected: All tests PASS. Existing tests for `ItemCard`, `SmartInputBar`, `ItemList`, `Toast`, `ProgressBar`, `ListHeader`, and `parseInput` must continue to pass. New tests for `SignInScreen`, `ListLoader`, `useListItems`, and `api.ts` should also pass.

- [ ] **Step 5: Start the backend dev server**

In one terminal:

```bash
cd backend && uv run uvicorn app.main:app --reload
```

Verify it is up:

```bash
curl -s http://localhost:8000/openapi.json | python3 -c "import sys,json; print(json.load(sys.stdin)['info']['title'])"
```

Expected: `CarroQueSí API` (or similar).

- [ ] **Step 6: Start the frontend dev server and verify the sign-in screen**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`. You should see the `SignInScreen` with "CarroQueSí" heading and "Continuar con Google" button. The app no longer renders mock data on load.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ListScreen.tsx frontend/src/App.tsx
git commit -m "feat: wire ListScreen and App.tsx to real auth and API"
```

- [ ] **Step 8: Final full test suite run**

```bash
cd frontend && npx vitest run && cd ../backend && uv run pytest
```

Expected: All frontend and backend tests PASS.
