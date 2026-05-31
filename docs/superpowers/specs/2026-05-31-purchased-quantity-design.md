# Purchased Quantity — Design Spec

> Status: approved  
> Date: 2026-05-31  
> Author: brainstorming session

## Context

When a user adds "2 pepinos" to a shopping list, `quantity = "2"` captures their
intent. At the supermarket they may pick up "487g" instead. The existing cost
rollup uses `quantity` to compute spend, so it would calculate the wrong amount.

This spec introduces `purchased_quantity` to record the actual quantity bought,
separate from the planned `quantity`, and wires it into cost calculation and display.

---

## Decisions

### 1. Data model

Add a new nullable column `purchased_quantity: str | null` to `list_items`.

- `quantity` — the **planned** quantity set when adding the item to the list.
  Never modified by receipt or purchase flows.
- `purchased_quantity` — the **actual** quantity bought, recorded at purchase time.
  Null until explicitly set.

One Alembic migration. Backward-compatible: all existing rows default to `null`.

### 2. Entry points

Two places write `purchased_quantity`:

#### ReceiptScanSheet (no UI changes)
The sheet already collects a per-line qty and sends it as `patch.quantity` inside
`ReceiptPriceBatch`. The backend's `apply_receipt_prices` endpoint currently writes
this to `item.quantity`; after this change it writes to `item.purchased_quantity`
instead. `item.quantity` is left untouched.

#### LogPurchaseSheet (renamed from LogPriceSheet)
The sheet is renamed to reflect its expanded purpose: logging a full purchase
record (price + actual quantity), not just a price.

**New qty field:** Added between the header and the store picker. Follows the exact
same `[qty input] × € [price input] [/ud|/kg toggle]` row pattern as the
`ReceiptScanSheet` expanded form (`rss-qp-row`).

- The qty field is **optional**. If left blank, `purchased_quantity` is not written
  (the item keeps whatever value it had, or `null`).
- **Placeholder:** shows the item's planned `quantity` (e.g. `"2"`) as a hint so
  the user knows what they originally planned.
- **Guidance text** below the row:
  > *"Introduce unidades (ej. 3) o peso (ej. 487g, 1.2kg)"*
- **Live cost preview** (e.g. `≈ 0,87 €`) appears to the right of the guidance
  text when both a qty and a price are present. Hidden when qty is blank.

The `onSave` callback gains a `purchasedQuantity: string | null` parameter.
The parent (`ListScreen`) sends it via `PATCH /lists/{list_id}/items/{item_id}`.

### 3. Cost calculation

`computeCostSummary` in `itemCost.ts` picks the effective quantity:

```
effectiveQty = (item.purchased && item.purchased_quantity != null)
  ? item.purchased_quantity
  : item.quantity
```

- For **purchased items**: prefer `purchased_quantity`; fall back to `quantity`.
- For **unpurchased items**: always use `quantity` (planning intent).
- Fully backward-compatible: items with `purchased_quantity = null` behave as before.

### 4. ItemCard display

The qty chip (`item-card__qty`) renders `displayQty`:

```
displayQty = (item.purchased && item.purchased_quantity != null)
  ? item.purchased_quantity   // actual receipt qty
  : item.quantity             // planned qty (also used as fallback when purchased but no receipt qty)
```

| State | Qty chip | Price chip |
|---|---|---|
| Unpurchased | `quantity` (planned) | Always visible |
| Purchased + `purchased_quantity` set | `purchased_quantity` (actual) | Always visible, dimmed |
| Purchased, no `purchased_quantity` | `quantity` (fallback) | Always visible, dimmed |

The price chip is always rendered regardless of purchased state (current behaviour
is preserved).

---

## Out of scope (this iteration)

- Manual entry of `purchased_quantity` from `ItemActionSheet` (long-press menu)
- Inline qty field on tick gesture
- Surfacing `purchased_quantity` in `PriceHistorySheet` entries
- Using `purchased_quantity` in frequency suggestions

---

## File change surface

| File | Change |
|---|---|
| `backend/alembic/versions/<new>.py` | Migration: add `purchased_quantity` column |
| `backend/app/db/models.py` | `purchased_quantity: Optional[str]` on `ListItem` |
| `backend/app/schemas/items.py` | `purchased_quantity` in `ItemRead` + `ItemUpdate` (follows existing convention: `None` in `ItemUpdate` means "don't touch"; use `""` or a sentinel if clearing is needed — out of scope here) |
| `backend/app/routers/receipt.py` | `patch.quantity` → `item.purchased_quantity` |
| `frontend/src/types.ts` | `purchased_quantity: string \| null` on `ListItem` |
| `frontend/src/lib/itemCost.ts` | `effectiveQty` logic in `computeCostSummary` |
| `frontend/src/components/LogPriceSheet.tsx` → `LogPurchaseSheet.tsx` | Rename + new qty field |
| `frontend/src/components/LogPriceSheet.css` → `LogPurchaseSheet.css` | Rename + new styles |
| `frontend/src/components/ItemCard.tsx` | `displayQty` logic for qty chip |
| `frontend/src/components/ListScreen.tsx` | Update sheet open/close, pass purchasedQty to save |
| Any test files referencing `LogPriceSheet` | Update imports + add qty field tests |
