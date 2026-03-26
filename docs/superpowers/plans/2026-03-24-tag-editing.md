# Tag Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit variety, brand, store, and quantity on existing list items by tapping tag buttons on each item card, which opens a bottom-sheet editor replacing the SmartInputBar.

**Architecture:** `ItemCard` grows tappable tag buttons (and a quantity CTA when null) that fire `onTagClick(itemId, field)` up to `ListScreen`. `ListScreen` tracks `editingTag: EditingTag | null` and swaps `SmartInputBar` for `TagEditSheet` when non-null. `useListItems` gains `updateTag` with the same optimistic-update pattern as `togglePurchased`. A new `clientSideSuggestions` utility is extracted from `SmartInputBar` into `lib/suggestions.ts` and reused by `TagEditSheet`.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react, existing `updateItem` helper in `frontend/src/lib/api.ts`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/types.ts` | Modify | Add `'quantity'` to `TagField`; add `EditingTag` interface |
| `frontend/src/lib/suggestions.ts` | Create | `clientSideSuggestions` pure utility (extracted from SmartInputBar) |
| `frontend/src/lib/suggestions.test.ts` | Create | 6 unit tests for the utility |
| `frontend/src/components/SmartInputBar.tsx` | Modify | Import `clientSideSuggestions` from `lib/suggestions` instead of inlining it |
| `frontend/src/components/SmartInputBar.test.tsx` | Modify | Add client-side suggestion test with `@` sigil |
| `frontend/src/components/ItemCard.tsx` | Modify | Add `onTagClick` prop; quantity span → button; quantity CTA when null |
| `frontend/src/components/ItemCard.test.tsx` | Modify | Add tests for quantity button and quantity CTA |
| `frontend/src/components/ItemList.tsx` | Modify | Thread `onTagClick` prop down to `ItemCard` |
| `frontend/src/components/ItemList.test.tsx` | Modify | Update prop signatures in tests |
| `frontend/src/components/ListHeader.tsx` | Modify | Add `onMenuOpen` prop (stub — wired later) |
| `frontend/src/components/TagEditSheet.tsx` | Create | Bottom sheet editor with input, suggestions, Save/Remove/ESC |
| `frontend/src/components/TagEditSheet.css` | Create | Fixed-bottom layout, same slot as SmartInputBar |
| `frontend/src/components/TagEditSheet.test.tsx` | Create | 12 tests covering all interactions and edge cases |
| `frontend/src/hooks/useListItems.ts` | Modify | Add `updateTag` with optimistic update; export in return value |
| `frontend/src/hooks/useListItems.test.tsx` | Modify | Add 3 `updateTag` tests (success, null-removal, failure+rollback) |
| `frontend/src/components/ListScreen.tsx` | Modify | `editingTag` state, `handleTagClick`, swap SmartInputBar for TagEditSheet |
| `frontend/src/components/ListScreen.test.tsx` | Create | Smoke test: renders list name in header |

---

## Task 1: Extract `clientSideSuggestions` to `lib/suggestions.ts`

**Files:**
- Create: `frontend/src/lib/suggestions.ts`
- Create: `frontend/src/lib/suggestions.test.ts`
- Modify: `frontend/src/components/SmartInputBar.tsx`

Run all commands from `frontend/`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/suggestions.test.ts`:

