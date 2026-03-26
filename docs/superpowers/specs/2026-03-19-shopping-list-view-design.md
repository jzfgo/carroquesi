# Shopping List View — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Mobile-first prototype of the main shopping list screen (Approach A: prototype-first with mock data, wire up API progressively)

---

## Overview

The shopping list view is the core screen of CarroQueSí. It shows all items in a shared list, allows members to mark items as purchased, and provides a smart input bar for adding new items with optional detail tags.

---

## Layout

Three vertical zones, fixed:

1. **Header** — list name + hamburger menu (≡)
2. **Progress bar** — 3px accent-coloured bar directly below the header border
3. **Scrollable item list** — fills remaining space between progress bar and input bar
4. **Smart Input bar** — sticky at the bottom

---

## Header

- **Left:** `< Lists` back-nav link in accent colour — navigates to the lists home screen
- **Centre:** List name (bold, 17px), truncated if necessary
- **Right:** Hamburger menu (≡) — opens a drawer with members, settings, invite link

---

## Progress bar

A thin 3px bar spanning the full width, immediately below the header border. It fills proportionally to `purchased / total` items, using `var(--accent)`. Hidden (zero width) when there are no items.

---

## Item List

### Loading, error, and empty states

| State | Display |
|-------|---------|
| Loading | Three placeholder skeleton rows (animated shimmer) while `GET /lists/{id}/items` is in flight |
| Error | A centred message "Couldn't load items" with a Retry button |
| Empty list | A centred illustration area with the text "No items yet — add the first one below" |

### Sections

Items are divided into two sections separated by a small uppercase label:

- **Active items** — label: `N items left`
- **Purchased items** — label: `Purchased` (hidden entirely when no items are purchased)

Purchased items are always appended below active items regardless of original insertion order.

### Item card

Each item row contains:

| Element | Detail |
|---------|--------|
| Circle checkbox | Unchecked: outline only. Checked: accent fill + white checkmark. Tapping toggles purchased state. |
| Name | 16px medium weight, `var(--text-h)` |
| Quantity badge | Accent colour pill (e.g. `2 unidades`, `1 bolsa`) — shown inline beside the name. Hidden when `quantity` is null. |
| Tag row | Small rounded tags below the name: ✨ variety, 🏷️ brand, 🏪 store — in that order. Tag row is omitted entirely if all three fields are null. |
| Added-by avatar | Coloured circle with member initial, right-aligned. See "Member avatar resolution" below. |

**Purchased state:** name gets `text-decoration: line-through`, colour shifts to `var(--purchased)` (`#b0adb5`), tags fade to 45% opacity.

### Member avatar resolution

`added_by` is a user UUID. On screen mount, fetch `GET /lists/{id}/members` once and build a `Map<uuid, { displayName, initial, colour }>` in local state. Derive the initial from the first character of `displayName`. Assign a deterministic colour per UUID (index into a fixed palette of 6 accent-safe colours). If a UUID is not found in the map (e.g. a removed member), show a generic grey avatar with `?`.

### CTA tags (empty fields)

When a field (variety, brand, or store) is not set, a **dashed-border CTA tag** appears in its place showing only `+ emoji` (e.g. `+ ✨`). Only missing fields show CTAs; present fields show the filled tag normally.

Tapping a CTA tag (or a filled tag) opens an **inline edit** for that specific field — see "Inline tag edit" under Interaction details.

---

## Store Filter

A horizontal scrollable chip row appears **above the item list** (below the progress bar) whenever at least one item has a non-null `store` value.

- Chips: "All" (always first, selected by default) + one chip per unique store value present in the current list (sorted alphabetically).
- Tapping a store chip filters the item list to show only items with that store value (both active and purchased sections are filtered).
- The "All" chip resets the filter and shows every item.
- Only one chip is active at a time.
- If all items with a given store are removed or their store is cleared, that chip disappears automatically and the filter resets to "All".
- The chip row is hidden entirely (no empty row) when no item has a store value.

---

## Item Actions

Each item card gains a **⋯ button** (right-aligned, alongside the member avatar). Tapping it opens an `ItemActionSheet` bottom sheet.

### `ItemActionSheet` — new

A bottom sheet managing three internal sub-states, mirroring the `ListActionSheet` pattern:

- **`'actions'`** — item name as header, "Renombrar" button, "Eliminar" button (red).
- **`'rename'`** — text input pre-filled with current item name + "Guardar" button (disabled when trimmed input is empty). "Cancelar" link returns to `'actions'`. Enter key triggers save.
- **`'confirm-delete'`** — warning text, red "Sí, eliminar" button, "Cancelar" button returning to `'actions'`.

