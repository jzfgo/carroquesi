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
              └── ListActionSheet  [sub-state: 'actions']
                    ├── "Renombrar"
                    │     └── [sub-state: 'rename']
                    │           ├── Save / Enter → optimistic rename → PATCH /lists/{id} → sheet closes
                    │           └── Cancelar → [back to sub-state: 'actions']
                    └── "Eliminar lista"  (owner only)
                          └── [sub-state: 'confirm-delete']
                                ├── "Sí, eliminar" → DELETE /lists/{id} → card removed → sheet closes
                                └── Cancelar → [back to sub-state: 'actions']

ESC (any sub-state) → sheet closes entirely
```

---

## Components

### `ListActionSheet` — new

A bottom sheet fixed at the bottom of the screen (same visual layer as `TagEditSheet`). It manages three internal sub-states:

- **`'actions'`** — the default menu: list name as header, "Renombrar" button, and "Eliminar lista" button (owner only, styled red).
- **`'rename'`** — transitions from `'actions'` when "Renombrar" is tapped. Shows a text input pre-filled with the current list name and a "Guardar" button. The Save button is **disabled when the trimmed input is empty** — no API call is made if the user clears the field. Below the input row: a "Cancelar" link that returns to `'actions'` sub-state (back-navigation within the sheet). Enter key triggers save (only when input is non-empty).
- **`'confirm-delete'`** — transitions from `'actions'` when "Eliminar lista" is tapped. Shows the list name, a warning ("Se eliminarán todos los productos. Esta acción no se puede deshacer."), a red "Sí, eliminar lista" button, and a "Cancelar" button that returns to `'actions'` sub-state.

**Dismiss rules:**
- ESC (global `keydown` listener) closes the sheet entirely from any sub-state, calling `onClose`.
- Tapping outside the sheet (transparent full-screen overlay beneath the sheet) closes it entirely from any sub-state, calling `onClose`.
- "Cancelar" in `'rename'` and `'confirm-delete'` goes back to `'actions'` — it does not call `onClose`.

**Props:**

```typescript
interface Props {
  list: ApiList
  isOwner: boolean
  onRename: (newName: string) => void
  onDelete: () => void
  onClose: () => void
}
```

---

### `ListCard` — modified

The outer `<button>` element is **changed to a `<div>`** to avoid invalid nested interactive content. Navigation into the list is handled by an explicit `<button className="list-card__tap-target">` that wraps the card content (name, progress bar, subtitle). The ⋯ button sits alongside it, calls `onMenuOpen`, and stops event propagation.

```typescript
interface Props {
  list: ApiList
  onClick: () => void
  onMenuOpen: () => void
}
```

---

### `DashboardScreen` — modified

Adds `activeList: ApiList | null` state (initially `null`) for which list's action sheet is open.

**State interaction:** Setting `selectedList` (navigate into a list) must also clear `activeList`, and vice versa — both cannot be non-null simultaneously.

When `activeList` is non-null, renders `ListActionSheet` for that list. `isOwner` is computed as `list.owner_id === user!.id`.

**`handleRename(list, newName)`** — optimistic update:
1. Capture `const snapshot = lists` before mutating state.
2. Update `lists` state with new name immediately.
3. Call `renameList(getToken, list.id, newName)`.
4. On failure: revert to `snapshot` + show toast "No se pudo renombrar la lista".
5. Clear `activeList` on success or failure.

**`handleDelete(list)`** — non-optimistic:
1. Call `deleteList(getToken, list.id)`.
2. On success: remove list from `lists` state + clear `activeList`.
3. On failure: show toast "No se pudo eliminar la lista" + clear `activeList`.

---

## API (`frontend/src/lib/api.ts`)

Two new functions — no backend changes required:

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

The sheet closes (`activeList` cleared) in both success and failure cases.

---

## `ListActionSheet` Layout

`position: fixed; bottom: 0; left: 0; right: 0` — same layer as `TagEditSheet`. Matching background, border-top, and padding for visual consistency.

Structure (top to bottom):
1. Drag handle (decorative bar, centered)
2. List name — small, muted
3. **Actions sub-state:** "Renombrar" button · "Eliminar lista" button (red, owner only)
4. **Rename sub-state:** text input (pre-filled) + "Guardar" button (disabled when empty) · "Cancelar" link below
5. **Confirm-delete sub-state:** warning text · red "Sí, eliminar lista" button · "Cancelar" button

---

## Tests

### `ListCard.test.tsx` (modifications + additions)

The existing "calls onClick when clicked" test uses `screen.getByRole('button')` — after this change the card contains two buttons (tap-target + ⋯), making the query ambiguous. Update it to use `getByRole('button', { name: /mercado semanal/i })` (the tap-target button wraps the list name and inherits its accessible name).

Also add `onMenuOpen` to all existing `render` calls since the prop is now required.

New test cases:
- ⋯ button is present
- Tapping ⋯ calls `onMenuOpen`
- Tapping ⋯ does not call `onClick` (stops propagation)

### `ListActionSheet.test.tsx`
- Renders list name in header
- Shows "Renombrar" button
- Shows "Eliminar lista" when `isOwner` is true
- Hides "Eliminar lista" when `isOwner` is false
- Tapping "Renombrar" transitions to rename sub-state with input pre-filled with list name
- Guardar button is disabled when input is empty
- Save calls `onRename` with trimmed value when input is non-empty
- Enter key triggers save when input is non-empty
- "Cancelar" in rename sub-state returns to `'actions'` sub-state (does not call `onClose`)
- ESC calls `onClose` from `'actions'` sub-state
- ESC calls `onClose` from `'rename'` sub-state
- Tapping the overlay calls `onClose` from `'actions'` sub-state
- Tapping "Eliminar lista" transitions to confirmation sub-state with warning text
- "Sí, eliminar lista" calls `onDelete`
- "Cancelar" in confirmation sub-state returns to `'actions'` sub-state (does not call `onClose`)

### `api.test.ts` (additions)
- `renameList` sends `PATCH /lists/{id}` with correct body
- `deleteList` sends `DELETE /lists/{id}`

### `DashboardScreen.test.tsx` (additions)

The existing `vi.mock('../lib/api')` already auto-mocks all API functions. Add `renameList` and `deleteList` to the `beforeEach` mock setup:
```typescript
vi.mocked(api.renameList).mockResolvedValue({} as never)
vi.mocked(api.deleteList).mockResolvedValue(null as never)
```

The existing `ListScreen` mock in `DashboardScreen.test.tsx` is unaffected. `ListActionSheet` is **not** separately mocked — it renders in full so dashboard tests can assert on its visible content.

Test cases:
- Tapping ⋯ on a card opens the action sheet for that list
- Confirming rename updates the list name in the dashboard
- Rename failure reverts the name and shows a toast
- Confirming delete removes the list card from the dashboard
- Delete failure shows a toast and the list card remains
- Delete option absent when user is not the list owner

---

## Out of Scope

- Transferring list ownership
- Leaving a list (non-owner member removal of self)
- Undo / soft delete
