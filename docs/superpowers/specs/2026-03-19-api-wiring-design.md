# API Wiring Design

**Date:** 2026-03-19
**Scope:** Replace mock state in `ListScreen` with real Firebase Auth + FastAPI backend calls.

---

## Goals

- Google Sign-In via Firebase Auth; every API request carries a fresh Bearer token
- Local dev backed by SQLite (`backend/.env` — no Docker required)
- `GET /lists/{id}/members` extended to return `display_name` and `photo_url`
- Auth state in `AuthContext`; API calls in `src/lib/api.ts`; list state + polling in `useListItems` hook
- `ListScreen` becomes a thin consumer — no more mock data
- "First list" strategy: after login fetch `GET /lists`, auto-load the first list

---

## Prerequisites

### SQLite local dev

Add to `backend/.env`:
```
DATABASE_URL=sqlite:///./carroquesi.db
```

Run once:
```bash
cd backend && uv run alembic upgrade head
```

No Docker required. SQLite behaviour matches the existing test suite.

### Backend: extend `GET /lists/{list_id}/members`

**`backend/app/schemas/members.py`** — add two fields to `MemberRead`:
```python
display_name: str
photo_url: str | None
```

**`backend/app/routers/members.py`** — change the GET query to JOIN with `User`:
Query selects `ListMember` + `User` joined on `user_id`, filters by `list_id`, returns
`MemberRead` with `display_name` and `photo_url` populated from the `User` row.

No migration needed — query change only.

### Frontend: clean up `src/lib/firebase.ts`

Remove the unused `db` (Firestore) and `storage` exports and their imports. The file
exports only `app` and `auth`. This aligns with the architecture (no Firestore, no Storage).

---

## Auth Layer

### `src/contexts/AuthContext.tsx`

Wraps `onAuthStateChanged`. On sign-in: calls `POST /auth/sync` to get/create the Postgres
user record.

```ts
interface AuthContextValue {
  user: {
    id: string          // Postgres UUID from /auth/sync response
    displayName: string // mapped from response.display_name
    photoUrl: string | null  // mapped from response.photo_url
    email: string
  } | null
  getToken: () => Promise<string>  // always returns a fresh Firebase ID token
  signIn: () => Promise<void>      // Google popup
  signOut: () => Promise<void>
  loading: boolean
}
```

**Token strategy:** `getToken` calls `getIdToken(firebaseUser, false)` on demand. The
Firebase SDK returns the cached token if it is still valid, or silently refreshes it if
near expiry. `token` is never stored in React state — callers always get a fresh value.
This is the only correct pattern; storing a string in state leads to stale tokens.

**`/auth/sync` response mapping:** The backend returns snake_case (`display_name`,
`photo_url`, `email`). `AuthContext` maps these to camelCase when building the `user` object:
```ts
// backend UserRead → context user
{ id, displayName: display_name, photoUrl: photo_url, email }
```

### `src/components/SignInScreen.tsx`

Minimal centred card: app name + "Continue with Google" button. No email/password fields.

### `src/App.tsx`

```
AuthProvider wraps entire tree

loading  → spinner
!user    → <SignInScreen />
user     → <ListLoader />
```

---

## API Layer

### `src/lib/api.ts`

Plain async functions — no class, no singleton. Every function takes
`getToken: () => Promise<string>` as its first argument, matching the `AuthContext`
interface. They call `getToken()` immediately at the start of each request to ensure
the token is always fresh.

```ts
const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'

// Throws ApiError (with .status: number) on non-2xx responses
async function apiFetch(
  getToken: () => Promise<string>,
  path: string,
  options?: RequestInit
): Promise<unknown>

// Exported API functions (all take getToken as first arg):
syncUser(getToken)                              // POST /auth/sync
getLists(getToken)                              // GET /lists
getListItems(getToken, listId)                  // GET /lists/{id}/items
getListMembers(getToken, listId)                // GET /lists/{id}/members
getListUpdatedAt(getToken, listId)              // GET /lists/{id}/updated-at
createItem(getToken, listId, payload)           // POST /lists/{id}/items
updateItem(getToken, listId, itemId, patch)     // PATCH /lists/{id}/items/{itemId}
getSuggestions(getToken, q)                     // GET /suggestions?q=
```

`ApiError` carries `.status` so callers can distinguish 401 (trigger re-auth) from 5xx
(show toast) without string-matching.

`syncUser` is called once in `AuthContext` after sign-in — not on every request.

---

## Types

### `Member` (update `src/types.ts`)

Add `photoUrl` to the existing `Member` interface:
```ts
export interface Member {
  id: string
  displayName: string
  initial: string
  colour: string
  photoUrl: string | null  // NEW — from backend MemberRead.photo_url
}
```

`photoUrl` enables showing a real profile photo (`<img>`) instead of the initial letter
when available. Components can fall back to the initial if `photoUrl` is null.

---

## Data Layer

### `src/hooks/useListItems.ts`

Owns all list state and side effects. `ListScreen` is a thin consumer.

