# Estimated Cost Totals — Design Spec

**Date:** 2026-04-16
**Branch:** feat/estimated-total-cost
**Status:** Approved

---

## Overview

Show running cost totals inline with the existing section labels in `ListScreen`:

- **"X productos por comprar"** label → right-aligned estimated total for unpurchased items (purple)
- **Each date label** in the purchased section → right-aligned spent total for that day (green)

No backend changes. No dashboard `ListCard` changes. All computation is client-side from items already in memory.

---

## Behaviour

### Which items contribute to a total

An item contributes a **cost** = `item.price × parseQuantityFactor(item.quantity, item.price_per)`.

`parseQuantityFactor` rules:

| `price_per` | `quantity` | result |
|---|---|---|
| `null` | `null` | `1` (single unit) |
| `null` | `"3"` or `"3 bolsas"` | `3` (numeric count; non-SI text ignored) |
| `null` | `"500g"` / `"2 kg"` / `"1,5l"` | `1` (SI unit = pack descriptor, not a count) |
| `'KILOGRAM'` | `"500g"` | `0.5` (g → kg) |
| `'KILOGRAM'` | `"2 kg."` | `2.0` (dot = abbreviation marker) |
| `'KILOGRAM'` | `"750ml"` / `"33cl"` / `"1,5l"` | volume in kg (1 L = 1 kg) |
| `'KILOGRAM'` | `null` or plain number or unknown unit | `null` → excluded |

Supported SI units: `g`, `kg`, `ml`, `cl`, `dl`, `l` (case-insensitive, optional trailing `.`).
Decimal separator: `.` or `,`.
Volume is treated as water density (1 L = 1 kg).

An item is **excluded** (sets the `partial` flag) when:
- `item.price == null`, or
- `parseQuantityFactor` returns `null` (per-kg with no usable unit)

### Display rules

| Condition | Rendered |
|---|---|
| `total > 0`, `partial = false` | `€X.XX` |
| `total > 0`, `partial = true` | `≥ €X.XX` |
| `total === 0` (regardless of partial) | nothing — label unchanged |

The `≥` prefix signals the total is a lower bound because some items have no logged price.

---

## Architecture

### New file — `frontend/src/lib/itemCost.ts`

Two exports:

```ts
// Shared date label logic (extracted from ItemList's inline logic)
export function purchasedDateLabel(purchased_at: string | null): string

// Computes a cost summary for a group of items.
// Returns null if the summed total is zero (nothing worth rendering).
export interface CostSummary { total: number; partial: boolean }
export function computeCostSummary(items: ListItem[]): CostSummary | null
```

Extracting `purchasedDateLabel` ensures `ListScreen` and `ItemList` use identical key strings when grouping by date.

### `ListScreen` changes

New `useMemo` (depends on `items`) that produces in a single loop:

```ts
{
  pendingCost: CostSummary | null,           // unpurchased items
  purchasedCostByDate: Map<string, CostSummary | null>  // keyed by date label
}
```

Both are passed as new **optional** props to `ItemList`.

### `ItemList` changes

**New optional props:**

```ts
pendingCost?: CostSummary | null
purchasedCostByDate?: Map<string, CostSummary | null>
```

**Label rendering:**

- `item-list__label` ("X productos por comprar") — becomes a flex row; `pendingCost` renders right-aligned when non-null
- Each `item-list__date-label` — same treatment using `purchasedCostByDate.get(label)`
- If the relevant cost value is `null`, the label renders exactly as before

**`ItemList` also** replaces its inline date label logic with `purchasedDateLabel` from `itemCost.ts`.

### CSS changes — `ItemList.css`

- Add `display: flex; justify-content: space-between; align-items: center` to `.item-list__label` and `.item-list__date-label`
- Add `.item-list__label-cost` (accent colour) and `.item-list__date-label-cost` (green) for the amount spans

---

## Out of scope

- Dashboard `ListCard` — no cost aggregation added to `GET /lists`
- Items priced per kg **without** a parseable SI quantity — excluded, trigger `≥`
- Community prices — only `item.price` (user-logged prices) are used

---

## Testing

- **Unit:** `parseQuantityFactor`, `computeCostSummary`, and `purchasedDateLabel` in `itemCost.test.ts` — cover all unit types (g/kg/ml/cl/dl/l), comma decimal separator, abbreviated units (`kg.`), pack descriptors vs count, per-kg items with/without usable unit, partial flag, zero total
- **Component:** `ItemList` tests updated with `pendingCost` and `purchasedCostByDate` props — assert rendered amounts and `≥` prefix
- **Integration:** `ListScreen` tests assert the memo produces correct summaries from a mixed item array
