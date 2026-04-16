# Deduplicate Unpurchased Items — Design

**Date:** 2026-04-17

## Summary

Prevent adding an item that already exists in the unpurchased section of a list. When a duplicate is detected, block the add silently and show a brief "Ya está en la lista" toast. No further action is offered to the user.

## Scope

Frontend-only change. No backend modifications required.

## Duplicate Detection Rules

Two conditions trigger a block, checked against the current **unpurchased** items only:

1. **Name match** — `parsed.name.trim().toLowerCase()` equals `item.name.toLowerCase()` for any unpurchased item.
2. **EAN match** — `parsed.ean` is non-null and equals `item.ean` for any unpurchased item.

Items that are purchased (`item.purchased === true`) are excluded from the check. A name that already exists in the purchased section can be freely re-added.

## Implementation

### Location: `frontend/src/hooks/useListItems.ts` — `addItem`

Insert guard at the very top of `addItem`, before the optimistic insert:

```ts
const unpurchased = itemsRef.current.filter(i => !i.purchased)
const nameMatch = unpurchased.some(
  i => i.name.toLowerCase() === parsed.name.trim().toLowerCase()
)
const eanMatch = parsed.ean != null && unpurchased.some(i => i.ean === parsed.ean)
if (nameMatch || eanMatch) {
  showToast('Ya está en la lista')
  return
}
```

This catches all add paths automatically:
- Typed submit (`handleSubmit` in `ListScreen`)
- Barcode scan add (`handleScanAdd` in `ListScreen`)
- EAN-mode product add (`handleScanAdd` after EAN lookup)

### UI behaviour on block

- Toast shown via existing `showToast` callback (auto-dismisses after 3 s via `Toast` component)
- Input is **not** cleared — user can edit and retry
- `BarcodeScanSheet` stays open if the block came from a scan path
- No API call, no optimistic insert

## Testing

New tests cover the following cases (added to `ListScreen.test.tsx` or a `useListItems` test file):

| Scenario | Expected outcome |
|---|---|
| Add item with same name as unpurchased item (case-insensitive) | Toast "Ya está en la lista", item not added |
| Add item with same EAN as unpurchased item | Toast "Ya está en la lista", item not added |
| Add item with same name as a **purchased** item | Add succeeds normally |
| Add item with unique name and no EAN collision | Add succeeds normally |

## Out of Scope

- Fuzzy/accent-normalized name matching (future work)
- Backend-side uniqueness constraint
- Offering to navigate to or highlight the existing item