```typescript
import { clientSideSuggestions } from './suggestions'
import type { ListItem } from '../types'

const items: ListItem[] = [
  { id: '1', list_id: 'l1', name: 'Leche', quantity: '2', variety: 'Entera', brand: 'Hacendado', store: 'Mercadona', purchased: false, added_by: 'u1', created_at: '', updated_at: '' },
  { id: '2', list_id: 'l1', name: 'Yogur', quantity: null, variety: 'Entera', brand: 'Danone', store: 'Carrefour', purchased: false, added_by: 'u1', created_at: '', updated_at: '' },
  { id: '3', list_id: 'l1', name: 'Queso', quantity: null, variety: null, brand: 'Hacendado', store: null, purchased: false, added_by: 'u1', created_at: '', updated_at: '' },
]

test('returns values matching the partial for a field', () => {
  expect(clientSideSuggestions(items, 'brand', 'Hac')).toEqual(['Hacendado'])
})

test('is case-insensitive', () => {
  expect(clientSideSuggestions(items, 'brand', 'hac')).toEqual(['Hacendado'])
})

test('deduplicates values', () => {
  // Entera appears twice (variety of Leche and Yogur)
  expect(clientSideSuggestions(items, 'variety', '')).toEqual(['Entera'])
})

test('returns empty array when no matches', () => {
  expect(clientSideSuggestions(items, 'store', 'xyz')).toEqual([])
})

test('limits results to 5', () => {
  const many: ListItem[] = Array.from({ length: 8 }, (_, i) => ({
    ...items[0], id: String(i), brand: `Brand${i}`,
  }))
  expect(clientSideSuggestions(many, 'brand', 'B')).toHaveLength(5)
})

test('skips null values', () => {
  const result = clientSideSuggestions(items, 'store', '')
  expect(result).not.toContain(null)
})
```

- [ ] **Step 2: Run to verify RED**

```bash
npx vitest run src/lib/suggestions.test.ts
```
Expected: module not found error.

- [ ] **Step 3: Create `lib/suggestions.ts`**

```typescript
import type { ListItem } from '../types'

export function clientSideSuggestions(
  items: ListItem[],
  field: 'variety' | 'brand' | 'store',
  partial: string,
): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  for (const item of items) {
    const val = item[field]
    if (val && val.toLowerCase().startsWith(partial.toLowerCase()) && !seen.has(val)) {
      seen.add(val)
      results.push(val)
    }
  }
  return results.slice(0, 5)
}
```

- [ ] **Step 4: Run to verify GREEN**

```bash
npx vitest run src/lib/suggestions.test.ts
```
Expected: 6 passing.

- [ ] **Step 5: Update `SmartInputBar.tsx` to import from `lib/suggestions`**

Remove the inline suggestion logic from `SmartInputBar.tsx` and add:
```typescript
import { clientSideSuggestions } from '../lib/suggestions'
```

- [ ] **Step 6: Add `@` sigil suggestion test to `SmartInputBar.test.tsx`**

Add this test (verifies client-side suggestions work via the `@` sigil now that the logic is extracted):

```typescript
test('client-side store suggestions filtered from items when @ typed', () => {
  const items: ListItem[] = [
    { id: 'i1', list_id: 'l1', name: 'X', quantity: null, variety: null, brand: null,
      store: 'Mercadona', purchased: false, added_by: 'u1', created_at: '', updated_at: '' },
    { id: 'i2', list_id: 'l1', name: 'Y', quantity: null, variety: null, brand: null,
      store: 'Lidl', purchased: false, added_by: 'u1', created_at: '', updated_at: '' },
  ]
  render(<SmartInputBar value="Leche @Mer" parsed={parseInput('Leche @Mer')} items={items}
    suggestions={[]} onChange={noop} onSubmit={noop} />)
  expect(screen.getByText('Mercadona')).toBeInTheDocument()
  expect(screen.queryByText('Lidl')).not.toBeInTheDocument()
})
```

- [ ] **Step 7: Verify SmartInputBar tests still pass**

```bash
npx vitest run src/components/SmartInputBar.test.tsx
```
Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/suggestions.ts src/lib/suggestions.test.ts src/components/SmartInputBar.tsx src/components/SmartInputBar.test.tsx
git commit -m "feat: extract clientSideSuggestions to lib/suggestions"
```

---

## Task 2: Update `types.ts` — add `'quantity'` to `TagField`, add `EditingTag`

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Update `TagField`**

```typescript
export type TagField = 'variety' | 'brand' | 'store' | 'quantity'

export interface EditingTag {
  itemId: string
  field: TagField
}
```

- [ ] **Step 2: Verify no type regressions**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add quantity to TagField and EditingTag type"
```

---

## Task 3: Add `onTagClick` to `ItemCard` — tappable tags + quantity CTA

