# Delete a Logged Price Entry — Design Spec

**Date:** 2026-04-23
**Scope:** Narrow "oops" escape hatch — let a user delete a mistakenly-logged price on the current item, within the same calendar day.

---

## Context

Prices are stored as three nullable fields on `list_items` (`price`, `price_per`, `price_store`), not in a separate table. Each item has at most one price. The "price history" shown in `PriceHistorySheet` is assembled by querying all items with the same name/EAN across lists — so there is no `price_id`.

Deletion is intentionally limited to:
- The **current item only** (the item the sheet was opened for)
- The **same calendar day** it was purchased (or any time if not yet purchased), mirroring the existing unpurchase guard in `items.py`

---

## Backend

### New endpoint

`DELETE /lists/{list_id}/items/{item_id}/prices`

- Auth: list membership required (`MemberDep`)
- **404** if item not found in the list
- **404** if `item.price is None` (nothing to delete — treated as success by the frontend)
- **409** if `item.purchased_at` is set and `item.purchased_at.date() != today` — mirrors the unpurchase guard in `items.py:85`
- **204** on success: nulls out `price`, `price_per`, `price_store`; bumps `list.updated_at` via `_bump()`
- No new schema needed

### Tests (in existing prices test file)

1. Success — 204, price fields are null after deletion
2. Same-day guard — 409 when `purchased_at` is a previous day
3. 404 when item has no price
4. 404 when item not in the list

---

## Frontend

### `api.ts`

Add `deletePrice(getToken, listId, itemId)` — `DELETE` to `/lists/{list_id}/items/{item_id}/prices`, expects 204.

### `isSameCalendarDay` helper

Small pure function in `LogPriceSheet` (or extracted to `lib/`):

```ts
function isSameCalendarDay(purchased_at: string | null): boolean {
  if (!purchased_at) return true
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  return purchased_at.slice(0, 10) === today
}
```

`purchased_at` is stored as UTC naive. Comparing date prefixes in UTC matches the existing pattern at `ListScreen:315`.

### `LogPriceSheet` changes

- Add `onDelete?: () => void` prop
- Add local `deleting: boolean` state
- Show "Eliminar precio" button when `item.price != null && isSameCalendarDay(item.purchased_at)`
- On click: set `deleting = true`, call `deletePrice`, call `onDelete()` on success, show error toast on failure, reset `deleting` on completion
- Button is disabled while `deleting` is true

### `ListScreen` changes

- Add `deletePrice` import to `api.ts` imports
- Add `handleDeletePrice` callback (called from `LogPriceSheet` via `onDelete`): patches the item in local `items` array to set `price`, `price_per`, `price_store` to `null`, closes the sheet
- Wire `onDelete={handleDeletePrice}` on the `LogPriceSheet` instance

### Error handling

| Error | Behaviour |
|-------|-----------|
| 409 (same-day guard violated) | Toast: "No se puede eliminar el precio de un artículo comprado en otro día" |
| 404 (no price) | Treat as success — close sheet, clear price in local state |
| Network / other | Surface via existing `ApiError` toast pattern |

### Frontend tests

- `isSameCalendarDay`: same day → true; prior day → false; null → true
- `LogPriceSheet` render: delete button visible when `price != null` + same-day; hidden when price is null; hidden when purchased on a prior day

---

## Out of scope

- Deleting price entries from historical items (other items with the same name/EAN shown in "Mis listas" / "Todos" scopes)
- Per-record delete buttons in `PriceHistorySheet`
- Any 24h rolling window (guard is calendar-day, not 24h)
