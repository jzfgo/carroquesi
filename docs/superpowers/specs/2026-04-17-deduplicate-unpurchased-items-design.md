# Deduplicate Unpurchased Items — Design

**Date:** 2026-04-17

## Summary

Prevent adding an item that already exists in the unpurchased section of a list. When a duplicate is detected, block the add and show a brief "Ya está en la lista" toast. No further action is offered to the user.

## Scope

Frontend + backend. The frontend guard provides immediate feedback; the backend enforces the constraint authoritatively for concurrent multi-user adds.

## Duplicate Detection Rules

Two conditions trigger a block, checked against the current **unpurchased** items only:

1. **Name match** — incoming name (trimmed, lowercased) equals an existing unpurchased item's name (lowercased).
2. **EAN match** — incoming EAN is non-null and equals an existing unpurchased item's EAN.

Items that are purchased (`purchased_at IS NOT NULL`) are excluded. A name that already exists in the purchased section can be freely re-added.

## Implementation

### Backend — `backend/app/routers/items.py` `add_item`

Before creating the item, query for any existing unpurchased item in the same list matching by name (case-insensitive via `func.lower`) or by EAN. If found, raise `HTTP 409 Conflict` with detail `"Item already in list"`. No migration required — this is a query-time check, not a DB constraint.

### Frontend guard — `frontend/src/hooks/useListItems.ts` `addItem`

At the top of `addItem`, before the optimistic insert, filter `itemsRef.current` to unpurchased items and check for a name or EAN collision. If found, call `showToast('Ya está en la lista')` and return early — no API call, no optimistic insert.

This catches all add paths automatically: typed submit, barcode scan add, and EAN-mode product add.

### Frontend 409 handling — `frontend/src/hooks/useListItems.ts` `addItem`

In the existing `catch` block (which already rolls back the optimistic insert), distinguish a 409 `ApiError` from other errors. On 409, show `'Ya está en la lista'`; on anything else, show the existing `'No se pudo añadir el producto'`.

### UI behaviour on block

- Toast shown via existing `showToast` callback (auto-dismisses after 3 s via `Toast` component).
- Input is **not** cleared — user can edit and retry.
- `BarcodeScanSheet` stays open if the block came from a scan path.

## Testing

### Backend (`backend/tests/`)

| Scenario | Expected outcome |
|---|---|
| POST with same name (any case) as unpurchased item | 409 Conflict |
| POST with same EAN as unpurchased item | 409 Conflict |
| POST with same name as a **purchased** item | 201 Created |
| POST with unique name, no EAN collision | 201 Created |

### Frontend (`frontend/src/components/ListScreen.test.tsx`)

| Scenario | Expected outcome |
|---|---|
| Add item with same name as unpurchased item (case-insensitive) | Toast "Ya está en la lista", item not added |
| Add item with same EAN as unpurchased item | Toast "Ya está en la lista", item not added |
| Add item with same name as a **purchased** item | Add succeeds normally |
| Add item with unique name and no EAN collision | Add succeeds normally |
| API returns 409 (race condition — another user added first) | Optimistic insert rolled back, toast "Ya está en la lista" |

## Out of Scope

- Fuzzy/accent-normalized name matching (future work)
- Offering to navigate to or highlight the existing item
