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
2. **Scrollable item list** — fills remaining space between header and input bar
3. **Smart Input bar** — sticky at the bottom

A thin **progress bar** (3px, accent colour) sits under the header border, filling proportionally to items purchased.

---

## Header

- **Left:** `< Lists` back-nav link in accent colour — navigates to the lists home screen
- **Centre:** List name (bold, 17px), truncated if necessary
- **Right:** Hamburger menu (≡) — opens a drawer with members, settings, invite link

---

## Item List

### Sections

Items are divided into two sections separated by a small uppercase label:

- **Active items** — label: `N items left`
- **Purchased items** — label: `Purchased`

Purchased items are always appended below active items regardless of original insertion order.

### Item card

Each item row contains:

| Element | Detail |
|---------|--------|
| Circle checkbox | Unchecked: outline only. Checked: accent fill + white checkmark. Tapping toggles purchased state. |
| Name | 16px medium weight, `var(--text-h)` |
| Quantity badge | Accent colour pill (e.g. `2 unidades`, `1 bolsa`) — shown inline beside the name |
| Tag row | Small rounded tags below the name: ✨ variety, 🏷️ brand, 🏪 store — in that order |
| Added-by avatar | Coloured circle with member initial, right-aligned |

**Purchased state:** name gets `text-decoration: line-through`, colour shifts to `var(--purchased)` (`#b0adb5`), tags fade to 45% opacity.

### CTA tags (empty fields)

When a field (variety, brand, or store) is not set, a **dashed-border CTA tag** appears in its place showing only `+ emoji` (e.g. `+ ✨`). Tapping opens an inline edit for that specific field. Only missing fields show CTAs; present fields show the filled tag normally.

---

## Smart Input Bar

Sticky, fixed to the bottom. Contains:

### Syntax legend

A row of small chips above the input reminding the user of the sigils:

```
+qty   *variety   #brand   @store
```

Shown persistently (not only on focus) so new users can learn without onboarding.

### Input field

Monospace font, colour-coded tokens as the user types:

| Token | Sigil | Colour |
|-------|-------|--------|
| Quantity | `+` prefix (e.g. `+2`, `+1 bolsa`, `+6 litros`) | Accent purple |
| Variety | `*` prefix (e.g. `*Entera`) | Amber `#d97706` |
| Brand | `#` prefix (e.g. `#Hacendado`) | Teal `#0891b2` |
| Store | `@` prefix (e.g. `@Mercadona`) | Green `#16a34a` |
| Name | Everything else | `var(--text-h)` |

Tokens may appear in any order. The parser identifies tokens by their leading sigil character.

### Live parse preview

A small card above the input that appears as soon as a sigil is detected. Shows the parsed item name, quantity badge, and resolved tags — giving the user confirmation before submission. The store tag shows `🏪 typing…` in italic while `@` is still being completed.

### Context-aware suggestion dropdown

The dropdown (above the input, below the preview card) is context-sensitive:

- **No sigil typed:** standard item name suggestions from `GET /suggestions?q=...` (prefix match on purchase history)
- **After `@`:** store suggestions ranked by usage frequency within this list
- **After `#`:** brand suggestions from purchase history
- **After `*`:** variety suggestions from purchase history

The top suggestion is highlighted in `var(--accent-bg)` with accent-coloured text.

### Add button

A square accent-coloured button (`+` icon) to the right of the input. Submitting adds the parsed item and clears the input.

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
  added_by: string          // user UUID
  created_at: string
  updated_at: string
}
```

---

## State management (prototype phase)

Single `useState` holding a `ListItem[]` array with mock data. No routing needed for the first screen. State will be lifted to a custom hook (`useListItems`) when the API is wired up.

Key local state:
- `items: ListItem[]` — the full list
- `inputValue: string` — raw text in the Smart Input bar
- `suggestions: string[]` — fetched from backend as user types
- `parsedInput: ParsedInput | null` — derived from `inputValue`

`ParsedInput` is a pure function of `inputValue` (no side effects), making it easy to test:

```ts
interface ParsedInput {
  name: string
  quantity: string | null
  variety: string | null
  brand: string | null
  store: string | null
}
```

---

## Component tree (target)

```
<ListScreen>
  <ListHeader title store onMenuOpen />
  <ProgressBar purchased={n} total={m} />
  <ItemList>
    <SectionLabel />
    <ItemCard
      item
      onTogglePurchased
      onTagClick(field)   // opens inline edit for that field
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
| Tap checkbox | Optimistic toggle of `purchased`; item animates to bottom of list |
| Tap CTA tag | Opens a small inline text field for that specific field (variety/brand/store) |
| Tap filled tag | Same inline edit, pre-filled with current value |
| Type in input | Debounced `GET /suggestions` call; live parse preview updates synchronously |
| Submit | POST item to API; optimistically prepend to active list; clear input |
| Long-press item | (Future) Swipe-to-delete / edit full item sheet |

---

## Out of scope for this prototype

- Full item edit sheet (tap-and-hold / swipe actions)
- The lists home screen (`< Lists`)
- The hamburger menu drawer (members, settings, invite)
- Auth / sign-in screen
- Dark mode (tokens are ready; toggle not implemented yet)
- Real-time sync polling (will be added when API is wired)
