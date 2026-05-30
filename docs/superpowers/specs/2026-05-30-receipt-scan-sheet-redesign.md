# Receipt Scan Sheet Redesign

**Date:** 2026-05-30  
**Status:** Approved

## Problem

The current `ReceiptScanSheet` has several usability issues:

1. **Checkbox collision bug** — state is keyed by `receipt_name` (unmatched) or `item_id` (matched). Two receipt lines with the same name share state, causing double-toggle.
2. **Matched items are not editable** — high-confidence matches can't be re-linked to a different list item.
3. **Quantity and unit price are read-only** — OCR errors can't be corrected before saving.
4. **Asymmetric UX** — matched items use checkboxes; unmatched use a dropdown + "Omitir" button. No consistent interaction model.
5. **Dropdown list is flat** — purchased items are not grouped by date and show no identifying info beyond name.

---

## Design

### Row model

Every receipt line (matched or unmatched) is an identical row with two states:

**Collapsed (summary)** — always visible, read-only:
- OCR receipt name (small, grey — `rss-ocr`)
- Linked list item name in bold, or "sin vincular" in italic grey (`rss-item` / `.unlinked`)
- Quantity + price summary line: `1× 0,89 €/ud`, `680g × 12,90 €/kg`, `4× 0,45 €/ud` (`rss-qty-summary`)
- Total price on the right (`rss-total`)
- Pencil icon (tappable, triggers expand)

**Expanded (form)** — lps-style fields, one per section:
1. **Vincular a** — `<select>` grouped with `<optgroup>` by purchase date. Each option shows the item name. Pre-filled for matched items, empty for unmatched. Selecting an item in an unmatched row auto-checks its checkbox.
2. **Cantidad · Precio** — single row: `[text input] × € [number input] [/ud | /kg toggle]`
   - Quantity is `type="text"` (free text: `"1"`, `"680g"`, `"1l"`, `"500g"`) — consistent with `ListItem.quantity: string | null`
   - `/ud /kg` toggle sets `price_per` — reuses `.lps-toggle` / `.lps-tbtn` CSS from `LogPriceSheet`
   - Editing either field updates the collapsed summary and total in real time using `parseQuantityFactor` from `itemCost.ts`

### State

Replace the current dual-state model (`checkedIds: Set<string>` + `linkedItems: Record<string, string>`) with a single index-keyed array — this eliminates the name-collision bug:

```ts
interface LineState {
  included: boolean        // checkbox
  itemId: string | null    // selected list item id
  quantity: string         // text, e.g. "680g", "4", "1"
  unitPrice: number        // price per unit or per kg
  pricePer: 'KILOGRAM' | null
}
// state: LineState[]  — one entry per receipt line, by index
```

### Toolbar (above body)

A thin bar between the header and the item list:
- Left: `N de M seleccionados` (live count)
- Right: `Seleccionar todo` / `Deseleccionar todo` button — toggles all when fewer than all are checked; deselects all otherwise

### Footer totals row

Above the confirm button:
- Left: `Seleccionado X,XX €` — sum of `unitPrice × parseQuantityFactor(quantity, pricePer)` for all checked rows
- Right: `Ticket X,XX €` — the scanned `receipt_total` (static)
- If the difference is < €0.02: `✓ coincide` in green
- Otherwise: `(+X,XX €)` or `(−X,XX €)` in amber

### PurchasedItemRef extension

The parent (`ListScreen`) currently maps items to `{ id, name }`. Extend to also pass `purchased_at`, `brand`, `stores`, and `quantity` so the dropdown can:
- Group options with `<optgroup label="📅 comprado DD mmm">` using `purchasedDateLabel()` from `itemCost.ts`
- Show disambiguating detail inline (brand, store) when two items share the same name

### Output (confirm)

`onConfirm` receives `PricePatch[]` + `NameMapping[]`. `PricePatch` gains a `quantity: string | null` field:

```ts
export interface PricePatch {
  item_id: string
  price: number
  price_per: string | null
  store: string | null
  quantity: string | null   // ← new: the edited quantity text, e.g. "680g", "4", "1"
}
```

The backend `POST /lists/{id}/receipt-prices` already writes `price`, `price_per`, and `store` to `list_items`. It should also write `quantity` when the patch includes it (non-null). This keeps `list_items.quantity` in sync with what was actually on the receipt.

---

## Files affected

| File | Change |
|---|---|
| `frontend/src/components/ReceiptScanSheet.tsx` | Full rewrite of component logic and JSX |
| `frontend/src/components/ReceiptScanSheet.css` | New CSS classes (`rss-*`, toolbar, footer-totals); retain/extend existing `.sheet-*` |
| `frontend/src/types/receipt.ts` | Add `quantity: string | null` to `PricePatch` |
| `frontend/src/types.ts` | No change to `ListItem` |
| `frontend/src/components/ListScreen.tsx` | Extend `purchasedItems` mapping to include `purchased_at`, `brand`, `stores`, `quantity` |
| `frontend/src/components/ReceiptScanSheet.test.tsx` | Update / extend tests for new state model |
| `backend/app/routers/prices.py` (or `receipt.py`) | Write `quantity` from patch to `list_items` when non-null |
| `backend/tests/` | Add test coverage for quantity update via receipt-prices |
| `frontend/src/lib/receiptAi.ts` | Remove `bag charges` from Gemini skip list |

---

## Gemini prompt fix

`frontend/src/lib/receiptAi.ts` — remove `bag charges` from the skip list in the prompt:

```diff
- Skip: subtotals, taxes, VAT, loyalty discounts, bag charges, cashier info, store address, payment lines.
+ Skip: subtotals, taxes, VAT, loyalty discounts, cashier info, store address, payment lines.
```

Bag charges (e.g. `Bolsa 0,10 €`) are real line items that contribute to `receipt_total`. Skipping them causes the footer total comparison to always show a discrepancy, which is confusing.

---

## Out of scope

- Changes to the receipt matching logic
