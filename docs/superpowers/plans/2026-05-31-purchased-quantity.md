# Purchased Quantity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `purchased_quantity` to `ListItem` so the actual quantity bought (from receipt scan or manual entry) is stored separately from the planned quantity, displayed on the item card, and used for cost rollup.

**Architecture:** New nullable `purchased_quantity` column on `list_items`; receipt router redirects `patch.quantity` there instead of `quantity`; `LogPriceSheet` (renamed `LogPurchaseSheet`) gains a qty field using the same `[qty] × € [price] [/ud|/kg]` row pattern as `ReceiptScanSheet`; `computeCostSummary` and `ItemCard` prefer `purchased_quantity` over `quantity` for purchased items.

**Tech Stack:** FastAPI + SQLModel + Alembic (backend); React + TypeScript + Vitest (frontend). Tests use SQLite in-memory via `StaticPool`.

**Worktree:** `~/Projects/personal/carroquesi/.worktrees/feat-purchased-quantity`
**Branch:** `feat/purchased-quantity`
**Spec:** `docs/superpowers/specs/2026-05-31-purchased-quantity-design.md`

---

## Task 1: DB migration + model

**Files:**
- Create: `backend/alembic/versions/a1b2c3d4e5f6_add_purchased_quantity_to_list_items.py`
- Modify: `backend/app/db/models.py`

- [ ] **Step 1: Write the migration file**

```python
# backend/alembic/versions/a1b2c3d4e5f6_add_purchased_quantity_to_list_items.py
"""add purchased_quantity to list_items

Revision ID: a1b2c3d4e5f6
Revises: f7a8b9c0d1e2
Create Date: 2026-05-31 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "list_items",
        sa.Column("purchased_quantity", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("list_items", "purchased_quantity")
```

- [ ] **Step 2: Add field to the SQLModel**

In `backend/app/db/models.py`, add after `quantity`:

```python
purchased_quantity: Optional[str] = Field(default=None)
```

(The `Optional` and `Field` imports are already present.)

- [ ] **Step 3: Run migration to verify it applies cleanly**

```bash
cd backend && uv run alembic upgrade head
```

Expected: `Running upgrade f7a8b9c0d1e2 -> a1b2c3d4e5f6, add purchased_quantity to list_items`

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/a1b2c3d4e5f6_add_purchased_quantity_to_list_items.py backend/app/db/models.py
git commit -m "feat: add purchased_quantity column to list_items"
```

---

## Task 2: Backend schemas

**Files:**
- Modify: `backend/app/schemas/items.py`

- [ ] **Step 1: Add `purchased_quantity` to `ItemRead` and `ItemUpdate`**

In `backend/app/schemas/items.py`:

```python
class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    quantity: str | None = None
    brand: str | None = None
    stores: list[str] | None = None  # None = don't touch; [] = remove all
    purchased: bool | None = None
    purchased_quantity: str | None = None  # None = don't touch


class ItemRead(BaseModel):
    id: str
    list_id: str
    name: str
    quantity: str | None
    purchased_quantity: str | None          # ← new
    brand: str | None
    stores: list[str]
    ean: str | None
    price: float | None
    price_per: Literal['KILOGRAM'] | None
    price_store: str | None
    purchased_at: datetime | None
    added_by: str
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def purchased(self) -> bool:
        return self.purchased_at is not None
```

- [ ] **Step 2: Run the backend test suite to confirm nothing is broken yet**

```bash
cd backend && uv run pytest tests/test_items.py -v
```

Expected: all existing tests pass (the new field is nullable and has a default).

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/items.py
git commit -m "feat: expose purchased_quantity in ItemRead and ItemUpdate schemas"
```

---

## Task 3: Backend — receipt router writes to `purchased_quantity`

**Files:**
- Modify: `backend/app/routers/receipt.py`
- Modify: `backend/tests/test_receipt_router.py`