**Files:**
- Modify: `frontend/src/components/ItemCard.tsx`
- Modify: `frontend/src/components/ItemCard.test.tsx`
- Modify: `frontend/src/components/ItemList.tsx`
- Modify: `frontend/src/components/ItemList.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `frontend/src/components/ItemCard.test.tsx`:

```typescript
test('quantity is a button that calls onTagClick with quantity field', () => {
  const handler = vi.fn()
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} />)
  fireEvent.click(screen.getByRole('button', { name: /2 unidades/i }))
  expect(handler).toHaveBeenCalledWith('i1', 'quantity')
})

test('shows Add quantity CTA button when quantity is null', () => {
  const handler = vi.fn()
  const item = { ...BASE_ITEM, quantity: null }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} />)
  const btn = screen.getByRole('button', { name: /añadir cantidad/i })
  expect(btn).toBeInTheDocument()
  fireEvent.click(btn)
  expect(handler).toHaveBeenCalledWith('i1', 'quantity')
})
```

Update existing tests to pass `onTagClick={vi.fn()}` / `onTagClick={() => {}}` wherever `ItemCard` is rendered without it.

- [ ] **Step 2: Run to verify RED**

```bash
npx vitest run src/components/ItemCard.test.tsx
```
Expected: failures — `onTagClick` prop missing.

- [ ] **Step 3: Update `ItemCard.tsx`**

Add `onTagClick: (itemId: string, field: TagField) => void` to the Props interface.

Replace the quantity `<span>` with:
```tsx
{item.quantity ? (
  <button
    className="item-card__qty"
    onClick={() => onTagClick(item.id, 'quantity')}
    aria-label={item.quantity}
  >
    {item.quantity}
  </button>
) : (
  <button
    className="item-card__tag item-card__tag--cta"
    onClick={() => onTagClick(item.id, 'quantity')}
    aria-label="Añadir cantidad"
  >
    <span aria-hidden>+ 🔢</span>
  </button>
)}
```

Add `onClick={() => onTagClick(item.id, field)}` to each tag button in `TAG_CONFIG.map(...)`.

- [ ] **Step 4: Thread `onTagClick` through `ItemList`**

Add `onTagClick: (itemId: string, field: TagField) => void` to `ItemList`'s Props interface and pass it down to each `ItemCard`.

- [ ] **Step 5: Run to verify GREEN**

```bash
npx vitest run src/components/ItemCard.test.tsx src/components/ItemList.test.tsx
```
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.test.tsx src/components/ItemList.tsx src/components/ItemList.test.tsx
git commit -m "feat: add onTagClick to ItemCard — tappable tags and quantity CTA"
```

---

## Task 4: Build `TagEditSheet`

