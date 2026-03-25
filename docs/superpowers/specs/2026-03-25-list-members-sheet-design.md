# List Members Sheet — Design Spec

## Goal

Wire the hamburger menu button in `ListHeader` to a bottom sheet that shows the list's members and lets the current user copy a shareable invite link. Owners can also remove members.

## Scope

**In scope:**
- `ListMembersSheet` component (frontend)
- New `POST /lists/{id}/invites` backend endpoint (open/email-less invite)
- Wiring in `ListScreen`

**Out of scope:**
- Invite accept UI (`/invite/:id` route) — separate feature
- Email notifications — no transactional email infrastructure yet

---

## Architecture

### Frontend

One new component: `ListMembersSheet`. It is self-contained — fetches its own data, manages optimistic remove, triggers invite creation, and calls `onClose` when done.

`ListScreen` adds a `menuOpen: boolean` state. When true, `ListMembersSheet` is rendered overlaid (same pattern as `editingTag` / `TagEditSheet`).

```
ListScreen
  ├── ListHeader  (onMenuOpen → setMenuOpen(true))
  ├── ProgressBar
  ├── ItemList
  ├── menuOpen && <ListMembersSheet ... />
  ├── !editingTag && !menuOpen && <SmartInputBar ... />
  └── toast && <Toast ... />
```

### Backend

New endpoint added to `backend/app/routers/invites.py`:

```
POST /lists/{list_id}/invites
```

- Requires list membership (uses `require_member` dependency)
- Creates a `ListInvite` with `invited_email = null`
- Returns `{ "id": "<uuid>" }`

No changes to existing endpoints.

---

## Component: `ListMembersSheet`

**File:** `frontend/src/components/ListMembersSheet.tsx`
**CSS:** `frontend/src/components/ListMembersSheet.css`

### Props

```ts
interface Props {
  listId: string
  currentUserId: string
  isOwner: boolean
  onClose: () => void
}
```

`currentUserId` and `isOwner` are derived in `ListScreen` from `useAuth()` and the members response, then passed down.

### Layout (flat sheet — Option A)

```
[ drag handle ]
MIEMBROS · N

[ avatar ] Javi 👑
[ avatar ] María          [ Expulsar ]   ← owner sees this
[ avatar ] Ana             [ Salir ]     ← current user's own row

─────────────────────────────
[ 🔗 Copiar enlace de invitación ]
```

- Owner row: no action button
- Other member rows (when viewer is owner): "Expulsar" button
- Current user's own row (when viewer is not owner): "Salir" button
- Owner cannot leave (button not shown; backend also rejects it)

### Data flow

1. **Mount:** `GET /lists/{listId}/members` → populate member list
2. **Remove:** Optimistic remove from local state → `DELETE /lists/{listId}/members/{userId}` → revert on failure + toast
3. **Invite:** `POST /lists/{listId}/invites` → get `{ id }` → construct `{window.location.origin}/invite/{id}` → `navigator.clipboard.writeText(url)` → toast "Enlace copiado"

### Error states

| Scenario | Behavior |
|---|---|
| Members fetch fails | Inline error + retry button inside sheet |
| Remove fails | Revert optimistic update + toast "No se pudo eliminar el miembro" |
| Clipboard API unavailable | Show URL in a selectable `<input>` for manual copy |
| Owner tries to leave | Button not rendered (owner row has no action) |

### Dismiss

- ESC key: `document.addEventListener('keydown', ...)` → `onClose()` (same pattern as `TagEditSheet`)
- No backdrop click needed (consistent with existing sheets)

---

## Backend endpoint

**File:** `backend/app/routers/invites.py`

```
POST /lists/{list_id}/invites
Authorization: Bearer <token>
```

- Dependency: `require_member` (any list member can create an invite)
- Creates `ListInvite(list_id=list_id, invited_by=current_user.id, invited_email=None)`
- Response: `{ "id": "<uuid>" }` (201 Created)

### Test

`backend/tests/test_invites.py` — new test:
- Member can create open invite → returns 201 with `id`
- Non-member cannot create invite → 403
- `invited_email` is null in DB

---

## Testing (frontend)

**File:** `frontend/src/components/ListMembersSheet.test.tsx`

| Test | Description |
|---|---|
| Renders member list | Members shown after fetch resolves |
| Owner row has no action | Crown owner row has no button |
| Owner sees Expulsar | Other member rows show "Expulsar" when viewer is owner |
| Non-owner sees Salir | Own row shows "Salir" when viewer is not owner |
| Remove optimistic | Member removed immediately; DELETE called |
| Remove failure reverts | Member reappears + toast shown |
| Copy invite success | POST called; clipboard.writeText called; toast shown |
| Clipboard fallback | URL input shown when clipboard API unavailable |
| ESC closes | onClose called on Escape key |