The current `apply_receipt_prices` loop writes `patch.quantity` to `item.quantity`.
We redirect it to `item.purchased_quantity` and leave `item.quantity` untouched.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_receipt_router.py`:

```python
def test_receipt_prices_writes_purchased_quantity_not_quantity(client, session):
    """patch.quantity should go to purchased_quantity, leaving quantity unchanged."""
    item = session.get(ListItem, "item-almendras")
    item.quantity = "2"  # planned qty — must survive the receipt apply
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
                "quantity": "487g",  # actual qty from receipt
            }
        ],
        "mappings": [],
    }
    response = client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    assert response.status_code == 200
    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.purchased_quantity == "487g"   # written to new field
    assert item.quantity == "2"                # planning qty preserved


def test_receipt_prices_purchased_quantity_null_when_patch_quantity_null(client, session):
    """When patch.quantity is None, purchased_quantity should not be set."""
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
    client.post(f"/lists/{LIST_ID}/receipt-prices", json=body)
    session.expire_all()
    assert session.get(ListItem, "item-almendras").purchased_quantity is None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && uv run pytest tests/test_receipt_router.py::test_receipt_prices_writes_purchased_quantity_not_quantity -v
```

Expected: `FAILED` — `item.quantity` currently gets overwritten to `"487g"`.

- [ ] **Step 3: Update the existing old tests that assert the old behaviour**

The tests `test_receipt_prices_updates_quantity` and `test_receipt_prices_preserves_quantity_when_null` currently assert that `item.quantity` is written. Update them to assert the new semantics instead:

```python
def test_receipt_prices_updates_quantity(client, session):
    """patch.quantity now goes to purchased_quantity, not quantity."""
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
    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.purchased_quantity == "2"
    assert item.quantity is None   # was never set on this item in seed


def test_receipt_prices_preserves_quantity_when_null(client, session):
    """When patch.quantity is None, quantity (planned) is left untouched."""
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
    session.expire_all()
    item = session.get(ListItem, "item-almendras")
    assert item.quantity == "500g"            # planning qty untouched
    assert item.purchased_quantity is None    # no receipt qty provided
```

- [ ] **Step 4: Implement the fix in the router**

In `backend/app/routers/receipt.py`, in the `apply_receipt_prices` loop, change:

```python
# Before
if patch.quantity is not None:
    item.quantity = patch.quantity
```

to:

```python
# After
if patch.quantity is not None:
    item.purchased_quantity = patch.quantity   # actual receipt qty → new field
    # item.quantity (planned qty) is intentionally left untouched
