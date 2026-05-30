# Receipt Scan Sheet Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign ReceiptScanSheet with a unified index-keyed row model, progressive-disclosure editing, editable quantity/price, grouped item dropdown, toolbar select-all, and footer total comparison; also write quantity back to the DB and fix bag charges being dropped by Gemini.

**Architecture:** All receipt lines (matched + unmatched) share one `LineState[]` keyed by position, eliminating the name-collision bug. Collapsed rows show a read-only summary; tapping the pencil icon expands lps-style form fields. `PricePatch` gains a `quantity: string | null` field written to `list_items.quantity` by the backend.

**Tech Stack:** React + TypeScript (frontend), FastAPI + SQLModel (backend), Vitest + Testing Library (frontend tests), pytest (backend tests).

---

## File Map

| File | Action |
|---|---|
| `frontend/src/lib/receiptAi.ts` | Remove `bag charges` from Gemini skip list |
| `backend/app/schemas/receipt.py` | Add `quantity: Optional[str] = None` to `PricePatch` |
| `backend/app/routers/receipt.py` | Write `patch.quantity` to `item.quantity` when non-null |
| `backend/tests/test_receipt_router.py` | Add 2 tests for quantity write behaviour |
| `frontend/src/types/receipt.ts` | Add `quantity: string \| null` to `PricePatch` |
| `frontend/src/components/ReceiptScanSheet.tsx` | Full rewrite |
| `frontend/src/components/ReceiptScanSheet.css` | Add `rss-*`, toolbar, footer-totals classes; keep `sheet-*` |
| `frontend/src/components/ListScreen.tsx` | Extend `purchasedItems` mapping to pass `purchased_at`, `brand`, `stores`, `quantity` |
| `frontend/src/components/ReceiptScanSheet.test.tsx` | Full rewrite for new behaviour |

---

## Task 1: Gemini bag charges fix

**Files:**
- Modify: `frontend/src/lib/receiptAi.ts:36`

- [ ] **Step 1: Edit the prompt**

In `frontend/src/lib/receiptAi.ts`, change line 36 from:
```
- Skip: subtotals, taxes, VAT, loyalty discounts, bag charges, cashier info, store address, payment lines.
```
to:
```
- Skip: subtotals, taxes, VAT, loyalty discounts, cashier info, store address, payment lines.
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/receiptAi.ts
git commit -m "fix: include bag charges in Gemini receipt parse"
```

---

## Task 2: Backend — write `quantity` from `PricePatch` to `list_items`

**Files:**
- Modify: `backend/app/schemas/receipt.py:47-51`
- Modify: `backend/app/routers/receipt.py:88-96`
- Test: `backend/tests/test_receipt_router.py`

- [ ] **Step 1: Write two failing tests**

Append to `backend/tests/test_receipt_router.py`:

```python
def test_receipt_prices_updates_quantity(client, session):
    body = {
        "scan_id": None,
        "patches": [
            {
                "item_id": "item-almendras",
                "price": 1.15,
                "price_per": None,
                "store": "Mercadona",
                "quantity": "2",
            }
        ],
        "mappings": [],
    }
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 200
    session.refresh(session.get(ListItem, "item-almendras"))
    assert session.get(ListItem, "item-almendras").quantity == "2"


def test_receipt_prices_preserves_quantity_when_null(client, session):
    item = session.get(ListItem, "item-almendras")
    item.quantity = "500g"
    session.add(item)
    session.commit()

    body = {
        "scan_id": None,
        "patches": [
            {
                "item_id": "item-almendras",
                "price": 1.15,
                "price_per": None,
                "store": "Mercadona",
                "quantity": None,
            }
        ],
        "mappings": [],
    }
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 200
    session.refresh(session.get(ListItem, "item-almendras"))
    assert session.get(ListItem, "item-almendras").quantity == "500g"
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd backend && uv run pytest tests/test_receipt_router.py::test_receipt_prices_updates_quantity tests/test_receipt_router.py::test_receipt_prices_preserves_quantity_when_null -v
```

Expected: `FAILED` — `quantity` field not accepted (validation error) or not written.

- [ ] **Step 3: Add `quantity` to `PricePatch` schema**

