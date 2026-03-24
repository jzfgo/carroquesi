# Tag Editing Design

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Inline editing of variety, brand, store, and quantity on list items via a bottom sheet

---

## Overview

Each item card shows tag buttons for `variety`, `brand`, `store`, and a quantity badge. Tapping any of these opens a **bottom sheet editor** that replaces the SmartInputBar. The user can update or remove the field value. Dismissing the sheet (save, ESC, or Remove) returns to the normal SmartInputBar.

---

## App Flow

```
ListScreen
  └── ItemCard (variety / brand / store tags + quantity badge — all tappable)
        └── (tap tag)
              └── TagEditSheet (bottom sheet, replaces SmartInputBar)
                    ├── Save / Enter  → optimistic update → PATCH API → back to SmartInputBar
                    ├── Remove        → set field to null → PATCH API → back to SmartInputBar
                    └── ESC            → cancel → back to SmartInputBar
```

---

## Components

### `TagEditSheet` — new

Fixed at the bottom of the screen, visually replacing the SmartInputBar while a tag is being edited.

**Contents:**
- **Header:** field emoji + label ("🏷️ Brand"), item name for context ("Leche entera")
- **Text input:** pre-filled with the current field value, or empty if the field is null
- **Inline suggestions:** filtered client-side from existing item values as the user types. Uses a shared utility extracted to `frontend/src/lib/suggestions.ts` (also used by `SmartInputBar`). The function signature keeps `field: 'variety' | 'brand' | 'store'` (not `TagField`). `TagEditSheet` must guard the call with a type narrowing check:
  ```typescript
  const suggestions = field !== 'quantity'
    ? clientSideSuggestions(items, field, inputValue)
    : []
  ```
  Suggestions are not shown for `quantity`
- **Save button** (also triggered by Enter key)
- **Remove button** — only shown when the field currently has a value. Sets the field to `null`
- **ESC key** — cancels without saving. No "tap outside" to close — tapping the list behind the sheet would trigger item interactions. ESC and the explicit buttons are the only dismiss paths

**Save behavior:**
- Non-empty value → PATCH item with new value
- Empty input on save → same as Remove (sets field to `null`)

**Props:**
```typescript
interface Props {
  item: ListItem
  field: TagField
  items: ListItem[]      // for client-side suggestions
  onSave: (value: string | null) => void
  onClose: () => void
}
```

---

### `ItemCard` — modified

The quantity display (`.item-card__qty`) becomes a `<button>` that fires `onTagClick(item.id, 'quantity')`. When `quantity` is `null`, a CTA button is shown in the name row (matching the `+ emoji` CTA pattern used for variety/brand/store when null), so the user can add a quantity via tap even if none exists yet.

`TAG_CONFIG` (which drives variety/brand/store tags) does not include `'quantity'` and does not need to — quantity is handled separately in the name row. The `TAG_CONFIG` array type (`{ field: TagField; ... }[]`) compiles fine after `TagField` gains `'quantity'`; no exclusion type is needed.

---

### `ListScreen` — modified

Adds `editingTag: EditingTag | null` state (initially `null`).

`handleTagClick(itemId, field)` sets `editingTag`. When the sheet calls `onSave`, `updateTag` is called on `useListItems` and `editingTag` is cleared immediately (synchronously). The `onSave` closure captures `editingTag` at call time — correct. If `updateTag` fails, a toast is shown but the sheet is **not** re-opened; the item reverts silently and the user may retry by tapping the tag again. When `onClose` is called, `editingTag` is cleared without saving.

`SmartInputBar` is **unmounted** (not hidden) when `editingTag` is non-null. `TagEditSheet` and `SmartInputBar` are never in the DOM at the same time. `updateTag` is destructured from `useListItems` alongside the existing fields:

```tsx
const { status, items, members, togglePurchased, addItem, updateTag, retry } =
  useListItems(listId, getToken, setToast)
```