**Dismiss rules (universal bottom sheet pattern):**
- Tapping outside the sheet (transparent overlay) closes it entirely from any sub-state.
- ESC key closes it entirely from any sub-state.
- "Cancelar" inside `'rename'` or `'confirm-delete'` navigates back to `'actions'` (not close).

**Props:**
```typescript
interface Props {
  item: ListItem
  onRename: (newName: string) => void
  onDelete: () => void
  onClose: () => void
}
```

**`handleItemRename(item, newName)` in `ListScreen`** — optimistic update:
1. Capture snapshot of `items`.
2. Apply new name to local state immediately.
3. Call `PATCH /lists/{listId}/items/{itemId}` with `{ name: newName }`.
4. On failure: revert to snapshot + toast "No se pudo renombrar el producto".

**`handleItemDelete(item)` in `ListScreen`** — non-optimistic:
1. Call `DELETE /lists/{listId}/items/{itemId}`.
2. On success: remove item from local state.
3. On failure: toast "No se pudo eliminar el producto".

### Backend changes required

`DELETE /lists/{listId}/items/{itemId}` — new endpoint. Auth: must be a list member. Returns 204 No Content. Bumps `lists.updated_at`.

`PATCH /lists/{listId}/items/{itemId}` already accepts `name` as an optional field — no backend changes needed for rename.

---

## Smart Input Bar

Sticky, fixed to the bottom. Vertical stack order from bottom to top:

1. Input row (always visible)
2. Syntax legend chips (always visible, above the input)
3. Live parse preview card (appears when at least one sigil is detected)
4. Context-aware suggestion dropdown (appears when there are suggestions to show)

---

### Syntax legend

A row of small chips:

```
+qty   *variety   #brand   @store
```

Shown persistently (not only on focus) so new users can learn without onboarding.

**Chips are tappable.** Tapping a chip appends the corresponding sigil to the current input value, but only if that sigil is not already present in the input. The cursor is placed after the appended sigil so the user can type the value immediately. If the sigil is already present, the tap is a no-op.

---

### Input field

Monospace font. The raw string is tokenised on each keystroke and each token span is wrapped in a coloured `<span>`:

| Token | Sigil | Colour |
|-------|-------|--------|
| Quantity | `+` prefix | Accent purple |
| Variety | `*` prefix | Amber `#d97706` |
| Brand | `#` prefix | Teal `#0891b2` |
| Store | `@` prefix | Green `#16a34a` |
| Name | Everything not matched by a sigil rule | `var(--text-h)` |

#### Tokenisation rules

The parser splits the raw string on whitespace into words, then scans left-to-right:

- A **token** begins when a word starts with one of the four sigil characters (`+`, `*`, `#`, `@`).
- A token **extends** across consecutive words until the next word that starts with a different sigil, or end of string. This allows multi-word values: `+1 bolsa`, `+6 litros de leche`, `@El Corte Inglés`.
- Words that do not start with a sigil character are accumulated as the **item name**, regardless of position. Name words may appear before, after, or interleaved with token words.
- A word that starts with a sigil character is **never** part of the name. If the user genuinely needs a name that begins with `+`, `*`, `#`, or `@`, they must prefix it with a space or retype without the sigil — this edge case is accepted as an unsupported input and produces an empty name with a visible parse error in the preview card.
- If the same sigil appears more than once, the **first occurrence wins**. All subsequent tokens for the same sigil are ignored.

**Example:** `Leche entera +3 *Desnatada #Puleva @Mer` parses as:
- name: `Leche entera`
- quantity: `3`
- variety: `Desnatada`
- brand: `Puleva`
- store: `Mer` (still being typed)

---

### Live parse preview

A card that appears above the syntax legend as soon as any sigil is detected in the input. Shows:
- Parsed item name (bold)
- Quantity badge (accent pill)
- Tag row: variety, brand, store tags using the same filled-tag style as the item list. A tag for a token that has not yet been followed by a space or a new sigil shows `typing…` in italic — **except** at submission time (Add button press or Enter), where all tokens are treated as complete regardless of trailing space.
- If the name is empty and input is non-empty, the preview shows a red "No item name" warning.

---

### Context-aware suggestion dropdown

Appears above the parse preview card (or above the syntax legend if no preview is shown). Displays up to 5 suggestions.