In `backend/app/schemas/receipt.py`, update `PricePatch`:

```python
class PricePatch(BaseModel):
    item_id: str
    price: float
    price_per: Optional[str] = None
    store: Optional[str] = None
    quantity: Optional[str] = None
```

- [ ] **Step 4: Write `quantity` in the router**

In `backend/app/routers/receipt.py`, inside the `for patch in body.patches:` loop (around line 92), add one line after the existing price writes:

```python
        item.price = patch.price
        item.price_per = patch.price_per
        if patch.store:
            item.price_store = patch.store
        if patch.quantity is not None:
            item.quantity = patch.quantity
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd backend && uv run pytest tests/test_receipt_router.py::test_receipt_prices_updates_quantity tests/test_receipt_router.py::test_receipt_prices_preserves_quantity_when_null -v
```

Expected: both `PASSED`.

- [ ] **Step 6: Run full backend suite to check for regressions**

```bash
cd backend && uv run pytest
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/receipt.py backend/app/routers/receipt.py backend/tests/test_receipt_router.py
git commit -m "feat: write quantity from receipt patch to list_items"
```

---

## Task 3: Frontend types

**Files:**
- Modify: `frontend/src/types/receipt.ts`

- [ ] **Step 1: Add `quantity` to `PricePatch`**

In `frontend/src/types/receipt.ts`, update `PricePatch`:

```ts
export interface PricePatch {
  item_id: string
  price: number
  price_per: string | null
  store: string | null
  quantity: string | null
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | head -30
```

Expected: errors only in `ReceiptScanSheet.tsx` (old `pricePatchFor` doesn't include `quantity`) — those are fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/receipt.ts
git commit -m "feat: add quantity field to PricePatch type"
```

---

## Task 4: CSS — new classes for redesigned sheet

**Files:**
- Modify: `frontend/src/components/ReceiptScanSheet.css`

Keep all existing `.sheet-*`, `.confirm-btn`, `.confirm-count` rules. Append the following after the last rule:

- [ ] **Step 1: Append new CSS**

Add to the end of `frontend/src/components/ReceiptScanSheet.css`:

```css
/* ── toolbar ── */
.rss-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--paper-1);
  flex-shrink: 0;
}
.rss-toolbar-count {
  font-size: 0.75rem;
  color: var(--ink-2);
}
.rss-toolbar-toggle {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
}

/* ── unified row ── */
.rss-row { border-bottom: 1px solid var(--border); }
.rss-row.checked  { background: color-mix(in srgb, var(--accent) 4%, var(--paper-0)); }
.rss-row.expanded { background: color-mix(in srgb, var(--accent) 7%, var(--paper-0)); }

/* collapsed summary */
.rss-summary {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.rss-check {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
  flex-shrink: 0;
  margin-top: 3px;
  cursor: pointer;
}
.rss-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.rss-ocr {
  font-size: 0.7rem;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rss-item {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rss-item.unlinked { font-weight: 400; color: var(--ink-2); font-style: italic; }
.rss-qty-summary { font-size: 0.75rem; color: var(--ink-2); margin-top: 1px; }
.rss-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
  gap: 3px;
  padding-top: 1px;
}
.rss-total { font-size: 0.88rem; font-weight: 700; color: var(--ink-0); }
.rss-edit-icon {
  color: var(--ink-2);
  opacity: 0.3;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
}
.rss-row.expanded .rss-edit-icon { opacity: 1; color: var(--accent); }

/* expanded form */
.rss-form { display: none; border-top: 1px solid var(--border); }
.rss-row.expanded .rss-form { display: block; }

.rss-field {
  padding: 10px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 20%, transparent);
  background: color-mix(in srgb, var(--accent) 5%, var(--paper-0));
}
.rss-field:last-child { border-bottom: none; }
.rss-field-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.rss-qp-row { display: flex; align-items: center; gap: 6px; }
.rss-qty-input {
  width: 80px;
  flex-shrink: 0;
  background: var(--paper-0);
  border: none;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink-0);
  outline: none;
  text-align: right;
  font-family: inherit;
}
.rss-qty-input:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent); }
.rss-sep { font-size: 0.875rem; color: var(--ink-2); flex-shrink: 0; }
.rss-euro { font-size: 1.125rem; font-weight: 700; color: var(--ink-2); flex-shrink: 0; }
.rss-price-input {
  flex: 1;
  min-width: 0;
  background: var(--paper-0);
  border: none;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink-0);
  outline: none;
  text-align: right;
  font-family: inherit;
  -webkit-appearance: none;
  appearance: none;
}
.rss-price-input:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent); }
.rss-unit-toggle {
  display: flex;
  background: var(--paper-0);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}