**Signature:**
```ts
function useListItems(
  listId: string,
  getToken: () => Promise<string>
): {
  status: 'loading' | 'error' | 'success'
  items: ListItem[]
  members: Map<string, Member>
  addItem: (parsed: ParsedInput) => Promise<void>
  togglePurchased: (itemId: string) => Promise<void>
  retry: () => void
}
```

`getToken` replaces the previous `token: string` parameter — this eliminates the
null-safety mismatch between `AuthContext` and the hook, since `getToken` is a stable
function reference available from the moment the user object exists.

**`AVATAR_COLOURS`** is imported from `src/mockData.ts` (which already exports it).
No new constants file needed.

**Member mapping** (backend → UI type):
```ts
// backend MemberRead fields:
//   id, user_id, list_id, display_name, photo_url, created_at
// UI Member:
{
  id: member.user_id,
  displayName: member.display_name,
  initial: member.display_name[0].toUpperCase(),
  colour: AVATAR_COLOURS[index % AVATAR_COLOURS.length],
  photoUrl: member.photo_url,
}
```

**Initial fetch:** `getListItems` and `getListMembers` run concurrently via `Promise.all`.
Members fetched once on mount only (membership changes are rare).

**Polling:** `setInterval` every 5 s calls `getListUpdatedAt`. If the returned timestamp
differs from the stored one, `getListItems` re-fetches. The interval is cleared on unmount.

**Optimistic `togglePurchased`:**
1. Snapshot current items
2. Flip `purchased` in local state immediately
3. PATCH `{ purchased: !prev }`
4. On error → restore snapshot + call `showToast('Couldn\'t update item')`

**`addItem`:**
1. Append a temporary item (`id: \`tmp-${Date.now()}\``) to local state
2. POST to `/lists/{id}/items` with parsed fields
3. On success → replace temp item with real response item
4. On error → remove temp item + call `showToast('Couldn\'t add item')`

**`showToast`:** passed into the hook as a parameter from `ListScreen`.

---

## ListLoader

### `src/components/ListLoader.tsx`

Fetches `GET /lists` after auth resolves. Three states:

| State | UI |
|-------|----|
| Loading | Full-screen spinner |
| Empty | "You have no lists yet" + inline name input + "Create list" button |
| Success | `<ListScreen listId={lists[0].id} />` |

**Empty state detail:** The user types a list name into a plain `<input>`. Clicking
"Create list" calls `POST /lists` with `{ name }`, then re-fetches `GET /lists` to
load the newly created list. The `POST /lists` body requires `{ name: string }` — no
default name is assumed.

Temporary component — replaced by route wiring when routing lands.

---

## ListScreen Changes

- Accepts `listId: string` prop
- Removes mock data imports: `MOCK_ITEMS`, `MOCK_MEMBERS` (but NOT `AVATAR_COLOURS` — that
  stays in `mockData.ts` and is used by `useListItems`)
- Gets `getToken` from `useAuth()` via `const { getToken } = useAuth()`
- Calls `useListItems(listId, getToken)`
- `onSubmit` calls `addItem(parsed)`
- Suggestions: `useEffect` on `inputValue`, debounced 300 ms, calls
  `getSuggestions(getToken, q)` when no active sigil and `name.length >= 2`

---

## File Map

| File | Action |
|------|--------|
| `backend/.env` | Add `DATABASE_URL=sqlite:///./carroquesi.db` |
| `backend/app/schemas/members.py` | Add `display_name`, `photo_url` to `MemberRead` |
| `backend/app/routers/members.py` | JOIN with `User` in GET endpoint |
| `frontend/src/lib/firebase.ts` | Remove unused Firestore/Storage exports |
| `frontend/src/mockData.ts` | Add `photoUrl: null` to each `MOCK_MEMBERS` entry |
| `frontend/src/types.ts` | Add `photoUrl` to `Member` interface |
| `frontend/src/contexts/AuthContext.tsx` | Create |
| `frontend/src/components/SignInScreen.tsx` | Create |
| `frontend/src/components/ListLoader.tsx` | Create |
| `frontend/src/lib/api.ts` | Create |
| `frontend/src/hooks/useListItems.ts` | Create |
| `frontend/src/components/ListScreen.tsx` | Modify |
| `frontend/src/App.tsx` | Modify |

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Network error on initial fetch | `status = 'error'`, retry button shown |
| `togglePurchased` fails | Rollback + toast "Couldn't update item" |
| `addItem` fails | Remove temp item + toast "Couldn't add item" |
| 401 on any request | Call `signOut()` from auth context to force re-login |
| `getLists` returns empty | `ListLoader` shows name input + create-list prompt |

---

## Out of Scope

- Invite flow
- Inline tag editing
- Routing / lists home screen
- Push notifications / WebSocket real-time (polling covers this for MVP)
- Photo display in avatar (`photoUrl` is stored in `Member` but `ItemCard` continues
  to show the initial letter; photo rendering can be added later)