**Files:**
- Create: `frontend/src/components/TagEditSheet.tsx`
- Create: `frontend/src/components/TagEditSheet.css`
- Create: `frontend/src/components/TagEditSheet.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/TagEditSheet.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { TagEditSheet } from './TagEditSheet'
import type { ListItem } from '../types'

const BASE_ITEM: ListItem = {
  id: 'i1', list_id: 'l1',
  name: 'Leche entera',
  quantity: '2', variety: 'Entera', brand: 'Hacendado', store: 'Mercadona',
  purchased: false, added_by: 'u1', created_at: '', updated_at: '',
}

const OTHER_ITEMS: ListItem[] = [
  { ...BASE_ITEM, id: 'i2', brand: 'Danone' },
  { ...BASE_ITEM, id: 'i3', brand: 'Pascual' },
]

test('pre-fills input with current field value', () => {
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={[BASE_ITEM]} onSave={() => {}} onClose={() => {}} />)
  expect(screen.getByRole('textbox')).toHaveValue('Hacendado')
})

test('shows empty input when field value is null', () => {
  const item = { ...BASE_ITEM, brand: null }
  render(<TagEditSheet item={item} field="brand" items={[item]} onSave={() => {}} onClose={() => {}} />)
  expect(screen.getByRole('textbox')).toHaveValue('')
})

test('Save button calls onSave with trimmed value', () => {
  const onSave = vi.fn()
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={[BASE_ITEM]} onSave={onSave} onClose={() => {}} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Danone  ' } })
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(onSave).toHaveBeenCalledWith('Danone')
})

test('clearing input and saving calls onSave(null)', () => {
  const onSave = vi.fn()
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={[BASE_ITEM]} onSave={onSave} onClose={() => {}} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(onSave).toHaveBeenCalledWith(null)
})

test('Enter key triggers save', () => {
  const onSave = vi.fn()
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={[BASE_ITEM]} onSave={onSave} onClose={() => {}} />)
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(onSave).toHaveBeenCalledWith('Hacendado')
})

test('ESC key calls onClose', () => {
  const onClose = vi.fn()
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={[BASE_ITEM]} onSave={() => {}} onClose={onClose} />)
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

test('Remove button calls onSave(null)', () => {
  const onSave = vi.fn()
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={[BASE_ITEM]} onSave={onSave} onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))
  expect(onSave).toHaveBeenCalledWith(null)
})

test('Remove button is hidden when field value is null', () => {
  const item = { ...BASE_ITEM, brand: null }
  render(<TagEditSheet item={item} field="brand" items={[item]} onSave={() => {}} onClose={() => {}} />)
  expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
})

test('shows filtered suggestions for brand field', () => {
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={OTHER_ITEMS} onSave={() => {}} onClose={() => {}} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'D' } })
  expect(screen.getByText('Danone')).toBeInTheDocument()
})

test('clicking a suggestion fills the input', () => {
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={OTHER_ITEMS} onSave={() => {}} onClose={() => {}} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'D' } })
  fireEvent.click(screen.getByText('Danone'))
  expect(screen.getByRole('textbox')).toHaveValue('Danone')
})

test('ESC calls onClose even when input is not focused', () => {
  const onClose = vi.fn()
  render(<TagEditSheet item={BASE_ITEM} field="brand" items={[BASE_ITEM]} onSave={() => {}} onClose={onClose} />)
  screen.getByRole('textbox').blur()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

test('does not show suggestions for quantity field', () => {
  render(<TagEditSheet item={BASE_ITEM} field="quantity" items={OTHER_ITEMS} onSave={() => {}} onClose={() => {}} />)
  expect(screen.queryByRole('button', { name: /Danone/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify RED**

```bash
npx vitest run src/components/TagEditSheet.test.tsx
```
Expected: module not found error.

- [ ] **Step 3: Create `TagEditSheet.tsx`**

```typescript
import { useState, useEffect } from 'react'
import './TagEditSheet.css'
import type { ListItem, TagField } from '../types'
import { clientSideSuggestions } from '../lib/suggestions'

const TAG_META: Record<TagField, { emoji: string; label: string }> = {
  variety:  { emoji: '✨', label: 'Variedad' },
  brand:    { emoji: '🏷️', label: 'Marca' },
  store:    { emoji: '🏪', label: 'Tienda' },
  quantity: { emoji: '🔢', label: 'Cantidad' },
}

interface Props {
  item: ListItem
  field: TagField
  items: ListItem[]
  onSave: (value: string | null) => void
  onClose: () => void
}

