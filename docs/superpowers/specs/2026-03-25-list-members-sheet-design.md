# List Members Sheet — Design Spec

## Goal

Wire the hamburger menu button in `ListHeader` to a bottom sheet that shows the list's members and lets the current user copy a shareable invite link. Owners can also remove members.

## Scope

**In scope:**
- `ListMembersSheet` component (frontend)
- New `POST /lists/{id}/invites` backend endpoint (open/email-less invite)
- Wiring in `ListScreen` (adds `listOwnerId` prop, `menuOpen` state)

**Out of scope:**
- Invite accept UI (`/invite/:id` route) — separate feature
- Email notifications — no transactional email infrastructure yet
- Focus trapping — deferred, consistent with existing sheets (`TagEditSheet`, `ListActionSheet`)

---

## Architecture

### Frontend

One new component: `ListMembersSheet`. It is self-contained — fetches its own data, manages optimistic remove, triggers invite creation, and calls `onClose` when done.

`ListScreen` receives a new `listOwnerId: string` prop (`ApiList.owner_id`, from `DashboardScreen` which already holds the full `ApiList`). `ListScreen` already calls `useAuth()` — the destructuring needs to add `user` alongside the existing `getToken`:

```ts
// Before:
const { getToken } = useAuth()
// After:
const { getToken, user } = useAuth()
```

`currentUserId = user!.id`. `isOwner = listOwnerId === currentUserId`. Both are passed as props to `ListMembersSheet`.

`ListScreen` adds a `menuOpen: boolean` state. When true, `ListMembersSheet` is rendered overlaid. `TagEditSheet` and `ListMembersSheet` are controlled by separate state booleans and cannot be open simultaneously — no mutual exclusion guard is needed.

`SmartInputBar` currently renders when `!editingTag`. This condition gains `&& !menuOpen` (additive change to the existing condition):

```tsx
ListScreen
  ├── ListHeader  (onMenuOpen → setMenuOpen(true))
  ├── ProgressBar
  ├── ItemList
  ├── menuOpen && <ListMembersSheet ... />
  ├── !editingTag && !menuOpen && <SmartInputBar ... />   // !menuOpen added
  └── toast && <Toast ... />
```

### Backend

New endpoint added to `backend/app/routers/invites.py` as a **second `APIRouter`** in the same file. This keeps all invite-related code in one file:

```python
# invites.py — existing router
router = APIRouter(prefix="/invites", tags=["invites"])

# NEW second router in same file
list_invites_router = APIRouter(prefix="/lists/{list_id}/invites", tags=["invites"])
```

Both routers are registered in `main.py`. The new router produces the URL path `POST /lists/{list_id}/invites`.

---

## Component: `ListMembersSheet`

**File:** `frontend/src/components/ListMembersSheet.tsx`
**CSS:** `frontend/src/components/ListMembersSheet.css`

### Props

```ts
interface Props {
  listId: string
  currentUserId: string   // user!.id from useAuth() in ListScreen
  isOwner: boolean        // listOwnerId === currentUserId, computed in ListScreen
  onClose: () => void
}
```

### Accessibility

- Sheet root: `role="dialog" aria-modal="true" aria-label="Miembros"`
- "Expulsar" buttons: `aria-label={\`Expulsar a ${member.displayName}\`}`
- "Salir" button: `aria-label="Salir de la lista"`
- Focus management: not implemented (deferred, consistent with existing sheets)

### Layout (flat sheet)

```
[ drag handle ]
MIEMBROS · N

[ avatar ] Javi 👑
[ avatar ] María          [ Expulsar ]   ← shown when viewer is owner, not on own row
[ avatar ] Ana             [ Salir ]     ← shown on current user's own row (non-owners only)

─────────────────────────────
[ 🔗 Copiar enlace de invitación ]
```

- Owner row: no action button (owners cannot leave)
- Other member rows (when viewer is owner): "Expulsar" button
- Current user's own row (when viewer is not owner): "Salir" button
- Row identity: compare `BackendMember.user_id` with `currentUserId`

### Loading state

While `GET /lists/{listId}/members` is in-flight, show a simple spinner inside the sheet body.

### Data flow

1. **Mount:** `GET /lists/{listId}/members` → populate member list; show spinner until resolved
2. **Remove (Expulsar / Salir):** Optimistic remove from local state → `DELETE /lists/{listId}/members/{userId}` → revert on failure + toast. Backend enforces that only the owner or the member themselves can remove; the frontend only shows the button in those cases.
3. **Invite:** `POST /lists/{listId}/invites` → get `{ id }` → construct `{window.location.origin}/invite/{id}` → `navigator.clipboard.writeText(url)` → toast "Enlace copiado"

### Error states

| Scenario | Behavior |
|---|---|
| Members fetch fails | Inline error message + retry button inside sheet |
| Remove fails | Revert optimistic update + toast "No se pudo eliminar el miembro" |
| Clipboard API unavailable | Show URL in a selectable `<input>` for manual copy |
| Owner tries to leave | Button not rendered; backend also rejects it |

### Multiple open invites

Each tap of "Copiar enlace de invitación" creates a new `ListInvite` row. Previously shared links remain valid until used (accept deletes the invite). Multiple concurrent open invites per list are acceptable for MVP.

### Dismiss

ESC key: `document.addEventListener('keydown', ...)` → `onClose()` (same pattern as `TagEditSheet`).

---

## Backend endpoint

**File:** `backend/app/routers/invites.py` — new `list_invites_router` added in the same file

```
POST /lists/{list_id}/invites
Authorization: Bearer <token>
```

- Uses `require_member` dependency (any list member can create an invite)
- Creates `ListInvite(list_id=list_id, invited_by=current_user.id, invited_email=None)`
- Response: `{ "id": "<uuid>" }` (201 Created)

Register `list_invites_router` in `main.py` alongside `router` from `invites.py`.

### Tests

`backend/tests/test_invites.py` — net-new test cases for the new endpoint:
- List member creates open invite → 201 with `id`; `invited_email` is null in DB
- Non-member cannot create invite → 403

(Existing tests cover link invite acceptance and rejection; these new tests specifically cover the creation endpoint.)

---

## Testing (frontend)

**File:** `frontend/src/components/ListMembersSheet.test.tsx`

| Test | Description |
|---|---|
| Shows spinner on load | Spinner visible while fetch is in-flight |
| Members fetch fails | Inline error + retry button shown when GET fails |
| Renders member list | Members shown after fetch resolves |
| Owner is sole member | Sheet renders owner row only; no Expulsar buttons |
| Owner row has no action | Owner's row has no button when other members present |
| Owner sees Expulsar on others | Other member rows show "Expulsar" when viewer is owner |
| Non-owner sees Salir on own row | Current user's row shows "Salir" when viewer is not owner |
| Non-owner does not see Expulsar | Other members' rows have no button for non-owner viewer |
| Owner removes member (Expulsar) | DELETE called with correct userId; member removed optimistically |
| Non-owner leaves (Salir) | DELETE called with currentUserId; member removed from list |
| Remove failure reverts | Member reappears + toast shown |
| Copy invite success | POST called; clipboard.writeText called with correct URL; toast shown |
| Clipboard fallback | URL input shown when clipboard API unavailable |
| ESC closes | onClose called on Escape key |