```tsx
{editingTag ? (
  <TagEditSheet
    item={items.find(i => i.id === editingTag.itemId)!}
    field={editingTag.field}
    items={items}
    onSave={(value) => { void updateTag(editingTag.itemId, editingTag.field, value); setEditingTag(null) }}
    onClose={() => setEditingTag(null)}
  />
) : (
  <SmartInputBar ... />
)}
```

---

## Types

`TagField` in `frontend/src/types.ts` gains `'quantity'`:

```typescript
export type TagField = 'variety' | 'brand' | 'store' | 'quantity'
```

`EditingTag` is already defined and requires no changes:

```typescript
export interface EditingTag {
  itemId: string
  field: TagField
}
```

---

## State & Data Flow

### `useListItems` — new `updateTag` method

```typescript
updateTag(itemId: string, field: TagField, value: string | null): Promise<void>
```

**Optimistic update pattern** (same as `togglePurchased`):
1. Snapshot `itemsRef.current`
2. Apply change to local state immediately
3. Send `PATCH /lists/{listId}/items/{itemId}` with `{ [field]: value }`
4. On failure: revert to snapshot + show toast ("Couldn't update item")

**Known limitation:** the 5-second poll may call `setItems` with server data while a `PATCH` is in flight, silently overwriting the optimistic update. This is the same race that exists in `togglePurchased` and is acceptable for MVP.

---

## Backend

No backend changes required. `PATCH /lists/{listId}/items/{itemId}` already accepts all tag fields (`variety`, `brand`, `store`, `quantity`) as optional nullable fields.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/types.ts` | Add `'quantity'` to `TagField` |
| `frontend/src/lib/suggestions.ts` | New — extract `clientSideSuggestions` from `SmartInputBar` |
| `frontend/src/components/SmartInputBar.tsx` | Import `clientSideSuggestions` from `lib/suggestions` |
| `frontend/src/components/ItemCard.tsx` | Quantity span → tappable button; add quantity CTA when null |
| `frontend/src/components/ItemCard.test.tsx` | Add tests for quantity button and quantity CTA |
| `frontend/src/components/TagEditSheet.tsx` | New component |
| `frontend/src/components/TagEditSheet.css` | New styles — see layout notes below |
| `frontend/src/components/TagEditSheet.test.tsx` | New tests |
| `frontend/src/components/ListScreen.tsx` | Add `editingTag` state, wire `handleTagClick`, render `TagEditSheet`; destructure `updateTag` from `useListItems` |
| `frontend/src/hooks/useListItems.ts` | Add `updateTag` with optimistic update; export in return value |
| `frontend/src/hooks/useListItems.test.tsx` | Add `updateTag` tests |

---

## `TagEditSheet` Layout

`TagEditSheet` is `position: fixed; bottom: 0; left: 0; right: 0` — same layer as `SmartInputBar`. It uses the same background, border-top, and padding as `SmartInputBar` so it feels like the same slot. No slide animation required for MVP. No backdrop/overlay — the list remains fully visible and scrollable behind it.

The sheet structure (top to bottom):
1. Header row: `{emoji} {fieldLabel}  ·  {item.name}` (small, muted)
2. Input row: text input + Save button
3. Suggestions row: up to 5 suggestion chips (hidden when `field === 'quantity'` or no suggestions)
4. Remove link: `Remove {fieldLabel}` in red (hidden when current value is null)

---

## Tests

### `TagEditSheet.test.tsx`
- Renders with current field value pre-filled
- Shows "Remove" button only when field has a value; hides it when value is null
- Save button calls `onSave` with trimmed input value
- Clearing input and saving calls `onSave(null)`
- Enter key triggers save
- ESC key calls `onClose`
- Remove button calls `onSave(null)`
- Shows suggestions filtered from items (variety/brand/store only)
- Clicking a suggestion fills the input

### `useListItems.test.tsx` (additions)
- `updateTag` optimistically updates item in state
- `updateTag` reverts and shows toast on API failure

---

## Out of Scope

- Editing item name or quantity unit (only tag fields + numeric quantity)
- Multi-item bulk editing
- Undo/redo