export function TagEditSheet({ item, field, items, onSave, onClose }: Props) {
  const currentValue = item[field] as string | null
  const [input, setInput] = useState(currentValue ?? '')
  const { emoji, label } = TAG_META[field]

  const suggestions = field !== 'quantity'
    ? clientSideSuggestions(items, field, input)
    : []

  function handleSave() {
    const trimmed = input.trim()
    onSave(trimmed.length > 0 ? trimmed : null)
  }

  useEffect(() => {
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onDocKeyDown)
    return () => document.removeEventListener('keydown', onDocKeyDown)
  }, [onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
  }

  return (
    <div className="tag-edit-sheet">
      <div className="tag-edit-sheet__header">
        <span>{emoji} {label}</span>
        <span className="tag-edit-sheet__item-name"> · {item.name}</span>
      </div>

      <div className="tag-edit-sheet__input-row">
        <input
          className="tag-edit-sheet__input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          aria-label={label}
        />
        <button className="tag-edit-sheet__save" onClick={handleSave} aria-label="Guardar">
          Guardar
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="tag-edit-sheet__suggestions">
          {suggestions.map(s => (
            <button key={s} className="tag-edit-sheet__suggestion" onClick={() => setInput(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {currentValue !== null && (
        <button
          className="tag-edit-sheet__remove"
          onClick={() => onSave(null)}
          aria-label={`Eliminar ${label}`}
        >
          Eliminar {label}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `TagEditSheet.css`**

```css
.tag-edit-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg, #fff);
  border-top: 1px solid var(--color-border, #e5e7eb);
  padding: 10px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 50;
}

.tag-edit-sheet__header {
  font-size: 0.75rem;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 500;
}

.tag-edit-sheet__item-name {
  color: var(--color-text-secondary, #6b7280);
}

.tag-edit-sheet__input-row {
  display: flex;
  gap: 8px;
}

.tag-edit-sheet__input {
  flex: 1;
  padding: 9px 12px;
  border: 1.5px solid var(--color-primary, #7c3aed);
  border-radius: 8px;
  font-size: 1rem;
  background: var(--color-bg, #fff);
  color: var(--color-text, #111827);
  outline: none;
}

.tag-edit-sheet__save {
  padding: 9px 16px;
  background: var(--color-primary, #7c3aed);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.tag-edit-sheet__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-edit-sheet__suggestion {
  padding: 4px 10px;
  background: var(--color-surface, #f3f4f6);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--color-text, #111827);
}

.tag-edit-sheet__remove {
  background: none;
  border: none;
  color: var(--color-danger, #dc2626);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 2px 0;
  text-align: left;
}
```

- [ ] **Step 5: Run to verify GREEN**

```bash
npx vitest run src/components/TagEditSheet.test.tsx
```
Expected: 12 passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/TagEditSheet.tsx src/components/TagEditSheet.css src/components/TagEditSheet.test.tsx
git commit -m "feat: add TagEditSheet component"
```

---

## Task 5: Add `updateTag` to `useListItems`

**Files:**
- Modify: `frontend/src/hooks/useListItems.ts`
- Modify: `frontend/src/hooks/useListItems.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `useListItems.test.tsx` after the `addItem` describe block:

```typescript
describe('useListItems — updateTag', () => {
  it('optimistically updates a tag field', async () => {
    vi.mocked(api.updateItem).mockResolvedValue({} as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.updateTag('item-1', 'brand', 'Danone')
    })

    expect(result.current.items[0].brand).toBe('Danone')
  })

  it('supports setting a tag to null (remove)', async () => {
    const itemWithBrand: ListItem = { ...item1, brand: 'Hacendado' }
    vi.mocked(api.getListItems).mockResolvedValue([itemWithBrand] as never)
    vi.mocked(api.updateItem).mockResolvedValue({} as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.updateTag('item-1', 'brand', null)
    })

    expect(result.current.items[0].brand).toBeNull()
  })

  it('reverts and shows toast on API failure', async () => {
    vi.mocked(api.updateItem).mockRejectedValue(new Error('Network'))
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.updateTag('item-1', 'brand', 'Danone')
    })

    expect(result.current.items[0].brand).toBeNull()
    expect(mockShowToast).toHaveBeenCalledWith('No se pudo actualizar el producto')
  })
})
```

- [ ] **Step 2: Run to verify RED**

```bash
npx vitest run src/hooks/useListItems.test.tsx
```
Expected: 3 failing — `updateTag is not a function`.

- [ ] **Step 3: Implement `updateTag` in `useListItems.ts`**

Add after the `addItem` callback (same optimistic pattern as `togglePurchased`):

```typescript
const updateTag = useCallback(
  async (itemId: string, field: TagField, value: string | null) => {
    const snapshot = itemsRef.current
    setItems(snapshot.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)))
    try {
      await updateItem(getToken, listId, itemId, { [field]: value })
    } catch {
      setItems(snapshot)
      showToast('No se pudo actualizar el producto')
    }
  },
  [getToken, listId, showToast],
)
```

Add `updateTag` to the return value alongside the existing fields.

- [ ] **Step 4: Run to verify GREEN**

```bash
npx vitest run src/hooks/useListItems.test.tsx
```
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useListItems.ts src/hooks/useListItems.test.tsx
git commit -m "feat: add updateTag to useListItems with optimistic update"
```

---

## Task 6: Wire `ListScreen` — `editingTag` state, swap SmartInputBar for TagEditSheet

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`
- Modify: `frontend/src/components/ListHeader.tsx`
- Create: `frontend/src/components/ListScreen.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/ListScreen.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListScreen } from './ListScreen'
import * as AuthContext from '../contexts/AuthContext'
import * as useListItemsModule from '../hooks/useListItems'
import type { ListItem } from '../types'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useListItems')
vi.mock('../lib/api')

const mockGetToken = vi.fn().mockResolvedValue('token')

const emptyHookResult = {
  status: 'success' as const,
  items: [] as ListItem[],
  members: new Map(),
  togglePurchased: vi.fn(),
  addItem: vi.fn(),
  updateTag: vi.fn(),
  retry: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  })
  vi.mocked(useListItemsModule.useListItems).mockReturnValue(emptyHookResult)
})

describe('ListScreen', () => {
  it('renders the list name in the header', () => {
    render(<ListScreen listId="l1" listName="Mercado Semanal" />)
    expect(screen.getByRole('heading', { name: 'Mercado Semanal' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify RED**

```bash
npx vitest run src/components/ListScreen.test.tsx
```
Expected: fails — `updateTag` not in hook return, or import errors.

- [ ] **Step 3: Update `ListScreen.tsx`**

1. Add imports:
```typescript
import { TagEditSheet } from './TagEditSheet'
import type { EditingTag, TagField } from '../types'
```

2. Add state:
```typescript
const [editingTag, setEditingTag] = useState<EditingTag | null>(null)
```

3. Destructure `updateTag` from the hook:
```typescript
const { status, items, members, togglePurchased, addItem, updateTag, retry } =
  useListItems(listId, getToken, setToast)
```

4. Add handler:
```typescript
const handleTagClick = useCallback((itemId: string, field: TagField) => {
  setEditingTag({ itemId, field })
}, [])
```

5. Pass `onTagClick` to `ItemList`:
```tsx
<ItemList ... onTagClick={handleTagClick} />
```

6. Swap SmartInputBar for TagEditSheet:
```tsx
{editingTag ? (
  <TagEditSheet
    key={`${editingTag.itemId}-${editingTag.field}`}
    item={items.find(i => i.id === editingTag.itemId)!}
    field={editingTag.field}
    items={items}
    onSave={(value) => { void updateTag(editingTag.itemId, editingTag.field, value); setEditingTag(null) }}
    onClose={() => setEditingTag(null)}
  />
) : (
  <SmartInputBar ... />
)}
```

Note: The `key` prop forces a fresh component mount when the user taps a different tag — resets the input to the new field's current value.

- [ ] **Step 4: Add `onMenuOpen` stub to `ListHeader`**

`ListScreen` renders `<ListHeader onMenuOpen={() => {}} .../>`. Add the prop to `ListHeader`'s Props interface so TypeScript is satisfied. The menu is wired in a later sprint.

- [ ] **Step 5: Run to verify GREEN**

```bash
npx vitest run src/components/ListScreen.test.tsx
```
Expected: 1 passing.

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/ListScreen.tsx src/components/ListScreen.test.tsx src/components/ListHeader.tsx src/components/ListScreen.css
git commit -m "feat: wire TagEditSheet into ListScreen — tappable tag editing"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```
Expected: all test files pass, 0 failures.

- [ ] **Step 2: Run the type checker**

```bash
npx tsc --noEmit
```
Expected: no output (zero errors).