| Active context | Source |
|----------------|--------|
| No sigil typed | `GET /suggestions?q=...` — debounced 200ms, prefix match on purchase history |
| After `@` (store) | Client-side: unique store values from the already-fetched `items` list, filtered by the partial value typed so far. No extra API call. |
| After `#` (brand) | Client-side: unique brand values from fetched items, filtered by partial value. |
| After `*` (variety) | Client-side: unique variety values from fetched items, filtered by partial value. |

The top suggestion is highlighted in `var(--accent-bg)` with accent-coloured text. Tapping a suggestion completes the current token in the input.

---

### Add button

A square accent-coloured button (`+` icon) to the right of the input. Disabled (greyed) when `parsedInput.name` is empty. Submitting posts the item and clears the input.

---

## Data shapes (from existing API)

```ts
// List item as returned by GET /lists/{id}/items
interface ListItem {
  id: string
  list_id: string
  name: string
  quantity: string | null   // free-form, e.g. "2", "1 bolsa", "6 litros"
  brand: string | null
  variety: string | null
  store: string | null
  purchased: boolean
  added_by: string          // user UUID — resolved via member map
  created_at: string
  updated_at: string
}

// Derived from raw input string
interface ParsedInput {
  name: string              // empty string if no name tokens found
  quantity: string | null
  variety: string | null
  brand: string | null
  store: string | null
}
```

---

## State management (prototype phase)

Single `useState` holding a `ListItem[]` array with mock data. No routing needed for the first screen. State will be lifted to a custom hook (`useListItems`) when the API is wired up.

Key local state:
- `items: ListItem[]` — the full list
- `memberMap: Map<string, Member>` — UUID to display info, fetched once on mount
- `inputValue: string` — raw text in the Smart Input bar
- `suggestions: string[]` — fetched from backend (or derived client-side) as user types
- `parsedInput: ParsedInput` — derived synchronously from `inputValue`, never null (name may be empty string)
- `editingTag: { itemId: string; field: 'variety' | 'brand' | 'store' } | null` — tracks which inline tag edit is open. During the prototype phase (no polling), background re-fetches do not occur. When polling is added later, re-fetches must be suppressed while `editingTag !== null` to avoid clobbering an in-progress edit.

---

## Component tree (target)

```
<ListScreen>
  <ListHeader title onMenuOpen />
  <ProgressBar purchased={n} total={m} />
  <ItemList>                          // handles loading/error/empty states internally
    <SectionLabel />
    <ItemCard
      item
      members={memberMap}
      onTogglePurchased
      onTagClick(field)               // opens inline edit for that field
    />
    ...
  </ItemList>
  <SmartInputBar
    value
    parsed
    suggestions
    onChange
    onSubmit
  />
</ListScreen>
```

---

## Interaction details

| Action | Behaviour |
|--------|-----------|
| Tap checkbox | Optimistic toggle of `purchased`; item animates to Purchased section. On API error: snap back to previous state, show a brief toast "Could not update item". |
| Tap CTA tag | Opens inline edit for that field (see below) |
| Tap filled tag | Same inline edit, pre-filled with current value |
| Type in input | Synchronous parse of `inputValue`; debounced 200ms `GET /suggestions` call when no sigil active |
| Submit | `POST /lists/{id}/items`; optimistically prepend to active list; clear input. On error: remove optimistic item, show toast "Could not add item", restore input value. |
| Long-press item | (Future) Swipe-to-delete / edit full item sheet |

### Inline tag edit lifecycle

When a CTA or filled tag is tapped:
1. The tag renders as a small inline `<input>` pre-filled with the current value (empty for CTAs).
2. **Confirm:** Enter key or a small inline ✓ button — fires `PATCH /lists/{id}/items/{item_id}` with the updated field. Optimistic update applied immediately; on error, revert to previous value and show toast "Could not save".
3. **Cancel:** Escape key **or** blur (tap away) — dismisses the edit without saving, restores previous value. Blur always cancels, never saves, to prevent accidental commits when the user taps a different tag.
4. Only one tag edit can be open at a time; opening a second cancels the first via blur (no save triggered).

---

## Out of scope for this prototype

- Full item edit sheet (tap-and-hold / swipe actions)
- The lists home screen (`< Lists`)
- The hamburger menu drawer (members, settings, invite)
- Auth / sign-in screen
- Dark mode (tokens are ready; toggle not implemented yet)
- Real-time sync polling (will be added when API is wired up)
- Backend endpoints for brand/variety/store suggestions (prototype uses client-side filtering of already-fetched item data)
