# List Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing store-chip bar with a `FilterBar` that slides between chip mode and a full text+sigil search mode, filtering list items client-side.

**Architecture:** A new `useItemFilter(items, query)` hook parses a query string using the existing `parseInput` utility and returns filtered items. A new `FilterBar` component manages a slide animation between chip mode and search mode, emitting a single `query: string` to `ListScreen`. `ListScreen` replaces `StoreFilter` + its manual filter derivation with `FilterBar` + `useItemFilter`.

**Tech Stack:** React + TypeScript (Vite), Vitest + @testing-library/react, CSS custom properties (no animation library)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `frontend/src/hooks/useItemFilter.ts` | Pure filter function — parses query, applies AND/OR logic |
| Create | `frontend/src/hooks/useItemFilter.test.ts` | Unit tests for filter logic |
| Create | `frontend/src/components/FilterBar.tsx` | Visual component — chips ↔ search slide animation |
| Create | `frontend/src/components/FilterBar.css` | Animation + chip styles |
| Create | `frontend/src/components/FilterBar.test.tsx` | Unit tests for FilterBar |
| Modify | `frontend/src/components/ItemList.tsx` | Add optional `totalItems` prop for "X de Y" label |
| Modify | `frontend/src/components/ItemList.test.tsx` | Tests for new `totalItems` prop |
| Modify | `frontend/src/components/ListScreen.tsx` | Wire FilterBar + useItemFilter, replace StoreFilter |
| Delete | `frontend/src/components/StoreFilter.tsx` | Superseded by FilterBar |
| Delete | `frontend/src/components/StoreFilter.css` | Superseded by FilterBar.css |
| Delete | `frontend/src/components/StoreFilter.test.tsx` | Superseded by FilterBar.test.tsx |

---

## Task 1: `useItemFilter` hook

**Files:**
- Create: `frontend/src/hooks/useItemFilter.ts`
- Create: `frontend/src/hooks/useItemFilter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hooks/useItemFilter.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import { useItemFilter } from './useItemFilter'
import type { ListItem } from '../types'

const base: ListItem = {
  id: '?', list_id: 'l1', name: '', quantity: null, brand: null,
  stores: [], purchased: false, purchased_at: null, ean: null,
  price: null, price_per: null, price_store: null,
  added_by: 'u1', created_at: '', updated_at: '',
}

const items: ListItem[] = [
  { ...base, id: 'a', name: 'Leche entera',   stores: ['Mercadona'], brand: null },
  { ...base, id: 'b', name: 'Yogur natural',   stores: ['Mercadona'], brand: 'Danone' },
  { ...base, id: 'c', name: 'Manzanas',        stores: ['Lidl'],      brand: null },
  { ...base, id: 'd', name: 'Aceite de oliva', stores: [],            brand: null },
]

describe('useItemFilter', () => {
  test('empty query returns the exact same array reference', () => {
    expect(useItemFilter(items, '')).toBe(items)
  })

  test('name filter is a case-insensitive substring match', () => {
    expect(useItemFilter(items, 'leche').map(i => i.id)).toEqual(['a'])
  })

  test('name filter returns nothing when no item matches', () => {
    expect(useItemFilter(items, 'naranja')).toHaveLength(0)
  })

  test('@store filter includes items at that store', () => {
    const ids = useItemFilter(items, '@Mercadona').map(i => i.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
  })

  test('@store filter always passes items with no stores', () => {
    expect(useItemFilter(items, '@Mercadona').map(i => i.id)).toContain('d')
  })

  test('@store filter hides items assigned to a different store', () => {
    expect(useItemFilter(items, '@Mercadona').map(i => i.id)).not.toContain('c')
  })

  test('multiple @store sigils OR together', () => {
    const ids = useItemFilter(items, '@Mercadona @Lidl').map(i => i.id)
    expect(ids).toContain('a') // Mercadona
    expect(ids).toContain('b') // Mercadona
    expect(ids).toContain('c') // Lidl
    expect(ids).toContain('d') // no stores — always passes
  })

  test('#brand filter matches by brand (case-insensitive)', () => {
    expect(useItemFilter(items, '#danone').map(i => i.id)).toEqual(['b'])
  })

  test('#brand filter hides items with no brand', () => {
    expect(useItemFilter(items, '#Danone').map(i => i.id)).not.toContain('a')
  })

  test('@store and #brand AND together', () => {
    // Only item b is at Mercadona AND has brand Danone
    // Item d passes the store filter (no stores) but fails brand filter (brand is null)
    expect(useItemFilter(items, '@Mercadona #Danone').map(i => i.id)).toEqual(['b'])
  })

  test('free text AND @store together', () => {
    expect(useItemFilter(items, 'leche @Mercadona').map(i => i.id)).toEqual(['a'])
  })

  test('filters purchased items by the same logic as unpurchased', () => {
    const mixed: ListItem[] = [
      { ...base, id: 'x', name: 'Pan', stores: ['Mercadona'], purchased: false },
      { ...base, id: 'y', name: 'Pan', stores: ['Lidl'],      purchased: true, purchased_at: '2026-01-01T10:00:00' },
    ]
    const ids = useItemFilter(mixed, '@Mercadona').map(i => i.id)
    expect(ids).toContain('x')
    expect(ids).not.toContain('y')
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd frontend && npm run test -- src/hooks/useItemFilter.test.ts
```
Expected: error `Cannot find module './useItemFilter'`