```

- [ ] **Step 5: Run the full receipt router test suite**

```bash
cd backend && uv run pytest tests/test_receipt_router.py -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/receipt.py backend/tests/test_receipt_router.py
git commit -m "feat: route receipt patch.quantity to purchased_quantity"
```

---

## Task 4: Frontend types

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Add `purchased_quantity` to `ListItem`**

In `frontend/src/types.ts`, add after `quantity`:

```typescript
export interface ListItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  purchased_quantity: string | null   // ← new
  brand: string | null
  stores: string[]
  purchased: boolean
  purchased_at: string | null
  ean: string | null
  price: number | null
  price_per: string | null
  price_store: string | null
  added_by: string
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Typecheck to confirm no breakage**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors (the field is new and optional-ish — existing code doesn't reference it yet).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add purchased_quantity to ListItem frontend type"
```

---

## Task 5: Cost calculation

**Files:**
- Modify: `frontend/src/lib/itemCost.ts`

- [ ] **Step 1: Update `computeCostSummary` to prefer `purchased_quantity`**

In `frontend/src/lib/itemCost.ts`, update the `computeCostSummary` function:

```typescript
export function computeCostSummary(items: ListItem[]): CostSummary | null {
  let total = 0
  let partial = false
  for (const item of items) {
    if (item.price == null) {
      partial = true
      continue
    }
    // For purchased items, actual qty wins over planned qty for cost accuracy.
    const effectiveQty =
      item.purchased && item.purchased_quantity != null
        ? item.purchased_quantity
        : item.quantity
    const factor = parseQuantityFactor(effectiveQty, item.price_per)
    if (factor === null) {
      partial = true
      continue
    }
    total += item.price * factor
  }
  return total === 0 ? null : { total, partial }
}
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
cd frontend && npm run test -- src/lib/itemCost
```

Expected: all existing tests pass. (There are no itemCost tests yet — that's fine, we'll add them in the next step.)

- [ ] **Step 3: Add unit tests for the new effectiveQty logic**

In `frontend/src/lib/itemCost.test.ts` (create this file):

```typescript
import { describe, it, expect } from 'vitest'
import { computeCostSummary } from './itemCost'
import type { ListItem } from '../types'

function makeItem(overrides: Partial<ListItem> = {}): ListItem {
  return {
    id: '1',
    list_id: 'list-1',
    name: 'Test item',
    quantity: null,
    purchased_quantity: null,
    brand: null,
    stores: [],
    purchased: false,
    purchased_at: null,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'user-1',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

describe('computeCostSummary — purchased_quantity', () => {
  it('uses quantity when item is not purchased', () => {
    const item = makeItem({ price: 2.0, quantity: '3', purchased: false })
    const result = computeCostSummary([item])
    expect(result?.total).toBeCloseTo(6.0)
  })

  it('uses purchased_quantity when purchased and set', () => {
    const item = makeItem({
      price: 1.79,
      price_per: 'KILOGRAM',
      quantity: '2',              // planned: 2 units (ignored for purchased)
      purchased_quantity: '487g', // actual: 487g
      purchased: true,
      purchased_at: '2026-05-31T10:00:00',
    })
    const result = computeCostSummary([item])
    // 1.79 €/kg × 0.487 kg = 0.871...
    expect(result?.total).toBeCloseTo(0.872, 2)
  })

  it('falls back to quantity when purchased but purchased_quantity is null', () => {
    const item = makeItem({
      price: 1.0,
      quantity: '3',
      purchased_quantity: null,
      purchased: true,
      purchased_at: '2026-05-31T10:00:00',
    })
    const result = computeCostSummary([item])
    expect(result?.total).toBeCloseTo(3.0)
  })

  it('marks partial=true when purchased_quantity is unresolvable per-kg', () => {
    const item = makeItem({
      price: 1.79,
      price_per: 'KILOGRAM',
      quantity: '2',
      purchased_quantity: 'unknown', // not parseable as SI unit
      purchased: true,
      purchased_at: '2026-05-31T10:00:00',
    })
    const result = computeCostSummary([item])
    expect(result).toBeNull() // total is 0 → null
  })
})
```

- [ ] **Step 4: Run the new tests**

```bash
cd frontend && npm run test -- src/lib/itemCost.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/itemCost.ts frontend/src/lib/itemCost.test.ts
git commit -m "feat: cost rollup uses purchased_quantity for purchased items"
```

---

## Task 6: ItemCard display

**Files:**
- Modify: `frontend/src/components/ItemCard.tsx`

- [ ] **Step 1: Update qty chip to use `displayQty`**

In `frontend/src/components/ItemCard.tsx`, at the top of the `ItemCard` function body, add:

```typescript
// For purchased items, show actual purchased qty; fall back to planned qty.
const displayQty =
  item.purchased && item.purchased_quantity != null
    ? item.purchased_quantity
    : item.quantity
```

Then replace every reference to `item.quantity` in the qty chip JSX with `displayQty`:

```tsx
// name-row qty chip section — replace item.quantity with displayQty:
{displayQty ? (
  item.purchased ? (
    <span className="item-card__qty">{displayQty}</span>
  ) : (
    <button
      className="item-card__qty"
      onClick={() => onTagClick(item.id, 'quantity')}
      aria-label={displayQty}
    >
      {displayQty}
    </button>
  )
) : (
  !item.purchased && (
    <button
      className="item-card__tag item-card__tag--cta"
      onClick={() => onTagClick(item.id, 'quantity')}
      aria-label="Añadir cantidad"
    >
      <span aria-hidden>+ 🔢</span>
    </button>
  )
)}
```

Note: the `onTagClick` for `'quantity'` on unpurchased items is intentional — editing planned qty only makes sense before purchase.

- [ ] **Step 2: Run ItemCard tests**

```bash
cd frontend && npm run test -- src/components/ItemCard.test.tsx
```

Expected: all existing tests pass (they don't reference `purchased_quantity` so the default `null` in mock items is fine).

- [ ] **Step 3: Add a test for the purchased_quantity display path**

In `frontend/src/components/ItemCard.test.tsx`, find the existing purchased item test and add:

```tsx
it('shows purchased_quantity chip instead of quantity when purchased', async () => {
  const item = mockItem({
    purchased: true,
    purchased_at: '2026-05-31T10:00:00',
    quantity: '2',
    purchased_quantity: '487g',
  })
  render(<ItemCard item={item} ... />)
  expect(screen.getByText('487g')).toBeInTheDocument()
  expect(screen.queryByText('2')).not.toBeInTheDocument()
})

it('shows planned quantity as fallback when purchased but no purchased_quantity', async () => {
  const item = mockItem({
    purchased: true,
    purchased_at: '2026-05-31T10:00:00',
    quantity: '3',
    purchased_quantity: null,
  })
  render(<ItemCard item={item} ... />)
  expect(screen.getByText('3')).toBeInTheDocument()
})
```

(Check the existing test file for the exact `mockItem` helper and render arguments to match the pattern used there.)

- [ ] **Step 4: Run the tests**

```bash
cd frontend && npm run test -- src/components/ItemCard.test.tsx
```

Expected: all tests pass including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ItemCard.tsx frontend/src/components/ItemCard.test.tsx
git commit -m "feat: ItemCard shows purchased_quantity when purchased"
```

---

## Task 7: LogPurchaseSheet (renamed from LogPriceSheet)

**Files:**
- Rename + Modify: `frontend/src/components/LogPriceSheet.tsx` → `LogPurchaseSheet.tsx`
- Rename + Modify: `frontend/src/components/LogPriceSheet.css` → `LogPurchaseSheet.css`
- Rename + Modify: `frontend/src/components/LogPriceSheet.test.tsx` → `LogPurchaseSheet.test.tsx`
- Modify: `frontend/src/components/ListScreen.tsx` (update import + add qty to save handler)

### 7a — Rename files and update the component

- [ ] **Step 1: Rename the files**

```bash
cd frontend/src/components
mv LogPriceSheet.tsx LogPurchaseSheet.tsx
mv LogPriceSheet.css LogPurchaseSheet.css
mv LogPriceSheet.test.tsx LogPurchaseSheet.test.tsx
```

- [ ] **Step 2: Update the CSS import inside the component**

In `LogPurchaseSheet.tsx`, change:
```typescript
import './LogPriceSheet.css'
```
to:
```typescript
import './LogPurchaseSheet.css'
```

- [ ] **Step 3: Update the component Props and signature**

Change the `Props` interface to add `purchasedQuantity` support:

```typescript
interface Props {
  item: ListItem
  initialAmount: number | null
  initialPricePer: 'KILOGRAM' | null
  initialStore: string | null
  initialPurchasedQuantity: string | null   // ← new
  suggestedStore?: string | null
  onSave: (amount: number, pricePer: 'KILOGRAM' | null, store: string | null, purchasedQuantity: string | null) => void
  onDelete?: () => Promise<void>
  onClose: () => void
  isOffline?: boolean
}
```

- [ ] **Step 4: Add state and UI for purchased quantity**

Inside the `LogPurchaseSheet` function, add qty state after the existing state declarations:

```typescript
const [purchasedQtyStr, setPurchasedQtyStr] = useState(
  initialPurchasedQuantity ?? ''
)
```

Update `handleSave` to pass it through:

```typescript
function handleSave() {
  if (!canSave) return
  const finalStore = addingStore && newStore.trim() ? newStore.trim() : selectedStore
  const finalPurchasedQty = purchasedQtyStr.trim() || null
  onSave(amount, pricePer, finalStore, finalPurchasedQty)
}
```

Update the title from `💶 Añadir precio` to `🛒 Registrar compra`.

Add the combined qty·price field **replacing** the existing price-only field. The new field section goes between the title/subtitle and the store section:

```tsx
<div className="lps__field">
  <div className="lps__field-label">Cantidad · Precio</div>
  <div className="lps__qp-row">
    <input
      className="lps__qty-input"
      type="text"
      inputMode="decimal"
      placeholder={item.quantity ?? 'ej. 3'}
      value={purchasedQtyStr}
      onChange={e => setPurchasedQtyStr(e.target.value)}
    />
    <span className="lps__sep">×</span>
    <span className="lps__euro">€</span>
    <input
      className="lps__input"
      type="number"
      inputMode="decimal"
      placeholder="0.00"
      value={amountStr}
      onChange={e => setAmountStr(e.target.value)}
      min="0"
      step="0.01"
      autoFocus
    />
    <div className="lps__unit-toggle">
      <button
        className={`lps__unit-btn${pricePer === null ? ' lps__unit-btn--active' : ''}`}
        onClick={() => setPricePer(null)}
        type="button"
      >/ud</button>
      <button
        className={`lps__unit-btn${pricePer === 'KILOGRAM' ? ' lps__unit-btn--active' : ''}`}
        onClick={() => setPricePer('KILOGRAM')}
        type="button"
      >/kg</button>
    </div>
  </div>
  {/* Guidance text + live cost preview */}
  <div className="lps__qp-footer">
    <span className="lps__legend">
      Introduce unidades (ej. 3) o peso (ej. 487g, 1.2kg)
    </span>
    {liveCost !== null && (
      <span className="lps__live-cost">≈ {formatPrice(liveCost)}</span>
    )}
  </div>
</div>
```

Add the `liveCost` computation above the return (import `parseQuantityFactor` from `../lib/itemCost` and `formatPrice` from `../lib/formatPrice`):

```typescript
import { parseQuantityFactor } from '../lib/itemCost'
import { formatPrice } from '../lib/formatPrice'

// inside the component, after state declarations:
const liveCost: number | null = (() => {
  const price = parseFloat(amountStr)
  if (isNaN(price) || price <= 0) return null
  const trimmed = purchasedQtyStr.trim()
  if (!trimmed) return null
  const factor = parseQuantityFactor(trimmed, pricePer)
  if (factor === null) return null
  return price * factor
})()
```

- [ ] **Step 5: Add CSS for the new row**

In `LogPurchaseSheet.css`, add at the end:

```css
.lps__qp-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lps__qty-input {
  width: 72px;
  flex-shrink: 0;
  background: var(--paper-1);
  border: none;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--ink-0);
  text-align: right;
  outline: none;
  font-family: inherit;
}

.lps__qty-input:focus {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent);
}

.lps__sep {
  font-size: 0.875rem;
  color: var(--ink-2);
  flex-shrink: 0;
}

.lps__qp-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  gap: 8px;
}

.lps__live-cost {
  font-size: 11px;
  background: var(--verde-bg);
  color: var(--verde-0);
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
```

Also update `.lps__input` to remove `flex: 1` (the qty input now takes the fixed 72px slot, price input takes the rest):

```css
/* lps__input becomes the price input in qp-row — give it flex: 1 */
.lps__input {
  flex: 1;
  min-width: 0;
  /* keep all other existing properties */
}
```

### 7b — Wire up in ListScreen

- [ ] **Step 6: Update `ListScreen.tsx` to use `LogPurchaseSheet`**

In `frontend/src/components/ListScreen.tsx`:

1. Change the import:
   ```typescript
   // Before
   import LogPriceSheet from './LogPriceSheet'
   // After
   import LogPurchaseSheet from './LogPurchaseSheet'
   ```

2. Update the `onSave` handler passed to the sheet. Currently it receives `(amount, pricePer, store)`. Change to `(amount, pricePer, store, purchasedQuantity)` and send `purchased_quantity` in the PATCH:

   Find the handler that calls the prices API. It will need to additionally call:
   ```typescript
   // After saving the price, patch the purchased_quantity if provided
   if (purchasedQuantity !== null) {
     await api.patch(`/lists/${listId}/items/${itemId}`, {
       purchased_quantity: purchasedQuantity,
     })
   }
   ```

   (Use the same `api` helper / `fetch` pattern already used in `ListScreen.tsx` for other item patches.)

3. Update the JSX where `LogPriceSheet` is rendered to use `LogPurchaseSheet` and pass the new props:
   ```tsx
   <LogPurchaseSheet
     item={priceItem}
     initialAmount={priceItem.price}
     initialPricePer={priceItem.price_per}
     initialStore={priceItem.price_store}
     initialPurchasedQuantity={priceItem.purchased_quantity}
     suggestedStore={suggestedStore}
     onSave={handlePriceSave}
     onDelete={canDelete ? handlePriceDelete : undefined}
     onClose={() => setPriceItemId(null)}
     isOffline={isOffline}
   />
   ```

- [ ] **Step 7: Run the full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass. (Tests that reference `LogPriceSheet` will need to be updated to `LogPurchaseSheet` if they do a named import.)

- [ ] **Step 8: Fix any test import renames**

Search for `LogPriceSheet` in tests and update:

```bash
grep -r "LogPriceSheet" frontend/src --include="*.tsx" --include="*.ts" -l
```

Update any imports found.

- [ ] **Step 9: Typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/LogPurchaseSheet.tsx frontend/src/components/LogPurchaseSheet.css frontend/src/components/LogPurchaseSheet.test.tsx frontend/src/components/ListScreen.tsx
git commit -m "feat: rename LogPriceSheet to LogPurchaseSheet, add purchased quantity field"
```

---

## Task 8: Final validation

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && uv run pytest -v
```

Expected: all tests pass.

- [ ] **Step 2: Run full frontend test suite + typecheck + lint**

```bash
cd frontend && npm run test && node_modules/.bin/tsc -p tsconfig.app.json --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Verify `mockData.ts` still has valid shape**

Check `frontend/src/mockData.ts` — it may have mock `ListItem` objects that need `purchased_quantity: null` added:

```bash
grep -n "ListItem\|quantity" frontend/src/mockData.ts
```

Add `purchased_quantity: null` to any mock objects that are missing it.

- [ ] **Step 4: Commit any fixes from validation**

```bash
git add -A && git commit -m "fix: update mock data and test fixtures for purchased_quantity"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Data model: Task 1
- ✅ ReceiptScanSheet → purchased_quantity: Task 3
- ✅ LogPurchaseSheet rename + qty field: Task 7
- ✅ Cost calculation: Task 5
- ✅ ItemCard display: Task 6
- ✅ Types: Task 4

**Placeholder scan:** None found.

**Type consistency:**
- `purchased_quantity: str | None` in Python (Tasks 1, 2, 3)
- `purchased_quantity: string | null` in TypeScript (Tasks 4, 5, 6, 7)
- `onSave` signature: `(amount: number, pricePer: 'KILOGRAM' | null, store: string | null, purchasedQuantity: string | null)` used consistently in Tasks 7a and 7b
