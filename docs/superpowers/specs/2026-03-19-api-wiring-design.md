# API Wiring Design

**Date:** 2026-03-19
**Scope:** Replace mock state in `ListScreen` with real Firebase Auth + FastAPI backend calls.

---

## Goals

- Google Sign-In via Firebase Auth; every API request carries a Bearer token
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
Query selects ListMember + User joined on user_id, filters by list_id, returns MemberRead
with display_name and photo_url populated from the User row.

No migration needed — this is a query change only.

---

## Auth Layer

### `src/contexts/AuthContext.tsx`

Wraps `onAuthStateChanged`. On sign-in: calls `POST /auth/sync` to get/create the Postgres
user record, then stores both the Firebase token and the backend user ID.

```ts
interface AuthContextValue {
  user: { id: string; displayName: string; photoUrl: string | null } | null
  token: string | null   // Firebase ID token; refreshed by SDK automatically
  signIn: () => Promise<void>   // Google popup
  signOut: () => Promise<void>
  loading: boolean
}
```

Token refresh: `getIdToken(firebaseUser, false)` is called before each API request to ensure
freshness (returns cached value if still valid; refreshes silently if near expiry).

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

Plain async functions — no class, no singleton. Every function takes `token: string` as its
first argument for easy testability.

```ts
const BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'

// Throws ApiError (with .status: number) on non-2xx responses
async function apiFetch(token: string, path: string, options?: RequestInit): Promise<unknown>

// Exported API functions:
syncUser(token)                           // POST /auth/sync
getLists(token)                           // GET /lists
getListItems(token, listId)               // GET /lists/{id}/items
getListMembers(token, listId)             // GET /lists/{id}/members
getListUpdatedAt(token, listId)           // GET /lists/{id}/updated-at
createItem(token, listId, payload)        // POST /lists/{id}/items
updateItem(token, listId, itemId, patch)  // PATCH /lists/{id}/items/{itemId}
getSuggestions(token, q)                  // GET /suggestions?q=
```

`ApiError` carries `.status` so callers can distinguish 401 (trigger re-auth) from 5xx
(show toast) without string-matching.

`syncUser` is called once in `AuthContext` after sign-in — not on every request.

---

## Data Layer

### `src/hooks/useListItems.ts`

Owns all list state and side effects. `ListScreen` is a thin consumer.

**Signature:**
```ts
function useListItems(listId: string, token: string): {
  status: 'loading' | 'error' | 'success'
  items: ListItem[]
  members: Map<string, Member>
  addItem: (parsed: ParsedInput) => Promise<void>
  togglePurchased: (itemId: string) => Promise<void>
  retry: () => void
}
```

**Initial fetch:** `getListItems` and `getListMembers` run concurrently via `Promise.all`.
Members mapped to UI `Member` type: `initial` = `display_name[0].toUpperCase()`, `colour`
assigned by index from `AVATAR_COLOURS`. Members fetched once on mount only.

**Polling:** `setInterval` every 5 s calls `getListUpdatedAt`. If the returned timestamp
differs from the stored one, `getListItems` re-fetches and updates state.

**Optimistic `togglePurchased`:**
1. Snapshot current items
2. Flip `purchased` in local state immediately
3. PATCH with `{ purchased: !prev }`
4. On error → restore snapshot + call `showToast`

**`addItem`:**
1. Append a temporary item (`id: 'tmp-${Date.now()}'`) to local state
2. POST to `/lists/{id}/items` with parsed fields
3. On success → replace temp item with real response item
4. On error → remove temp item + call `showToast`

**`showToast`:** passed into the hook as a parameter from `ListScreen` (avoids coupling
the hook to toast state).

---

## ListLoader

### `src/components/ListLoader.tsx`

Fetches `GET /lists` after auth resolves. Three states:

| State | UI |
|-------|----|
| Loading | Full-screen spinner |
| Empty | "You have no lists yet" + "Create list" button → POST /lists → reload |
| Success | `<ListScreen listId={lists[0].id} />` |

Temporary component — replaced by route wiring when routing lands.

---

## ListScreen Changes

- Accepts `listId: string` prop
- Removes all mock data imports (`MOCK_ITEMS`, `MOCK_MEMBERS`, `AVATAR_COLOURS`)
- Gets `token` from `useAuth()`
- Calls `useListItems(listId, token)`
- `onSubmit` calls `addItem(parsed)`
- Suggestions: `useEffect` on `inputValue`, debounced 300 ms, calls `getSuggestions(token, q)`
  when no active sigil and `name.length >= 2`

---

## File Map

| File | Action |
|------|--------|
| `backend/.env` | Add `DATABASE_URL=sqlite:///./carroquesi.db` |
| `backend/app/schemas/members.py` | Add `display_name`, `photo_url` to `MemberRead` |
| `backend/app/routers/members.py` | JOIN with `User` in GET endpoint |
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
| 401 on any request | Re-trigger sign-in (clear auth context) |
| `getLists` returns empty | `ListLoader` shows create-list prompt |

---

## Out of Scope

- Invite flow
- Inline tag editing
- Routing / lists home screen
- Push notifications / WebSocket real-time (polling covers this for MVP)
