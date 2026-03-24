# List Management Design

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Rename and delete lists from the dashboard

---

## Overview

Each list card on the dashboard gains a ⋯ button. Tapping it opens a bottom action sheet from which the user can rename the list or (if they are the list owner) delete it. Both actions are handled without leaving the dashboard.

---

## App Flow

```
DashboardScreen
  └── ListCard (⋯ button)
        └── (tap ⋯)
              └── ListActionSheet
                    ├── "Renombrar"
                    │     ├── Save / Enter → optimistic rename → PATCH /lists/{id} → sheet closes
                    │     └── Cancelar / ESC → sheet closes
                    └── "Eliminar lista"  (owner only)
                          └── confirmation step
                                ├── "Sí, eliminar" → DELETE /lists/{id} → card removed → sheet closes
                                └── Cancelar → sheet closes
```

---

## Components

### `ListActionSheet` — new

A bottom sheet fixed at the bottom of the screen (same visual layer as `TagEditSheet`). It manages three internal sub-states:

- **`'actions'`** — the default menu: list name as header, "Renombrar" button, and "Eliminar lista" button (owner only).
- **`'rename'`** — transitions from `'actions'` when "Renombrar" is tapped. Shows a text input pre-filled with the current list name, a "Guardar" button, and a "Cancelar" link. Enter key triggers save; ESC closes the sheet.
- **`'confirm-delete'`** — transitions from `'actions'` when "Eliminar lista" is tapped. Shows the list name, a warning ("Se eliminarán todos los productos. Esta acción no se puede deshacer."), a red "Sí, eliminar lista" button, and a "Cancelar" button.

The sub-state is internal to `ListActionSheet` — the parent only receives three callbacks:

```typescript
interface Props {
  list: ApiList
  isOwner: boolean
  onRename: (newName: string) => void
  onDelete: () => void
  onClose: () => void
}
```

ESC (global `keydown` listener, same pattern as `TagEditSheet`) closes the sheet from any sub-state.

No backdrop tap-to-close — tapping the list cards behind the sheet would trigger card navigation.

---

### `ListCard` — modified

Gains an `onMenuOpen: () => void` prop. A ⋯ button is added to the right side of the card. Tapping it calls `onMenuOpen` and stops event propagation so the card's `onClick` (navigate into list) is not also fired.

---

### `DashboardScreen` — modified

Adds `activeList: ApiList | null` state (initially `null`). When non-null, renders `ListActionSheet` for that list.

**`handleRename(list, newName)`** — optimistic update:
1. Update `lists` state with new name immediately.
2. Call `renameList(getToken, list.id, newName)`.
3. On failure: revert `lists` state to snapshot + show toast "No se pudo renombrar la lista".
4. On success or failure: clear `activeList`.

**`handleDelete(list)`** — non-optimistic:
1. Call `deleteList(getToken, list.id)`.
2. On success: remove list from `lists` state + clear `activeList`.
3. On failure: show toast "No se pudo eliminar la lista" + clear `activeList`.

`isOwner` is computed as `list.owner_id === user!.id` and passed to `ListActionSheet`.

---

## API (`frontend/src/lib/api.ts`)

Two new functions — no backend changes required, both endpoints already exist:

```typescript
renameList(getToken: () => Promise<string>, listId: string, name: string)
// PATCH /lists/{listId}  body: { name }

deleteList(getToken: () => Promise<string>, listId: string)
// DELETE /lists/{listId}  → 204 No Content
```

---

## Error Handling

| Action | Failure behaviour |
|--------|------------------|
| Rename | Revert optimistic name change · toast "No se pudo renombrar la lista" |
| Delete | No revert needed · toast "No se pudo eliminar la lista" |

The sheet closes in both success and failure cases.

---

## `ListActionSheet` Layout

`position: fixed; bottom: 0; left: 0; right: 0` — same layer as `TagEditSheet` and `SmartInputBar`. Uses matching background, border-top, and padding for visual consistency.

Structure (top to bottom):
1. Drag handle (decorative bar, centered)
2. List name — small, muted
3. **Actions sub-state:** "Renombrar" button · "Eliminar lista" button (red, owner only)
4. **Rename sub-state:** text input (pre-filled) + "Guardar" button · "Cancelar" link below
5. **Confirm-delete sub-state:** warning text · red "Sí, eliminar lista" button · "Cancelar" button

---

## Tests

### `ListCard.test.tsx` (additions)
- ⋯ button is present
- Tapping ⋯ calls `onMenuOpen`
- Tapping ⋯ does not call `onClick` (stops propagation)

### `ListActionSheet.test.tsx`
- Renders list name in header
- Shows "Renombrar" button
- Shows "Eliminar lista" when `isOwner` is true
- Hides "Eliminar lista" when `isOwner` is false
- Tapping "Renombrar" shows rename input pre-filled with list name
- Save calls `onRename` with trimmed value
- Empty input on save calls `onRename` with original name (no-op save)
- Enter key in rename input triggers save
- ESC calls `onClose` from actions sub-state
- ESC calls `onClose` from rename sub-state
- Tapping "Eliminar lista" shows confirmation sub-state with warning text
- "Sí, eliminar lista" calls `onDelete`
- "Cancelar" in confirmation calls `onClose`

### `api.test.ts` (additions)
- `renameList` sends `PATCH /lists/{id}` with correct body
- `deleteList` sends `DELETE /lists/{id}`

### `DashboardScreen.test.tsx` (additions)
- Tapping ⋯ on a card opens the action sheet for that list
- Confirming rename updates the list name in the dashboard
- Confirming delete removes the list card from the dashboard
- Delete option absent when user is not the list owner

---

## Out of Scope

- Transferring list ownership
- Leaving a list (non-owner member removal of self)
- Undo / soft delete