.rss-unit-btn {
  padding: 7px 9px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent);
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}
.rss-unit-btn--active { background: var(--accent); color: var(--accent-fg); border-radius: 8px; }
.rss-link-select {
  width: 100%;
  background: var(--paper-0);
  border: none;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.82rem;
  color: var(--ink-0);
  outline: none;
  cursor: pointer;
  font-family: inherit;
  -webkit-appearance: none;
  appearance: none;
}
.rss-link-select:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent); }

/* footer totals comparison row */
.rss-footer-totals {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 6px 0 10px;
  font-size: 0.75rem;
  color: var(--ink-2);
}
.rss-footer-selected { font-size: 0.95rem; font-weight: 700; color: var(--ink-0); }
.rss-footer-match    { font-size: 0.7rem; font-weight: 600; color: var(--color-success); margin-left: 4px; }
.rss-footer-diff     { font-size: 0.7rem; font-weight: 600; color: var(--color-warning); margin-left: 4px; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ReceiptScanSheet.css
git commit -m "feat: add receipt scan sheet redesign CSS"
```

---

## Task 5: Rewrite `ReceiptScanSheet.tsx`

**Files:**
- Modify: `frontend/src/components/ReceiptScanSheet.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import { useState } from "react";
import type { MatchedLine, UnmatchedLine, PricePatch, NameMapping, ReceiptScanResult } from "../types/receipt";
import { formatPrice } from "../lib/formatPrice";
import { parseQuantityFactor, purchasedDateLabel } from "../lib/itemCost";
import "./ReceiptScanSheet.css";

interface PurchasedItemRef {
  id: string;
  name: string;
  purchased_at: string | null;
  brand: string | null;
  stores: string[];
  quantity: string | null;
}

interface LineState {
  included: boolean;
  itemId: string | null;
  quantity: string;
  unitPrice: number;
  pricePer: "KILOGRAM" | null;
}

interface Props {
  result: ReceiptScanResult;
  purchasedItems: PurchasedItemRef[];
  store: string | null;
  onConfirm: (patches: PricePatch[], mappings: NameMapping[]) => void;
  onClose: () => void;
}

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M15.232 5.232l3.536 3.536M9 13l6.768-6.768a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-.707.464l-3.535 1.06 1.06-3.535A2 2 0 019 13z"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

function initialQuantity(line: MatchedLine | UnmatchedLine): string {
  if (line.price_type === "KILOGRAM" && line.quantity != null) {
    return line.quantity < 1
      ? `${Math.round(line.quantity * 1000)}g`
      : `${line.quantity}kg`;
  }
  if (line.price_type === "MULTI" && line.quantity != null) {
    return String(Math.round(line.quantity));
  }
  return "1";
}

function initState(result: ReceiptScanResult): LineState[] {
  return [
    ...result.matched.map((m) => ({
      included: true,
      itemId: m.item_id,
      quantity: initialQuantity(m),
      unitPrice: m.unit_price,
      pricePer: m.price_type === "KILOGRAM" ? ("KILOGRAM" as const) : null,
    })),
    ...result.unmatched.map((u) => ({
      included: false,
      itemId: null,
      quantity: initialQuantity(u),
      unitPrice: u.unit_price,
      pricePer: u.price_type === "KILOGRAM" ? ("KILOGRAM" as const) : null,
    })),
  ];
}

function formatQtySummary(ls: LineState): string {
  const price = ls.unitPrice.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const unit = ls.pricePer === "KILOGRAM" ? "€/kg" : "€/ud";
  const sep = ls.pricePer === "KILOGRAM" ? " × " : "× ";
  return `${ls.quantity}${sep}${price} ${unit}`;
}

function computeLineTotal(ls: LineState): number {
  const factor = parseQuantityFactor(ls.quantity, ls.pricePer);
  return factor !== null ? ls.unitPrice * factor : ls.unitPrice;
}

function groupItemsByDate(items: PurchasedItemRef[]): { label: string; items: PurchasedItemRef[] }[] {
  const sorted = [...items].sort((a, b) => {
    if (!a.purchased_at) return 1;
    if (!b.purchased_at) return -1;
    return b.purchased_at.localeCompare(a.purchased_at);
  });
  const groups: { label: string; items: PurchasedItemRef[] }[] = [];
  for (const item of sorted) {
    const label = purchasedDateLabel(item.purchased_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

export default function ReceiptScanSheet({ result, purchasedItems, store, onConfirm, onClose }: Props) {
  const allLines: (MatchedLine | UnmatchedLine)[] = [...result.matched, ...result.unmatched];
  const [lineStates, setLineStates] = useState<LineState[]>(() => initState(result));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const checkedCount = lineStates.filter((ls) => ls.included).length;
  const allChecked = checkedCount === lineStates.length;

  function updateLine(index: number, patch: Partial<LineState>) {
    setLineStates((prev) => prev.map((ls, i) => (i === index ? { ...ls, ...patch } : ls)));
  }

  function toggleExpanded(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) { next.delete(index); } else { next.add(index); }
      return next;
    });
  }

  function toggleAll() {
    const include = !allChecked;
    setLineStates((prev) => prev.map((ls) => ({ ...ls, included: include })));
  }

  // Prevent the same item from being linked to multiple rows
  const linkedItemIds = new Set(lineStates.map((ls) => ls.itemId).filter(Boolean) as string[]);
  function availableItems(currentIndex: number): PurchasedItemRef[] {
    return purchasedItems.filter(
      (item) => !linkedItemIds.has(item.id) || lineStates[currentIndex].itemId === item.id
    );
  }

  // Footer totals
  const selectedTotal = lineStates
    .filter((ls) => ls.included)
    .reduce((sum, ls) => sum + computeLineTotal(ls), 0);
  const receiptTotal = result.receipt_total;
  const diff = receiptTotal != null ? selectedTotal - receiptTotal : null;

  function handleConfirm() {
    const patches: PricePatch[] = lineStates
      .flatMap((ls, i) => {
        if (!ls.included || !ls.itemId) return [];
        return [{
          item_id: ls.itemId,
          price: ls.unitPrice,
          price_per: ls.pricePer,
          store,
          quantity: ls.quantity,
        }];
      });

    const mappings: NameMapping[] = lineStates
      .flatMap((ls, i) => {
        if (!ls.included || !ls.itemId || !store) return [];
        const item = purchasedItems.find((p) => p.id === ls.itemId);
        if (!item) return [];
        return [{
          store,
          receipt_name: allLines[i].receipt_name.toLowerCase(),
          item_name: item.name,
          item_brand: null,
        }];
      });

    onConfirm(patches, mappings);
  }

  const formattedDate = result.receipt_date
    ? new Date(result.receipt_date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="sheet">
      <div className="sheet-handle" />

      <div className="sheet-header">
        <div className="sheet-title-row">
          <div className="sheet-title">
            Ticket escaneado
            {store && <span className="store-badge">{store}</span>}
          </div>
          <button className="sheet-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="sheet-meta">
          {formattedDate && <span>📅 {formattedDate}</span>}
          {receiptTotal != null && <span>💶 {formatPrice(receiptTotal)}</span>}
        </div>
      </div>

      <div className="rss-toolbar">
        <span className="rss-toolbar-count">
          {checkedCount} de {lineStates.length} seleccionados
        </span>
        <button className="rss-toolbar-toggle" onClick={toggleAll}>
          {allChecked ? "Deseleccionar todo" : "Seleccionar todo"}
        </button>
      </div>

      <div className="sheet-body">
        {lineStates.map((ls, i) => {
          const line = allLines[i];
          const isExpanded = expanded.has(i);
          const itemGroups = groupItemsByDate(availableItems(i));
          const linkedItem = purchasedItems.find((p) => p.id === ls.itemId);

          return (
            <div key={i} className={`rss-row${ls.included ? " checked" : ""}${isExpanded ? " expanded" : ""}`}>
              <div className="rss-summary" onClick={() => toggleExpanded(i)}>
                <input
                  type="checkbox"
                  className="rss-check"
                  checked={ls.included}
                  onChange={(e) => {
                    e.stopPropagation();
                    updateLine(i, { included: e.target.checked });
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="rss-text">
                  <div className="rss-ocr">{line.receipt_name}</div>
                  <div className={`rss-item${ls.itemId ? "" : " unlinked"}`}>
                    {linkedItem ? linkedItem.name : "sin vincular"}
                  </div>
                  <div className="rss-qty-summary">{formatQtySummary(ls)}</div>
                </div>
                <div className="rss-right">
                  <div className="rss-total">{formatPrice(computeLineTotal(ls))}</div>
                  <div className="rss-edit-icon"><PencilIcon /></div>
                </div>
              </div>

              <div className="rss-form">
                <div className="rss-field">
                  <div className="rss-field-label">Vincular a</div>
                  <select
                    className="rss-link-select"
                    value={ls.itemId ?? ""}
                    onChange={(e) => {
                      const newId = e.target.value || null;
                      updateLine(i, {
                        itemId: newId,
                        included: newId !== null,
                      });
                    }}
                  >
                    <option value="">— No vincular —</option>
                    {itemGroups.map((group) => (
                      <optgroup key={group.label} label={`📅 ${group.label}`}>
                        {group.items.map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="rss-field">
                  <div className="rss-field-label">Cantidad · Precio</div>
                  <div className="rss-qp-row">
                    <input
                      className="rss-qty-input"
                      type="text"
                      value={ls.quantity}
                      placeholder="ej. 500g"
                      onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    />
                    <span className="rss-sep">×</span>
                    <span className="rss-euro">€</span>
                    <input
                      className="rss-price-input"
                      type="number"
                      value={ls.unitPrice}
                      step="0.01"
                      min="0"
                      onChange={(e) => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })}
                    />
                    <div className="rss-unit-toggle">
                      <button
                        type="button"
                        className={`rss-unit-btn${ls.pricePer === null ? " rss-unit-btn--active" : ""}`}
                        onClick={() => updateLine(i, { pricePer: null })}
                      >/ud</button>
                      <button
                        type="button"
                        className={`rss-unit-btn${ls.pricePer === "KILOGRAM" ? " rss-unit-btn--active" : ""}`}
                        onClick={() => updateLine(i, { pricePer: "KILOGRAM" })}
                      >/kg</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sheet-footer">
        <div className="rss-footer-totals">
          <div>
            <span>Seleccionado </span>
            <span className="rss-footer-selected">{formatPrice(selectedTotal)}</span>
            {diff !== null && checkedCount > 0 && (
              Math.abs(diff) < 0.02
                ? <span className="rss-footer-match">✓ coincide</span>
                : <span className="rss-footer-diff">
                    ({diff > 0 ? "+" : "−"}{formatPrice(Math.abs(diff)).replace(" ", "")})
                  </span>
            )}
          </div>
          {receiptTotal != null && (
            <span>Ticket {formatPrice(receiptTotal)}</span>
          )}
        </div>
        <button
          className="confirm-btn"
          disabled={checkedCount === 0}
          onClick={handleConfirm}
        >
          Guardar precios
          <span className="confirm-count">
            {checkedCount} {checkedCount === 1 ? "elemento" : "elementos"}
          </span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | head -30
```

Expected: only errors in `ListScreen.tsx` (passing `{ id, name }` where extended shape now needed) — fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ReceiptScanSheet.tsx
git commit -m "feat: rewrite ReceiptScanSheet with unified row model"
```

---

## Task 6: Update `ListScreen` — extend `purchasedItems` mapping

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx` (the `purchasedItems` prop passed to `<ReceiptScanSheet>`)

- [ ] **Step 1: Find the current mapping**

Current code in `ListScreen.tsx` (~line 753):
```tsx
purchasedItems={items
  .filter((i) => i.purchased)
  .map((i) => ({ id: i.id, name: i.name }))}
```

- [ ] **Step 2: Extend to pass all required fields**

```tsx
purchasedItems={items
  .filter((i) => i.purchased)
  .map((i) => ({
    id: i.id,
    name: i.name,
    purchased_at: i.purchased_at,
    brand: i.brand,
    stores: i.stores,
    quantity: i.quantity,
  }))}
```

- [ ] **Step 3: Typecheck — expect clean**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ListScreen.tsx
git commit -m "feat: pass purchased_at/brand/stores/quantity to ReceiptScanSheet"
```

---

## Task 7: Rewrite frontend tests

**Files:**
- Modify: `frontend/src/components/ReceiptScanSheet.test.tsx`

- [ ] **Step 1: Replace the entire test file**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ReceiptScanSheet from "./ReceiptScanSheet";
import type { ReceiptScanResult } from "../types/receipt";

const mockResult: ReceiptScanResult = {
  scan_id: "scan-1",
  store: "Mercadona",
  receipt_date: "2026-04-11",
  receipt_total: 6.45,
  matched: [
    {
      receipt_name: "BEBIDA ALMENDRAS 0%",
      item_id: "item-1",
      item_name: "Bebida de almendra 0% azúcares",
      price_type: "UNIT",
      unit_price: 1.15,
      quantity: null,
      line_total: 1.15,
    },
    {
      receipt_name: "BACON LONCHAS",
      item_id: "item-2",
      item_name: "Bacon lonchas",
      price_type: "KILOGRAM",
      unit_price: 11.40,
      quantity: 0.202,
      line_total: 2.30,
    },
    {
      receipt_name: "YOGUR NATURAL",
      item_id: "item-3",
      item_name: "Yogur natural",
      price_type: "MULTI",
      unit_price: 0.95,
      quantity: 3,
      line_total: 2.85,
    },
  ],
  unmatched: [
    {
      receipt_name: "MANI DULCE",
      price_type: "UNIT",
      unit_price: 3.15,
      quantity: null,
      line_total: 3.15,
    },
  ],
};

const mockPurchasedItems = [
  { id: "item-1", name: "Bebida de almendra 0% azúcares", purchased_at: "2026-04-11T15:00:00", brand: null, stores: ["Mercadona"], quantity: null },
  { id: "item-2", name: "Bacon lonchas",                  purchased_at: "2026-04-11T15:00:00", brand: null, stores: ["Mercadona"], quantity: null },
  { id: "item-3", name: "Yogur natural",                  purchased_at: "2026-04-11T15:00:00", brand: null, stores: [],            quantity: null },
  { id: "item-4", name: "Maní dulce",                     purchased_at: "2026-04-10T12:00:00", brand: null, stores: [],            quantity: null },
];

function renderSheet(overrides: Partial<ReceiptScanResult> = {}) {
  const result = { ...mockResult, ...overrides };
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ReceiptScanSheet
      result={result}
      purchasedItems={mockPurchasedItems}
      store="Mercadona"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
  return { onConfirm, onClose };
}

describe("ReceiptScanSheet", () => {
  it("shows store name and receipt total", () => {
    renderSheet();
    expect(screen.getByText("Mercadona")).toBeInTheDocument();
    expect(screen.getByText(/6[.,]45/)).toBeInTheDocument();
  });

  it("renders OCR names for all lines", () => {
    renderSheet();
    expect(screen.getByText("BEBIDA ALMENDRAS 0%")).toBeInTheDocument();
    expect(screen.getByText("BACON LONCHAS")).toBeInTheDocument();
    expect(screen.getByText("YOGUR NATURAL")).toBeInTheDocument();
    expect(screen.getByText("MANI DULCE")).toBeInTheDocument();
  });

  it("matched items start checked, unmatched start unchecked", () => {
    renderSheet();
    const checkboxes = screen.getAllByRole("checkbox");
    // 3 matched + 1 unmatched = 4 rows
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeChecked();
    expect(checkboxes[3]).not.toBeChecked();
  });

  it("toolbar shows correct count", () => {
    renderSheet();
    expect(screen.getByText("3 de 4 seleccionados")).toBeInTheDocument();
  });

  it("toggle-all selects all when not all checked", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Seleccionar todo"));
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
    expect(screen.getByText("4 de 4 seleccionados")).toBeInTheDocument();
  });

  it("toggle-all deselects all when all are checked", () => {
    renderSheet();
    fireEvent.click(screen.getByText("Seleccionar todo")); // select all
    fireEvent.click(screen.getByText("Deseleccionar todo")); // deselect all
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it("shows quantity × price summary for KILOGRAM items", () => {
    renderSheet();
    // 0.202 kg → 202g; 11.40 €/kg
    expect(screen.getByText(/202g/)).toBeInTheDocument();
    expect(screen.getByText(/11[.,]40.*€\/kg/)).toBeInTheDocument();
  });

  it("shows quantity × price summary for MULTI items", () => {
    renderSheet();
    expect(screen.getByText(/3.*€\/ud/)).toBeInTheDocument();
  });

  it("shows 'sin vincular' for unmatched items", () => {
    renderSheet();
    expect(screen.getByText("sin vincular")).toBeInTheDocument();
  });

  it("unchecking a matched item updates toolbar count", () => {
    renderSheet();
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(screen.getByText("2 de 4 seleccionados")).toBeInTheDocument();
  });

  it("two lines with the same receipt_name have independent checkboxes", () => {
    const result: ReceiptScanResult = {
      ...mockResult,
      matched: [
        { ...mockResult.matched[0], receipt_name: "LECHE", item_id: "item-1" },
        { ...mockResult.matched[1], receipt_name: "LECHE", item_id: "item-2" },
      ],
      unmatched: [],
    };
    render(
      <ReceiptScanSheet
        result={result}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // uncheck first
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked(); // second unaffected
  });

  it("onConfirm called with patches including quantity", () => {
    const { onConfirm } = renderSheet();
    fireEvent.click(screen.getByText(/Guardar precios/));
    expect(onConfirm).toHaveBeenCalledOnce();
    const [patches] = onConfirm.mock.calls[0];
    expect(patches).toHaveLength(3); // 3 matched, 0 unmatched linked

    const unit = patches.find((p: { item_id: string }) => p.item_id === "item-1");
    expect(unit.price).toBe(1.15);
    expect(unit.price_per).toBeNull();
    expect(unit.quantity).toBe("1");

    const kg = patches.find((p: { item_id: string }) => p.item_id === "item-2");
    expect(kg.price).toBeCloseTo(11.40);
    expect(kg.price_per).toBe("KILOGRAM");
    expect(kg.quantity).toBe("202g");

    const multi = patches.find((p: { item_id: string }) => p.item_id === "item-3");
    expect(multi.price).toBeCloseTo(0.95);
    expect(multi.price_per).toBeNull();
    expect(multi.quantity).toBe("3");
  });

  it("footer shows selected total and receipt total", () => {
    renderSheet();
    // selected: 1.15 + 2.302 + 2.85 = 6.302 ≈ 6.30; receipt: 6.45
    expect(screen.getByText(/Seleccionado/)).toBeInTheDocument();
    expect(screen.getByText(/Ticket/)).toBeInTheDocument();
  });

  it("footer shows coincide when totals match within 2 cents", () => {
    // receipt_total matches sum of matched items exactly
    const result: ReceiptScanResult = {
      ...mockResult,
      receipt_total: 1.15,
      matched: [mockResult.matched[0]],
      unmatched: [],
    };
    render(
      <ReceiptScanSheet
        result={result}
        purchasedItems={mockPurchasedItems}
        store="Mercadona"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/coincide/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd frontend && npm run test -- src/components/ReceiptScanSheet.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Run full frontend test suite to check for regressions**

```bash
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ReceiptScanSheet.test.tsx
git commit -m "test: rewrite ReceiptScanSheet tests for redesigned component"
```

---

## Task 8: Final validation

- [ ] **Step 1: Full typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 2: Frontend lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Full backend test suite**

```bash
cd backend && uv run pytest
```

Expected: all tests pass.

- [ ] **Step 4: Or run everything at once**

```bash
just ci
```

Expected: typecheck + lint + backend tests all pass.
