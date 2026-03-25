# Invite Accept UI — Design Spec

**Date:** 2026-03-25

## Goal

Let users follow a share link (`/invite/:id`) to preview a list invitation and join it. Works for both authenticated and unauthenticated users.

## In Scope

- `/invite/:id` route with a preview + accept screen
- Unauthenticated flow: preview → Google Sign-In → auto-accept → list open
- Authenticated flow: preview → accept → list open
- Inline error states for all failure cases
- 410 response for expired invites (backend change)

## Out of Scope

- Email notifications
- Invite management UI (viewing/cancelling sent invites)
- Declining invites

---

## Architecture

Add `react-router-dom`. `App.tsx` wraps everything in `<BrowserRouter>` with two routes:

| Route | Component |
|-------|-----------|
| `/` | Existing app (auth gate → `SignInScreen` or `DashboardScreen`) |
| `/invite/:id` | `InviteScreen` |

Both routes share `AuthContext`.

**New files:**
- `frontend/src/components/InviteScreen.tsx`
- `frontend/src/components/InviteScreen.css`
- `frontend/src/components/InviteScreen.test.tsx`

**Modified files:**
- `frontend/src/App.tsx` — add `BrowserRouter` + `Routes`
- `frontend/src/lib/api.ts` — add `getInvitePreview`, `acceptInvite`
- `backend/app/routers/invites.py` — add 410 for expired invites
- `backend/tests/test_invites.py` — add expiry test cases

---

## InviteScreen

### Internal states

| State | Description |
|-------|-------------|
| `loading` | Fetching invite preview. Shows spinner. |
| `preview` | Shows list name, inviter name, and action button. |
| `accepting` | Accept API call in flight. Shows spinner. |
| `error` | Inline error message + "Ir al inicio →" link. |
| `done` | Accept succeeded. Navigates away. |

### Flow

**On mount:** call `GET /invites/:id` (public, no auth). Transition to `preview` or `error`.

**Authenticated user — "Unirse a la lista" button:**
1. Call `POST /invites/:id/accept`
2. On success → navigate to `/` with `{ state: { openListId } }`
3. `DashboardScreen` reads `location.state.openListId` on mount and opens that list

**Unauthenticated user — "Iniciar sesión para unirse" button:**
1. Set a `pendingAccept` ref to `true`
2. Call `signInWithPopup` (Google)
3. `onAuthStateChanged` fires with the new user; if `pendingAccept` is `true`, proceed
4. Auto-call `POST /invites/:id/accept`
5. On success → navigate to `/` with `{ state: { openListId } }`

### Error states

| Scenario | HTTP | Message |
|----------|------|---------|
| Invite not found | 404 | "Esta invitación no existe" |
| Invite expired | 410 | "Esta invitación ha expirado" |
| List full | 409 | "La lista ya está llena" |
| Wrong account (email-locked) | 403 | "Esta invitación es para otra cuenta" |
| Network error | — | "No se pudo conectar. Inténtalo de nuevo." + retry button |

Already-a-member (idempotent 200) is treated as success.

All error states include an "Ir al inicio →" link.

---

## API additions (`api.ts`)

```ts
getInvitePreview(inviteId: string): Promise<{ id: string; list_name: string; invited_by_name: string | null }>
// GET /invites/:id — no auth required

acceptInvite(getToken: GetToken, inviteId: string): Promise<{ list_id: string }>
// POST /invites/:id/accept — authenticated
```

---

## Backend changes

In `GET /invites/{invite_id}` and `POST /invites/{invite_id}/accept`:

- If `now - invite.created_at > 24h` → raise `HTTPException(status_code=410, detail="Invite expired")`

---

## Post-accept navigation

`acceptInvite` returns `{ list_id }`. `InviteScreen` calls:

```ts
navigate('/', { state: { openListId: list_id } })
```

`DashboardScreen` reads on mount:

```ts
const location = useLocation()
const openListId = location.state?.openListId
```

If `openListId` is set, open that list immediately (same as tapping a list card).

---

## Testing

### `InviteScreen.test.tsx` (11 cases)

- Shows spinner while loading
- Shows list name and inviter name in preview
- Shows "Unirse" button when signed in
- Shows "Iniciar sesión para unirse" button when not signed in
- Accepts invite and navigates on success (authenticated)
- Auto-accepts after sign-in (unauthenticated flow)
- Shows 404 error message
- Shows 410 error message
- Shows 409 error message
- Shows 403 error message
- Shows network error with retry button

### `backend/tests/test_invites.py` (2 new cases)

- `GET /invites/:id` returns 410 when `created_at` is >24h ago
- `POST /invites/:id/accept` returns 410 when `created_at` is >24h ago
