# Delete a Logged Price Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete a mistakenly-logged price on the current shopping day via a button in the existing `LogPriceSheet`.

**Architecture:** A new `DELETE /lists/{list_id}/items/{item_id}/prices` endpoint nulls out the three price fields on the `list_item` row. The frontend adds a `clearItemPrice` hook action (API call + local state update) and surfaces a conditional "Eliminar precio" button in `LogPriceSheet` — visible only when the item has a price and was purchased today (or hasn't been purchased yet). The same-day guard is enforced server-side (409) and hidden client-side by a `isSameCalendarDay` helper.

**Tech Stack:** FastAPI + SQLModel (backend), React + TypeScript + Vitest + Testing Library (frontend)

---

## Files

| Action | Path |
|--------|------|
| Modify | `backend/app/routers/prices.py` |
| Modify | `backend/tests/test_prices.py` |
| Modify | `frontend/src/lib/api.ts` |
| Modify | `frontend/src/hooks/useListItems.ts` |
| Modify | `frontend/src/components/LogPriceSheet.tsx` |
| Modify | `frontend/src/components/LogPriceSheet.css` |
| Modify | `frontend/src/components/ListScreen.tsx` |
| Create | `frontend/src/components/LogPriceSheet.test.tsx` |

---

## Task 1: Backend — `DELETE /prices` endpoint

**Files:**
- Modify: `backend/app/routers/prices.py`
- Test: `backend/tests/test_prices.py`

- [ ] **Step 1: Write four failing tests**

Append to `backend/tests/test_prices.py`:

```python
# --- DELETE ---

def test_delete_price_clears_fields(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99, store="Mercadona")

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 204

    items = client.get(f"/lists/{lst['id']}/items").json()
    updated = next(i for i in items if i["id"] == item["id"])
    assert updated["price"] is None
    assert updated["price_store"] is None


def test_delete_price_404_if_no_price(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 404


def test_delete_price_409_if_purchased_previous_day(client: TestClient, session):
    from datetime import timedelta
    from app.db.models import ListItem as DBListItem

    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    db_item = session.get(DBListItem, item["id"])
    db_item.purchased_at = db_item.purchased_at - timedelta(days=1)
    session.add(db_item)
    session.commit()

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 409


def test_delete_price_204_if_purchased_today(client: TestClient):
    lst = _make_list(client)
    item = _make_item(client, lst["id"])
    _set_price(client, lst["id"], item["id"], 1.99)
    client.patch(f"/lists/{lst['id']}/items/{item['id']}", json={"purchased": True})

    resp = client.delete(f"/lists/{lst['id']}/items/{item['id']}/prices")
    assert resp.status_code == 204
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_prices.py::test_delete_price_clears_fields tests/test_prices.py::test_delete_price_404_if_no_price tests/test_prices.py::test_delete_price_409_if_purchased_previous_day tests/test_prices.py::test_delete_price_204_if_purchased_today -v
```

Expected: 4 failures — `405 Method Not Allowed` (route doesn't exist yet).

- [ ] **Step 3: Add datetime import and DELETE handler to `prices.py`**

Add to the top of `backend/app/routers/prices.py`, after the existing imports:

```python
from datetime import datetime, timezone
```

Append after the `update_price` handler:

```python
@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_price(
    list_id: str,
    item_id: str,
    session: CurrentSession,
    current_user: CurrentUser,
    _: MemberDep,
):
    item = _get_item_or_404(session, item_id, list_id)
    if item.price is None:
        raise HTTPException(status_code=404, detail="Item has no price to delete")
    if item.purchased_at is not None:
        today = datetime.now(timezone.utc).date()
        if item.purchased_at.date() != today:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete the price of an item purchased on a previous day",
            )
    item.price = None
    item.price_per = None
    item.price_store = None
    session.add(item)
    session.commit()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && uv run pytest tests/test_prices.py -v
```

Expected: all tests pass, including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/prices.py backend/tests/test_prices.py
git commit -m "feat: add DELETE /prices endpoint with same-day guard"
```

---

## Task 2: Frontend — `LogPriceSheet` delete button

**Files:**
- Create: `frontend/src/components/LogPriceSheet.test.tsx`
- Modify: `frontend/src/components/LogPriceSheet.tsx`
- Modify: `frontend/src/components/LogPriceSheet.css`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/LogPriceSheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LogPriceSheet, { isSameCalendarDay } from './LogPriceSheet'
import type { ListItem } from '../types'

const BASE_ITEM: ListItem = {
  id: 'i1', list_id: 'l1',
  name: 'Leche', quantity: null, brand: null, stores: [],
  purchased: false, purchased_at: null, ean: null,
  price: null, price_per: null, price_store: null,
  added_by: 'user-1', created_at: '', updated_at: '',
}

describe('isSameCalendarDay', () => {
  it('returns true for null', () => {
    expect(isSameCalendarDay(null)).toBe(true)
  })

  it('returns true for a timestamp from today', () => {
    expect(isSameCalendarDay(new Date().toISOString())).toBe(true)
  })

  it('returns false for a timestamp from yesterday', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    expect(isSameCalendarDay(yesterday)).toBe(false)
  })
})

describe('LogPriceSheet delete button', () => {
  const baseProps = {
    initialAmount: null,
    initialPricePer: null as null,
    initialStore: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }

  it('is hidden when item has no price', () => {
    render(<LogPriceSheet {...baseProps} item={BASE_ITEM} />)
    expect(screen.queryByRole('button', { name: /eliminar precio/i })).not.toBeInTheDocument()
  })

  it('is shown when item has a price and is unpurchased', () => {
    const item = { ...BASE_ITEM, price: 1.99 }
    render(<LogPriceSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.getByRole('button', { name: /eliminar precio/i })).toBeInTheDocument()
  })

  it('is shown when item has a price and was purchased today', () => {
    const item = { ...BASE_ITEM, price: 1.99, purchased: true, purchased_at: new Date().toISOString() }
    render(<LogPriceSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.getByRole('button', { name: /eliminar precio/i })).toBeInTheDocument()
  })

  it('is hidden when item has a price but was purchased on a previous day', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    const item = { ...BASE_ITEM, price: 1.99, purchased: true, purchased_at: yesterday }
    render(<LogPriceSheet {...baseProps} item={item} initialAmount={1.99} />)
    expect(screen.queryByRole('button', { name: /eliminar precio/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- LogPriceSheet.test.tsx
```

Expected: fails — `isSameCalendarDay` is not exported, `onDelete` prop doesn't exist.

- [ ] **Step 3: Add `isSameCalendarDay` export, `onDelete` prop, `deleting` state, and delete button to `LogPriceSheet.tsx`**

Replace the content of `frontend/src/components/LogPriceSheet.tsx` with:

```tsx
import { useState } from 'react'
import type { ListItem } from '../types'
import './LogPriceSheet.css'

export function isSameCalendarDay(purchasedAt: string | null): boolean {
  if (!purchasedAt) return true
  const today = new Date().toISOString().slice(0, 10)
  return purchasedAt.slice(0, 10) === today
}

interface Props {
  item: ListItem
  initialAmount: number | null
  initialPricePer: 'KILOGRAM' | null
  initialStore: string | null
  suggestedStore?: string | null
  onSave: (amount: number, pricePer: 'KILOGRAM' | null, store: string | null) => void
  onDelete?: () => Promise<void>
  onClose: () => void
}

export default function LogPriceSheet({ item, initialAmount, initialPricePer, initialStore, suggestedStore, onSave, onDelete, onClose }: Props) {
  const stores = item.stores ?? []
  // Guard again here so the component stays self-contained if reused elsewhere
  const effectiveSuggestion = stores.length === 0 ? (suggestedStore ?? null) : null

  const [amountStr, setAmountStr] = useState(initialAmount !== null ? String(initialAmount) : '')
  const [pricePer, setPricePer] = useState<'KILOGRAM' | null>(initialPricePer)
  const [selectedStore, setSelectedStore] = useState<string | null>(initialStore ?? effectiveSuggestion)
  const [addingStore, setAddingStore] = useState(false)
  const [newStore, setNewStore] = useState('')
  const [deleting, setDeleting] = useState(false)

  const amount = parseFloat(amountStr)
  const canSave = !isNaN(amount) && amount > 0
  const canDelete = item.price != null && isSameCalendarDay(item.purchased_at)

  function handleSave() {
    if (!canSave) return
    const finalStore = addingStore && newStore.trim() ? newStore.trim() : selectedStore
    onSave(amount, pricePer, finalStore)
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      // parent shows error toast
    } finally {
      setDeleting(false)
    }
  }

  function handleStoreChip(store: string) {
    setAddingStore(false)
    setSelectedStore(store === selectedStore ? null : store)
  }

  return (
    <div className="lps">
      <div className="lps__handle" />
      <div className="lps__title">💶 Añadir precio</div>
      <div className="lps__subtitle">{item.name}{item.brand ? ` · ${item.brand}` : ''}</div>
      <div className="lps__field">
        <div className="lps__field-label">Precio pagado</div>
        <div className="lps__input-row">
          <span className="lps__euro">€</span>
          <input className="lps__input" type="number" inputMode="decimal" placeholder="0.00"
            value={amountStr} onChange={e => setAmountStr(e.target.value)} min="0" step="0.01" autoFocus />
          <div className="lps__unit-toggle">
            <button className={`lps__unit-btn${pricePer === null ? ' lps__unit-btn--active' : ''}`}
              onClick={() => setPricePer(null)} type="button">/ud</button>
            <button className={`lps__unit-btn${pricePer === 'KILOGRAM' ? ' lps__unit-btn--active' : ''}`}
              onClick={() => setPricePer('KILOGRAM')} type="button">/kg</button>
          </div>
        </div>
        <div className="lps__legend">
          Introduce el precio normalizado: por unidad (ej. €0.89 por un cartón de leche) o por kg (ej. €3.20/kg de arroz a granel).
        </div>
      </div>
      <div className="lps__field lps__field--last">
        <div className="lps__field-label">Tienda</div>
        <div className="lps__chips">
          {stores.map(store => (
            <button key={store}
              className={`lps__chip${selectedStore === store && !addingStore ? ' lps__chip--selected' : ''}`}
              onClick={() => handleStoreChip(store)} type="button">🏪 {store}</button>
          ))}
          {effectiveSuggestion && (
            <button
              className={`lps__chip${selectedStore === effectiveSuggestion && !addingStore ? ' lps__chip--selected' : ''}`}
              onClick={() => handleStoreChip(effectiveSuggestion)} type="button">🏪 {effectiveSuggestion}</button>
          )}
          <button className="lps__chip lps__chip--add" onClick={() => { setSelectedStore(null); setAddingStore(true) }} type="button">+ otra</button>
        </div>
        {addingStore && (
          <input className="lps__new-store" type="text" placeholder="Nombre de la tienda"
            value={newStore} onChange={e => setNewStore(e.target.value)} autoFocus />
        )}
      </div>
      <button className="lps__save" onClick={handleSave} disabled={!canSave} type="button">Guardar</button>
      {canDelete && (
        <button className="lps__delete" onClick={handleDelete} disabled={deleting} type="button">
          {deleting ? 'Eliminando...' : 'Eliminar precio'}
        </button>
      )}
      <button className="lps__cancel" onClick={onClose} type="button">Cancelar</button>
    </div>
  )
}
```

- [ ] **Step 4: Add `.lps__delete` styles to `LogPriceSheet.css`**

Append to `frontend/src/components/LogPriceSheet.css`:

```css
.lps__delete { display: block; text-align: center; font-size: 14px; color: var(--color-danger, #ff453a); padding: 8px; cursor: pointer; background: none; border: none; width: 100%; }
.lps__delete:disabled { opacity: 0.4; }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npm run test -- LogPriceSheet.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/LogPriceSheet.tsx frontend/src/components/LogPriceSheet.css frontend/src/components/LogPriceSheet.test.tsx
git commit -m "feat: add isSameCalendarDay helper and delete button to LogPriceSheet"
```

---

## Task 3: Frontend — API function, hook action, and ListScreen wiring

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useListItems.ts`
- Modify: `frontend/src/components/ListScreen.tsx`

- [ ] **Step 1: Add `deletePrice` to `api.ts`**

Append to `frontend/src/lib/api.ts` (after the `updatePrice` function):

```ts
export function deletePrice(getToken: () => Promise<string>, listId: string, itemId: string) {
  return apiFetch(getToken, `/lists/${listId}/items/${itemId}/prices`, { method: 'DELETE' })
}
```

- [ ] **Step 2: Add `deletePrice` import and `clearItemPrice` to `useListItems.ts`**

In `frontend/src/hooks/useListItems.ts`, add `deletePrice` to the existing import from `../lib/api`:

```ts
import {
  ApiError,
  createItem,
  deleteItem,
  deletePrice,
  getListItems,
  getListMembers,
  getListUpdatedAt,
  logPrice,
  updateItem,
  updatePrice,
} from '../lib/api'
```

Then add the `clearItemPrice` callback after the `savePrice` callback (around line 292):

```ts
const clearItemPrice = useCallback(
  async (itemId: string) => {
    await deletePrice(getToken, listId, itemId)
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, price: null, price_per: null, price_store: null }
          : i,
      ),
    )
  },
  [getToken, listId],
)
```

Add `clearItemPrice` to the return object of `useListItems`:

```ts
return {
  status,
  items,
  members,
  togglePurchased,
  addItem,
  updateTag,
  updateStores,
  renameItem,
  removeItem,
  savePrice,
  clearItemPrice,
  retry,
}
```

- [ ] **Step 3: Wire `handleDeletePrice` in `ListScreen.tsx`**

In `frontend/src/components/ListScreen.tsx`, destructure `clearItemPrice` from `useListItems`:

```ts
const {
  status,
  items,
  members,
  togglePurchased,
  addItem,
  updateTag,
  updateStores,
  renameItem,
  removeItem,
  savePrice,
  clearItemPrice,
  retry,
} = useListItems(listId, getToken, setToast);
```

Add `handleDeletePrice` after the existing `handleSavePrice` callback (around line 245):

```ts
const handleDeletePrice = useCallback(async () => {
  if (!logPriceFor) return
  try {
    await clearItemPrice(logPriceFor.itemId)
    setLogPriceFor(null)
    setPriceItemId(null)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // price already gone — treat as success, close sheet
      setLogPriceFor(null)
      setPriceItemId(null)
    } else if (err instanceof ApiError && err.status === 409) {
      setToast('No se puede eliminar el precio de un artículo comprado en otro día')
      throw err
    } else {
      setToast('No se pudo eliminar el precio')
      throw err
    }
  }
}, [logPriceFor, clearItemPrice])
```

Add `onDelete={handleDeletePrice}` to the `<LogPriceSheet>` JSX (around line 560):

```tsx
<LogPriceSheet
  item={logItem}
  initialAmount={logPriceFor.initialAmount}
  initialPricePer={logPriceFor.initialPricePer}
  initialStore={logPriceFor.initialStore}
  suggestedStore={logPriceFor.suggestedStore}
  onSave={handleSavePrice}
  onDelete={handleDeletePrice}
  onClose={() => setLogPriceFor(null)}
/>
```

- [ ] **Step 4: Run typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 6: Run backend tests**

```bash
cd backend && uv run pytest
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useListItems.ts frontend/src/components/ListScreen.tsx
git commit -m "feat: wire delete-price flow through useListItems and ListScreen"
```

---

## Task 4: Mark TODO done

- [ ] **Step 1: Mark the item as done in `TODO.md`**

In `TODO.md`, change:

```
- [ ] **Delete a logged price entry** — users should be able to delete a price entry within the existing 24 h editing window; the delete action should live in the same edit UI (e.g. a "Eliminar" button) and call `DELETE /lists/{id}/items/{item_id}/prices/{price_id}` (endpoint to be added)
```

to:

```
- [x] **Delete a logged price entry** — users should be able to delete a price entry within the existing 24 h editing window; the delete action should live in the same edit UI (e.g. a "Eliminar" button) and call `DELETE /lists/{id}/items/{item_id}/prices/{price_id}` (endpoint to be added)
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "chore: mark delete-price-entry as done in TODO"
```
