# List Filtering — Design Spec

**Date:** 2026-04-23
**Status:** Approved

---

## Overview

Allow users to filter items in a list (both unpurchased and purchased sections) by free-text name and/or sigil values (`#brand`, `@store`). The filter UI replaces the existing store-chip bar with a unified `FilterBar` component that can slide between chip mode and search mode.

---

## User Interaction

The current store-chip bar gains a 🔍 magnifier button on its left edge.

**Activating search mode:**
- User taps 🔍
- The magnifier slides to the right; store chips slide out to the right
- A text input slides in from the left; an ✕ button appears on the left
- Input is auto-focused after the 320 ms animation

**Deactivating search mode:**
- User taps ✕
- Animation reverses; store chips slide back in; filter query clears to `""`

**Chip mode (default):**
- Tapping a store chip emits `"@StoreName"` as the query (filters to that store)
- Tapping "Todas" emits `""` (no filter)
- Chip mode and search mode are mutually exclusive; switching to search mode resets any active chip

**Non-matching items are hidden** (not dimmed). Both unpurchased and purchased sections are filtered.

**Filter state is ephemeral:** stored in `ListScreen` component state, cleared on unmount (navigation away).

---

## Architecture

Three units with one job each:

| Unit | Responsibility |
|---|---|
| `FilterBar` | Visual component — chips or search input, slide animation, emits `query: string` |
| `useItemFilter` | Hook — parses query, applies filter logic, returns `filteredItems` |
| `ListScreen` | Holds `filterQuery: string` state; wires `FilterBar` and `useItemFilter` together |

### What replaces what

| Before | After |
|---|---|
| `StoreFilter.tsx` | `FilterBar.tsx` (new component) |
| `storeFilter: string \| null` state in `ListScreen` | `filterQuery: string` state |
| `activeStore` + `filteredItems` derivation in `ListScreen` | `useItemFilter(items, filterQuery)` |
| `useEffect` resetting stale store filter | Removed — `FilterBar` derives `activeChip` from `query` prop |

---

## `FilterBar` Component

**Files:** `frontend/src/components/FilterBar.tsx`, `frontend/src/components/FilterBar.css`

```ts
interface FilterBarProps {
  stores: string[]              // for rendering chips (same derivation as current StoreFilter)
  query: string                 // controlled value: "" | "@Store" | free text with sigils
  onChange: (q: string) => void
}
```

**Internal state:** `mode: 'chips' | 'search'` only.

**Chip mode:**
- `activeChip` is derived from `query`: if `query === "@${store}"` for a known store, that chip is highlighted; otherwise "Todas" is active
- Chip tap → `onChange("@StoreName")` or `onChange("")` for "Todas"
- 🔍 tap → `mode = 'search'`, `onChange("")`
- If `stores.length === 0` the component returns `null`

**Search mode:**
- Every keystroke → `onChange(inputValue)`
- ✕ tap → `mode = 'chips'`, `onChange("")`
- Input auto-focused via `useEffect` watching `mode`, after a 320 ms delay matching the CSS transition

**Animation (CSS only):**

```css
.filter-bar                     { overflow: hidden; position: relative; height: 38px; }
.filter-bar__chips              { position: absolute; inset: 0;
                                  transition: transform 320ms ease, opacity 320ms; }
.filter-bar__search             { position: absolute; inset: 0;
                                  transform: translateX(-100%); opacity: 0;
                                  transition: transform 320ms ease, opacity 320ms; }

.filter-bar--search-active .filter-bar__chips  { transform: translateX(100%); opacity: 0; }
.filter-bar--search-active .filter-bar__search { transform: translateX(0);    opacity: 1; }
```

---

## `useItemFilter` Hook

**File:** `frontend/src/hooks/useItemFilter.ts`

```ts
function useItemFilter(items: ListItem[], query: string): ListItem[]
```

Parses `query` via the existing `parseInput` utility. Extracts:
- `parsed.stores` → `@store` tokens
- `parsed.brand` → `#brand` token
- `parsed.name` → remaining free text

**Filter logic (all conditions AND-ed):**

| Condition | Rule |
|---|---|
| Free text | `item.name` case-insensitively contains the text; skipped when text is empty |
| Stores | `item.stores` overlaps with `parsed.stores` **OR** `item.stores` is empty; skipped when no `@` sigils |
| Brand | `item.brand` case-insensitively contains the brand token; skipped when no `#` sigil |

Multiple `@store` sigils OR together; `@store` and `#brand` AND together (per the TODO spec).

Store-less items always pass a store filter (consistent with current `StoreFilter` behaviour).

When `query === ""`, returns `items` unchanged (same reference — no work done).

---

## `ListScreen` Changes

- **Remove:** `storeFilter`, `activeStore`, the `useEffect` resetting it, the `filteredItems` derivation
- **Add:** `filterQuery: string` state (initialised to `""`)
- **Replace:** `<StoreFilter stores={stores} active={activeStore} onSelect={setStoreFilter} />` → `<FilterBar stores={stores} query={filterQuery} onChange={setFilterQuery} />`
- **Replace:** manual `filteredItems` → `useItemFilter(items, filterQuery)`
- `stores` derivation (from unpurchased items only) stays unchanged
- `pendingCost` / `purchasedCostByDate` already consume `filteredItems` — no change

---

## `ItemList` Changes

Add an optional `totalItems?: number` prop. When provided and `totalItems !== items.length`, the unpurchased section count label reads `"X de Y productos por comprar"` instead of `"X productos por comprar"`. `ListScreen` always passes the unfiltered unpurchased item count as `totalItems`; `ItemList` only renders the `"X de Y"` form when the two numbers differ. The "Comprados (N)" toggle header likewise updates to reflect only the filtered purchased count.

---

## Out of Scope

- Persisting filter state across navigation (ephemeral by design)
- Filtering the dashboard list of grocery lists
- Server-side filtering (all filtering is client-side)
- The `$price` sigil is not supported as a filter token
