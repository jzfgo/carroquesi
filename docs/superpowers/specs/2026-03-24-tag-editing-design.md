# Tag Editing Design

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Inline editing of variety, brand, store, and quantity on list items via a bottom sheet

---

## Overview

Each item card shows tag buttons for `variety`, `brand`, `store`, and a quantity badge. Tapping any of these opens a **bottom sheet editor** that replaces the SmartInputBar. The user can update or remove the field value. Dismissing the sheet (save, ESC, tap outside) returns to the normal SmartInputBar.

---

## App Flow

```
ListScreen
  └── ItemCard (variety / brand / store tags + quantity badge — all tappable)
        └── (tap tag)
              └── TagEditSheet (bottom sheet, replaces SmartInputBar)
                    ├── Save / Enter  → optimistic update → PATCH API → back to SmartInputBar
                    ├── Remove        → set field to null → PATCH API → back to SmartInputBar
                    └── ESC / outside → cancel → back to SmartInputBar
```

---

## Components

### `TagEditSheet` — new

Fixed at the bottom of the screen, visually replacing the SmartInputBar while a tag is being edited.

**Contents:**
- **Header:** field emoji + label ("🏷️ Brand"), item name for context ("Leche entera")
- **Text input:** pre-filled with the current field value, or empty if the field is null
- **Inline suggestions:** filtered client-side from existing item values as the user types. Same logic as SmartInputBar's client-side suggestions (`clientSideSuggestions`). Suggestions are not shown for `quantity`
- **Save button** (also triggered by Enter key)
- **Remove button** — only shown when the field currently has a value. Sets the field to `null`
- **ESC key / tap outside** — cancels without saving

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

The quantity display (`.item-card__qty`) becomes a `<button>` that fires `onTagClick(item.id, 'quantity')`. No other changes.

---

### `ListScreen` — modified

Adds `editingTag: EditingTag | null` state (initially `null`).

`handleTagClick(itemId, field)` sets `editingTag`. When the sheet calls `onSave`, `updateTag` is called on `useListItems` and `editingTag` is cleared. When `onClose` is called, `editingTag` is cleared without saving.

`TagEditSheet` is rendered instead of `SmartInputBar` when `editingTag` is non-null:

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
1. Snapshot current items
2. Apply change to local state immediately
3. Send `PATCH /lists/{listId}/items/{itemId}` with `{ [field]: value }`
4. On failure: revert to snapshot + show toast ("Couldn't update item")

---

## Backend

No backend changes required. `PATCH /lists/{listId}/items/{itemId}` already accepts all tag fields (`variety`, `brand`, `store`, `quantity`) as optional nullable fields.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/types.ts` | Add `'quantity'` to `TagField` |
| `frontend/src/components/ItemCard.tsx` | Quantity span → tappable button |
| `frontend/src/components/TagEditSheet.tsx` | New component |
| `frontend/src/components/TagEditSheet.css` | New styles |
| `frontend/src/components/TagEditSheet.test.tsx` | New tests |
| `frontend/src/components/ListScreen.tsx` | Add `editingTag` state, wire `handleTagClick`, render `TagEditSheet` |
| `frontend/src/hooks/useListItems.ts` | Add `updateTag` with optimistic update |
| `frontend/src/hooks/useListItems.test.tsx` | Add `updateTag` tests |

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