- [ ] **Step 3: Implement `useItemFilter`**

Create `frontend/src/hooks/useItemFilter.ts`:

```ts
import { parseInput } from '../parseInput'
import type { ListItem } from '../types'

export function useItemFilter(items: ListItem[], query: string): ListItem[] {
  if (!query) return items

  const parsed = parseInput(query)
  const text = parsed.name.trim().toLowerCase()
  const stores = parsed.stores.map(s => s.toLowerCase())
  const brand = parsed.brand?.toLowerCase() ?? null

  return items.filter(item => {
    if (text && !item.name.toLowerCase().includes(text)) return false

    if (stores.length > 0) {
      const itemStores = item.stores.map(s => s.toLowerCase())
      if (itemStores.length > 0 && !itemStores.some(s => stores.includes(s))) return false
    }

    if (brand !== null && !item.brand?.toLowerCase().includes(brand)) return false

    return true
  })
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd frontend && npm run test -- src/hooks/useItemFilter.test.ts
```
Expected: all 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useItemFilter.ts frontend/src/hooks/useItemFilter.test.ts
git commit -m "feat: add useItemFilter hook with name/store/brand logic"
```

---

## Task 2: `ItemList` — "X de Y" count label

**Files:**
- Modify: `frontend/src/components/ItemList.tsx`
- Modify: `frontend/src/components/ItemList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `frontend/src/components/ItemList.test.tsx`:

```tsx
// ---------------------------------------------------------------------------
// totalItems prop — filtered count label
// ---------------------------------------------------------------------------

test('shows "X de Y" label when totalItems differs from filtered count', () => {
  const items = [makeItem('a')]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} onRetry={() => {}}
      onPriceClick={() => {}} totalItems={3} />
  )
  expect(screen.getByText('1 de 3 productos por comprar')).toBeInTheDocument()
})

test('shows normal label when totalItems equals filtered count', () => {
  const items = [makeItem('a'), makeItem('b')]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} onRetry={() => {}}
      onPriceClick={() => {}} totalItems={2} />
  )
  expect(screen.getByText('2 productos por comprar')).toBeInTheDocument()
})

test('shows normal label when totalItems is omitted', () => {
  const items = [makeItem('a')]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} onRetry={() => {}}
      onPriceClick={() => {}} />
  )
  expect(screen.getByText('1 producto por comprar')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests and confirm the new ones fail**

```bash
cd frontend && npm run test -- src/components/ItemList.test.tsx
```
Expected: 3 new tests FAIL (existing tests should still PASS)

- [ ] **Step 3: Add `totalItems` prop to `ItemList`**

In `frontend/src/components/ItemList.tsx`, change the `Props` interface:

```tsx
interface Props {
  status: Status
  items: ListItem[]
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField | 'stores') => void
  onMenuOpen: (itemId: string) => void
  onRetry: () => void
  onPriceClick: (itemId: string) => void
  pendingCost?: CostSummary | null
  purchasedCostByDate?: Map<string, CostSummary | null>
  totalItems?: number
}
```

Then update the function signature to destructure `totalItems`:

```tsx
export function ItemList({ status, items, members, onTogglePurchased, onTagClick, onMenuOpen, onRetry, onPriceClick, pendingCost, purchasedCostByDate, totalItems }: Props) {
```

Then replace the section label text in the render (currently line ~89):

```tsx
      <p className="item-list__label">
        <span className="item-list__label-text">
          {totalItems !== undefined && totalItems !== active.length
            ? `${active.length} de ${totalItems} productos por comprar`
            : `${active.length} ${active.length === 1 ? 'producto' : 'productos'} por comprar`}
        </span>
        {pendingCost && <CostBadge cost={pendingCost} className="item-list__label-cost" />}
      </p>
```

- [ ] **Step 4: Run tests and confirm they all pass**

```bash
cd frontend && npm run test -- src/components/ItemList.test.tsx
```
Expected: all tests PASS (including the 3 new ones and all pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ItemList.tsx frontend/src/components/ItemList.test.tsx
git commit -m "feat: add totalItems prop to ItemList for filtered count label"
```

---

## Task 3: `FilterBar` component

**Files:**
- Create: `frontend/src/components/FilterBar.tsx`
- Create: `frontend/src/components/FilterBar.css`
- Create: `frontend/src/components/FilterBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/FilterBar.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import { FilterBar } from './FilterBar'

describe('FilterBar', () => {
  test('renders nothing when stores is empty', () => {
    const { container } = render(<FilterBar stores={[]} query="" onChange={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  test('renders search button and chips in chip mode', () => {
    render(<FilterBar stores={['Mercadona', 'Lidl']} query="" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /buscar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mercadona' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lidl' })).toBeInTheDocument()
  })

  test('"Todas" chip is active (aria-pressed=true) when query is empty', () => {
    render(<FilterBar stores={['Mercadona']} query="" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mercadona' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('store chip is active when query is "@StoreName"', () => {
    render(<FilterBar stores={['Mercadona', 'Lidl']} query="@Mercadona" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Mercadona' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Lidl' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking a store chip calls onChange with "@StoreName"', () => {
    const onChange = vi.fn()
    render(<FilterBar stores={['Mercadona']} query="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mercadona' }))
    expect(onChange).toHaveBeenCalledWith('@Mercadona')
  })

  test('clicking "Todas" chip calls onChange with ""', () => {
    const onChange = vi.fn()
    render(<FilterBar stores={['Mercadona']} query="@Mercadona" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  test('clicking the search button reveals the text input', () => {
    render(<FilterBar stores={['Mercadona']} query="" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  test('typing in the search input calls onChange with the typed value', () => {
    const onChange = vi.fn()
    render(<FilterBar stores={['Mercadona']} query="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '@Mercadona leche' } })
    expect(onChange).toHaveBeenCalledWith('@Mercadona leche')
  })

  test('clicking the close button exits search mode and calls onChange("")', () => {
    const onChange = vi.fn()
    render(<FilterBar stores={['Mercadona']} query="" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd frontend && npm run test -- src/components/FilterBar.test.tsx
```
Expected: error `Cannot find module './FilterBar'`

- [ ] **Step 3: Create `FilterBar.css`**

Create `frontend/src/components/FilterBar.css`:

```css
.filter-bar {
  overflow: hidden;
  position: relative;
  height: 38px;
  flex-shrink: 0;
}

.filter-bar__chips {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;
  transition: transform 320ms ease, opacity 320ms ease;
}

.filter-bar__chips::-webkit-scrollbar {
  display: none;
}

.filter-bar__search {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  transform: translateX(-100%);
  opacity: 0;
  transition: transform 320ms ease, opacity 320ms ease;
}

.filter-bar--search-active .filter-bar__chips {
  transform: translateX(100%);
  opacity: 0;
}

.filter-bar--search-active .filter-bar__search {
  transform: translateX(0);
  opacity: 1;
}

.filter-bar__chip {
  flex-shrink: 0;
  padding: 4px 12px;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 999px;
  background: var(--bg, #fff);
  font-size: 0.8rem;
  color: var(--text, #111);
  cursor: pointer;
  font-family: inherit;
}

.filter-bar__chip--active {
  background: var(--accent, #7c3aed);
  border-color: var(--accent, #7c3aed);
  color: #fff;
}

.filter-bar__search-btn,
.filter-bar__close-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-muted, #666);
  padding: 0;
  font-family: inherit;
}

.filter-bar__input {
  flex: 1;
  border: 1px solid var(--border, #e5e5e5);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 0.85rem;
  font-family: inherit;
  background: var(--bg, #fff);
  color: var(--text, #111);
  outline: none;
}

.filter-bar__input:focus {
  border-color: var(--accent, #7c3aed);
}
```

- [ ] **Step 4: Create `FilterBar.tsx`**

Create `frontend/src/components/FilterBar.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import './FilterBar.css'

interface Props {
  stores: string[]
  query: string
  onChange: (q: string) => void
}

export function FilterBar({ stores, query, onChange }: Props) {
  const [mode, setMode] = useState<'chips' | 'search'>('chips')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'search') {
      const id = setTimeout(() => inputRef.current?.focus(), 320)
      return () => clearTimeout(id)
    }
  }, [mode])

  if (stores.length === 0) return null

  const activeChip = stores.find(s => query === `@${s}`) ?? null

  return (
    <div
      className={`filter-bar${mode === 'search' ? ' filter-bar--search-active' : ''}`}
      role="group"
      aria-label="Filtrar"
    >
      <div className="filter-bar__chips">
        <button
          className="filter-bar__search-btn"
          onClick={() => { setMode('search'); onChange('') }}
          aria-label="Buscar"
        >
          🔍
        </button>
        <button
          className={`filter-bar__chip${activeChip === null ? ' filter-bar__chip--active' : ''}`}
          onClick={() => onChange('')}
          aria-pressed={activeChip === null}
        >
          Todas
        </button>
        {stores.map(store => (
          <button
            key={store}
            className={`filter-bar__chip${activeChip === store ? ' filter-bar__chip--active' : ''}`}
            onClick={() => onChange(`@${store}`)}
            aria-pressed={activeChip === store}
          >
            {store}
          </button>
        ))}
      </div>
      <div className="filter-bar__search">
        <button
          className="filter-bar__close-btn"
          onClick={() => { setMode('chips'); onChange('') }}
          aria-label="Cerrar búsqueda"
        >
          ✕
        </button>
        <input
          ref={inputRef}
          className="filter-bar__input"
          type="text"
          value={query}
          onChange={e => onChange(e.target.value)}
          placeholder="@tienda #marca nombre…"
          aria-label="Buscar productos"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests and confirm they all pass**

```bash
cd frontend && npm run test -- src/components/FilterBar.test.tsx
```
Expected: all 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FilterBar.tsx frontend/src/components/FilterBar.css frontend/src/components/FilterBar.test.tsx
git commit -m "feat: add FilterBar component with chip/search slide animation"
```

---

## Task 4: Wire `ListScreen` — replace `StoreFilter` with `FilterBar`

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`
- Delete: `frontend/src/components/StoreFilter.tsx`
- Delete: `frontend/src/components/StoreFilter.css`
- Delete: `frontend/src/components/StoreFilter.test.tsx`

- [ ] **Step 1: Update imports in `ListScreen.tsx`**

Replace line:
```tsx
import { StoreFilter } from "./StoreFilter";
```
With:
```tsx
import { FilterBar } from "./FilterBar";
import { useItemFilter } from "../hooks/useItemFilter";
```

- [ ] **Step 2: Replace `storeFilter` state with `filterQuery`**

Remove this line (around line 65):
```tsx
const [storeFilter, setStoreFilter] = useState<string | null>(null);
```
Add in its place:
```tsx
const [filterQuery, setFilterQuery] = useState("");
```

- [ ] **Step 3: Remove `activeStore` derivation and its reset `useEffect`**

Remove these lines (around lines 343–349):
```tsx
// Reset filter if the active store disappears from items
const activeStore =
  storeFilter && stores.includes(storeFilter) ? storeFilter : null;
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  if (storeFilter && !stores.includes(storeFilter)) setStoreFilter(null);
}, [stores, storeFilter]);
```

- [ ] **Step 4: Replace the manual `filteredItems` derivation**

Remove these lines (around lines 351–355):
```tsx
const filteredItems = activeStore
  ? items.filter(
    (i) => i.stores.includes(activeStore) || i.stores.length === 0,
  )
  : items;
```
Add in their place (directly after the `stores` useMemo):
```tsx
const filteredItems = useItemFilter(items, filterQuery);
const allUnpurchasedCount = useMemo(
  () => items.filter(i => !i.purchased).length,
  [items],
);
```

- [ ] **Step 5: Replace `<StoreFilter>` with `<FilterBar>` in JSX**

Replace (around lines 386–390):
```tsx
      <StoreFilter
        stores={stores}
        active={activeStore}
        onSelect={setStoreFilter}
      />
```
With:
```tsx
      <FilterBar
        stores={stores}
        query={filterQuery}
        onChange={setFilterQuery}
      />
```

- [ ] **Step 6: Pass `totalItems` to `<ItemList>`**

Find the `<ItemList>` JSX (around line 391) and add the `totalItems` prop:
```tsx
      <ItemList
        status={status}
        items={filteredItems}
        members={members}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onMenuOpen={handleItemMenuOpen}
        onRetry={retry}
        onPriceClick={(itemId) => setPriceItemId(itemId)}
        pendingCost={pendingCost}
        purchasedCostByDate={purchasedCostByDate}
        totalItems={allUnpurchasedCount}
      />
```

- [ ] **Step 7: Delete the superseded StoreFilter files**

```bash
rm frontend/src/components/StoreFilter.tsx \
   frontend/src/components/StoreFilter.css \
   frontend/src/components/StoreFilter.test.tsx
```

- [ ] **Step 8: Run the full test suite**

```bash
cd frontend && npm run test
```
Expected: all tests PASS (no references to StoreFilter remain)

- [ ] **Step 9: Run typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ListScreen.tsx
git rm frontend/src/components/StoreFilter.tsx \
       frontend/src/components/StoreFilter.css \
       frontend/src/components/StoreFilter.test.tsx
git commit -m "feat: wire FilterBar and useItemFilter into ListScreen (#43)"
```

---

## Self-review checklist (for implementer)

- [ ] `useItemFilter` returns the same reference when query is `""`
- [ ] Store-less items pass any `@store` filter
- [ ] `FilterBar` returns `null` when `stores` is empty
- [ ] `FilterBar` auto-focuses input after 320 ms (matches CSS transition duration)
- [ ] `totalItems` prop on `ItemList` shows "X de Y" only when counts differ
- [ ] No remaining imports of `StoreFilter` anywhere in the codebase
