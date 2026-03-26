# List Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rename and delete actions to dashboard list cards via a ⋯ button that opens a bottom action sheet.

**Architecture:** A new `ListActionSheet` component manages three internal sub-states (`'actions'`, `'rename'`, `'confirm-delete'`) and communicates results to `DashboardScreen` via callbacks. `ListCard` gains a ⋯ button and its outer element changes from `<button>` to `<div>` to avoid nested interactive elements. Two new API functions wire to existing backend endpoints.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react, existing `apiFetch` helper in `frontend/src/lib/api.ts`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/api.ts` | Modify | Add `renameList`, `deleteList` |
| `frontend/src/lib/api.test.ts` | Modify | Tests for `renameList`, `deleteList` |
| `frontend/src/components/ListCard.tsx` | Modify | Add ⋯ button; outer `<button>` → `<div>` |
| `frontend/src/components/ListCard.css` | Modify | Layout for row with tap-target + menu button |
| `frontend/src/components/ListCard.test.tsx` | Modify | Update existing + add ⋯ button tests |
| `frontend/src/components/ListActionSheet.tsx` | Create | Bottom sheet with actions/rename/confirm-delete sub-states |
| `frontend/src/components/ListActionSheet.css` | Create | Sheet styles (mirrors `TagEditSheet.css`) |
| `frontend/src/components/ListActionSheet.test.tsx` | Create | 15 test cases for all sub-states and dismiss paths |
| `frontend/src/components/DashboardScreen.tsx` | Modify | `activeList` state, `handleRename`, `handleDelete` |
| `frontend/src/components/DashboardScreen.test.tsx` | Modify | 6 new test cases |

---

## Task 1: Add `renameList` and `deleteList` to the API client

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/api.test.ts`

Run all commands from `frontend/`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/api.test.ts` (after the existing `updateItem` describe block):

```typescript
describe('renameList', () => {
  it('PATCH /lists/{id} with name body', async () => {
    mockFetch.mockReturnValue(mockResponse({ id: 'l1', name: 'Nuevo nombre' }))
    await renameList(mockGetToken, 'l1', 'Nuevo nombre')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/l1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Nuevo nombre' }),
      }),
    )
  })
})

describe('deleteList', () => {
  it('DELETE /lists/{id} returns null on 204', async () => {
    mockFetch.mockReturnValue(Promise.resolve({
      ok: true, status: 204,
      json: () => Promise.resolve(null),
      text: () => Promise.resolve(''),
    }))
    const result = await deleteList(mockGetToken, 'l1')
    expect(result).toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/lists/l1'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
```

Also add `renameList` and `deleteList` to the import line at the top of `api.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/api.test.ts
```
Expected: 2 failing tests — `renameList is not exported`, `deleteList is not exported`.

- [ ] **Step 3: Implement `renameList` and `deleteList`**

Add to `frontend/src/lib/api.ts` (after `createList`):

```typescript
export function renameList(
  getToken: () => Promise<string>,
  listId: string,
  name: string,
) {
  return apiFetch(getToken, `/lists/${listId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function deleteList(getToken: () => Promise<string>, listId: string) {
  return apiFetch(getToken, `/lists/${listId}`, { method: 'DELETE' })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/api.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat: add renameList and deleteList API functions"
```

---

## Task 2: Refactor `ListCard` — add ⋯ button, fix nested buttons

**Files:**
- Modify: `frontend/src/components/ListCard.tsx`
- Modify: `frontend/src/components/ListCard.css`
- Modify: `frontend/src/components/ListCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the content of `frontend/src/components/ListCard.test.tsx` with:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ListCard } from './ListCard'
import type { ApiList } from '../types'

const makeList = (overrides: Partial<ApiList> = {}): ApiList => ({
  id: 'l1',
  name: 'Mercado semanal',
  owner_id: 'u1',
  created_at: '',
  updated_at: '',
  item_count: 8,
  purchased_count: 3,
  ...overrides,
})

describe('ListCard', () => {
  it('shows the list name', () => {
    render(<ListCard list={makeList()} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
    expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
  })

  it('shows "X de Y comprados" subtitle when items exist', () => {
    render(<ListCard list={makeList({ item_count: 8, purchased_count: 3 })} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
    expect(screen.getByText('3 de 8 comprados')).toBeInTheDocument()
  })

  it('hides subtitle when item_count is 0', () => {
    render(<ListCard list={makeList({ item_count: 0, purchased_count: 0 })} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
    expect(screen.queryByText(/comprados/)).not.toBeInTheDocument()
  })

  it('calls onClick when tap-target is clicked', () => {
    const onClick = vi.fn()
    render(<ListCard list={makeList()} onClick={onClick} onMenuOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /mercado semanal/i }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('⋯ button is present', () => {
    render(<ListCard list={makeList()} onClick={vi.fn()} onMenuOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /opciones/i })).toBeInTheDocument()
  })

  it('tapping ⋯ calls onMenuOpen', () => {
    const onMenuOpen = vi.fn()
    render(<ListCard list={makeList()} onClick={vi.fn()} onMenuOpen={onMenuOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /opciones/i }))
    expect(onMenuOpen).toHaveBeenCalledOnce()
  })

  it('tapping ⋯ does not call onClick', () => {
    const onClick = vi.fn()
    render(<ListCard list={makeList()} onClick={onClick} onMenuOpen={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /opciones/i }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/components/ListCard.test.tsx
```
Expected: several failures — `onMenuOpen` prop missing, ⋯ button not found.

- [ ] **Step 3: Update `ListCard.tsx`**

Replace `frontend/src/components/ListCard.tsx` with:

```typescript
import './ListCard.css'
import { ProgressBar } from './ProgressBar'
import type { ApiList } from '../types'

interface Props {
  list: ApiList
  onClick: () => void
  onMenuOpen: () => void
}

export function ListCard({ list, onClick, onMenuOpen }: Props) {
  const { name, item_count, purchased_count } = list
  return (
    <div className="list-card">
      <button
        className="list-card__tap-target"
        onClick={onClick}
        aria-label={name}
      >
        <span className="list-card__name">{name}</span>
        <ProgressBar purchased={purchased_count} total={item_count} />
        {item_count > 0 && (
          <span className="list-card__subtitle">
            {purchased_count} de {item_count} comprados
          </span>
        )}
      </button>
      <button
        className="list-card__menu-btn"
        onClick={e => { e.stopPropagation(); onMenuOpen() }}
        aria-label="Opciones"
      >
        ⋯
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Update `ListCard.css`**

Replace `frontend/src/components/ListCard.css` with:

```css
.list-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.75rem;
  overflow: hidden;
}

.list-card__tap-target {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 0 1rem 1.25rem;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  min-width: 0;
}

.list-card__tap-target:active {
  background: var(--color-bg, #f9fafb);
}

.list-card__name {
  font-weight: 600;
  font-size: 1rem;
  color: var(--color-text, #111827);
}

.list-card__subtitle {
  font-size: 0.75rem;
  color: var(--color-text-secondary, #6b7280);
}

.list-card__menu-btn {
  flex-shrink: 0;
  padding: 0 1rem;
  align-self: stretch;
  background: none;
  border: none;
  font-size: 1.25rem;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  letter-spacing: 0.05em;
}

.list-card__menu-btn:active {
  color: var(--color-text, #111827);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/components/ListCard.test.tsx
```
Expected: all 7 tests pass.

- [ ] **Step 6: Check `DashboardScreen.test.tsx` still passes** (it mocks `ListScreen` but renders `ListCard` in full)

```bash
npx vitest run src/components/DashboardScreen.test.tsx
```
Expected: all 8 existing tests pass. After this refactor, `DashboardScreen.tsx` will pass `onClick` but not yet `onMenuOpen` to `ListCard` — TypeScript will flag this, but `vitest run` does not type-check. None of the existing tests click the ⋯ button, so the undefined `onMenuOpen` prop is never invoked and all tests pass. The `onMenuOpen` prop will be wired in Task 4.

- [ ] **Step 7: Commit**

```bash
git add src/components/ListCard.tsx src/components/ListCard.css src/components/ListCard.test.tsx
git commit -m "feat: refactor ListCard — add menu button, fix nested buttons"
```

---

## Task 3: Build `ListActionSheet`

**Files:**
- Create: `frontend/src/components/ListActionSheet.tsx`
- Create: `frontend/src/components/ListActionSheet.css`
- Create: `frontend/src/components/ListActionSheet.test.tsx`

### Sub-task 3a: Actions sub-state + ESC dismiss

- [ ] **Step 1: Write failing tests for the actions sub-state**

Create `frontend/src/components/ListActionSheet.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeEach, test, expect } from 'vitest'
import { ListActionSheet } from './ListActionSheet'
import type { ApiList } from '../types'

const list: ApiList = {
  id: 'l1', name: 'Mercado semanal', owner_id: 'u1',
  created_at: '', updated_at: '', item_count: 8, purchased_count: 3,
}

const baseProps = {
  list,
  isOwner: true,
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

test('renders list name in header', () => {
  render(<ListActionSheet {...baseProps} />)
  expect(screen.getByText('Mercado semanal')).toBeInTheDocument()
})

test('shows Renombrar button', () => {
  render(<ListActionSheet {...baseProps} />)
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
})

test('shows Eliminar lista when isOwner is true', () => {
  render(<ListActionSheet {...baseProps} />)
  expect(screen.getByRole('button', { name: /eliminar lista/i })).toBeInTheDocument()
})

test('hides Eliminar lista when isOwner is false', () => {
  render(<ListActionSheet {...baseProps} isOwner={false} />)
  expect(screen.queryByRole('button', { name: /eliminar lista/i })).not.toBeInTheDocument()
})

test('ESC calls onClose from actions sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(baseProps.onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify RED**

```bash
npx vitest run src/components/ListActionSheet.test.tsx
```
Expected: module not found error.

- [ ] **Step 3: Create `ListActionSheet.tsx` (actions sub-state only)**

```typescript
import { useState, useEffect } from 'react'
import './ListActionSheet.css'
import type { ApiList } from '../types'

type SubState = 'actions' | 'rename' | 'confirm-delete'

interface Props {
  list: ApiList
  isOwner: boolean
  onRename: (newName: string) => void
  onDelete: () => void
  onClose: () => void
}

export function ListActionSheet({ list, isOwner, onRename, onDelete, onClose }: Props) {
  const [subState, setSubState] = useState<SubState>('actions')
  const [renameValue, setRenameValue] = useState(list.name)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (subState === 'actions') {
    return (
      <div className="list-action-sheet">
        <div className="list-action-sheet__handle" />
        <p className="list-action-sheet__list-name">{list.name}</p>
        <button
          className="list-action-sheet__action"
          onClick={() => setSubState('rename')}
        >
          ✏️ Renombrar
        </button>
        {isOwner && (
          <button
            className="list-action-sheet__action list-action-sheet__action--danger"
            onClick={() => setSubState('confirm-delete')}
          >
            🗑️ Eliminar lista
          </button>
        )}
      </div>
    )
  }

  return null // rename and confirm-delete added in next sub-tasks
}
```

- [ ] **Step 4: Create `ListActionSheet.css`**

```css
.list-action-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg, #fff);
  border-top: 1px solid var(--color-border, #e5e7eb);
  border-radius: 16px 16px 0 0;
  padding: 8px 0 24px;
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.list-action-sheet__handle {
  width: 36px;
  height: 4px;
  background: var(--color-border, #e5e7eb);
  border-radius: 2px;
  margin: 0 auto 12px;
}

.list-action-sheet__list-name {
  font-size: 0.75rem;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 500;
  padding: 0 20px 8px;
  margin: 0;
}

.list-action-sheet__action {
  display: block;
  width: 100%;
  padding: 14px 20px;
  background: none;
  border: none;
  border-top: 1px solid var(--color-border, #f3f4f6);
  font-size: 1rem;
  text-align: left;
  cursor: pointer;
  color: var(--color-text, #111827);
}

.list-action-sheet__action--danger {
  color: var(--color-danger, #dc2626);
}

/* Rename sub-state */
.list-action-sheet__input-row {
  display: flex;
  gap: 8px;
  padding: 0 16px 8px;
}

.list-action-sheet__input {
  flex: 1;
  padding: 9px 12px;
  border: 1.5px solid var(--color-primary, #7c3aed);
  border-radius: 8px;
  font-size: 1rem;
  background: var(--color-bg, #fff);
  color: var(--color-text, #111827);
  outline: none;
}

.list-action-sheet__save-btn {
  padding: 9px 16px;
  background: var(--color-primary, #7c3aed);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.list-action-sheet__save-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.list-action-sheet__cancel-link {
  background: none;
  border: none;
  color: var(--color-text-secondary, #6b7280);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 4px 20px;
  text-align: left;
}

/* Confirm-delete sub-state */
.list-action-sheet__warning {
  font-size: 0.85rem;
  color: var(--color-text-secondary, #6b7280);
  padding: 0 20px 16px;
  margin: 0;
}

.list-action-sheet__confirm-btn {
  margin: 0 16px 8px;
  padding: 13px;
  background: var(--color-danger, #dc2626);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.list-action-sheet__cancel-btn {
  margin: 0 16px;
  padding: 13px;
  background: none;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  font-size: 1rem;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
}
```

- [ ] **Step 5: Run tests to verify actions sub-state passes**

```bash
npx vitest run src/components/ListActionSheet.test.tsx
```
Expected: 5 passing, 0 failing.

### Sub-task 3b: Rename sub-state

- [ ] **Step 6: Add rename sub-state tests**

Append to `ListActionSheet.test.tsx`:

```typescript
test('tapping Renombrar shows rename input pre-filled with list name', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  expect(screen.getByRole('textbox')).toHaveValue('Mercado semanal')
})

test('Guardar button is disabled when input is empty', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
  expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
})

test('save calls onRename with trimmed value', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Nuevo nombre  ' } })
  fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
  expect(baseProps.onRename).toHaveBeenCalledWith('Nuevo nombre')
})

test('Enter key triggers save when input is non-empty', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  expect(baseProps.onRename).toHaveBeenCalledWith('Mercado semanal')
})

test('Cancelar in rename sub-state returns to actions sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
})

test('ESC calls onClose from rename sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(baseProps.onClose).toHaveBeenCalled()
})
```

- [ ] **Step 7: Run to verify the 6 new tests fail**

```bash
npx vitest run src/components/ListActionSheet.test.tsx
```
Expected: 5 passing, 6 failing (rename sub-state not implemented yet).

- [ ] **Step 8: Implement rename sub-state in `ListActionSheet.tsx`**

Replace `return null` with the rename and confirm-delete stubs. Update the `if (subState === 'rename')` branch:

```typescript
  if (subState === 'rename') {
    const trimmed = renameValue.trim()
    return (
      <div className="list-action-sheet">
        <div className="list-action-sheet__handle" />
        <p className="list-action-sheet__list-name">✏️ Renombrar lista</p>
        <div className="list-action-sheet__input-row">
          <input
            className="list-action-sheet__input"
            type="text"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && trimmed) onRename(trimmed) }}
            autoFocus
            aria-label="Nombre de la lista"
          />
          <button
            className="list-action-sheet__save-btn"
            onClick={() => onRename(trimmed)}
            disabled={!trimmed}
            aria-label="Guardar"
          >
            Guardar
          </button>
        </div>
        <button
          className="list-action-sheet__cancel-link"
          onClick={() => setSubState('actions')}
          aria-label="Cancelar"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return null // confirm-delete added next
```

- [ ] **Step 9: Run to verify 11 tests pass**

```bash
npx vitest run src/components/ListActionSheet.test.tsx
```
Expected: 11 passing.

### Sub-task 3c: Confirm-delete sub-state

- [ ] **Step 10: Add confirm-delete tests**

Append to `ListActionSheet.test.tsx`:

```typescript
test('tapping Eliminar lista shows confirmation sub-state with warning text', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  expect(screen.getByText(/esta acción no se puede deshacer/i)).toBeInTheDocument()
})

test('"Sí, eliminar lista" calls onDelete', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
  expect(baseProps.onDelete).toHaveBeenCalled()
})

test('Cancelar in confirmation sub-state returns to actions sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
  expect(screen.getByRole('button', { name: /renombrar/i })).toBeInTheDocument()
  expect(baseProps.onClose).not.toHaveBeenCalled()
})

test('ESC calls onClose from confirm-delete sub-state', () => {
  render(<ListActionSheet {...baseProps} />)
  fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(baseProps.onClose).toHaveBeenCalled()
})
```

- [ ] **Step 11: Run to verify the 4 new tests fail**

```bash
npx vitest run src/components/ListActionSheet.test.tsx
```
Expected: 11 passing, 4 failing.

- [ ] **Step 12: Implement confirm-delete sub-state**

Replace the final `return null` in `ListActionSheet.tsx` with:

```typescript
  // subState === 'confirm-delete'
  return (
    <div className="list-action-sheet">
      <div className="list-action-sheet__handle" />
      <p className="list-action-sheet__list-name">{list.name}</p>
      <p className="list-action-sheet__warning">
        Se eliminarán todos los productos. Esta acción no se puede deshacer.
      </p>
      <button
        className="list-action-sheet__confirm-btn"
        onClick={onDelete}
        aria-label="Sí, eliminar lista"
      >
        Sí, eliminar lista
      </button>
      <button
        className="list-action-sheet__cancel-btn"
        onClick={() => setSubState('actions')}
        aria-label="Cancelar"
      >
        Cancelar
      </button>
    </div>
  )
```

- [ ] **Step 13: Run to verify all 15 tests pass**

```bash
npx vitest run src/components/ListActionSheet.test.tsx
```
Expected: 15 passing.

- [ ] **Step 14: Commit**

```bash
git add src/components/ListActionSheet.tsx src/components/ListActionSheet.css src/components/ListActionSheet.test.tsx
git commit -m "feat: add ListActionSheet with rename and delete sub-states"
```

---

## Task 4: Wire `DashboardScreen`

**Files:**
- Modify: `frontend/src/components/DashboardScreen.tsx`
- Modify: `frontend/src/components/DashboardScreen.test.tsx`

- [ ] **Step 1: Add failing tests**

Note: `twoLists` is already defined at the module level in `DashboardScreen.test.tsx` (lines 36–39). The new tests below use it directly — no redefinition needed.

Add to `DashboardScreen.test.tsx`:

1. Update the `beforeEach` mock setup — add after existing mock lines:

```typescript
vi.mocked(api.renameList).mockResolvedValue({} as never)
vi.mocked(api.deleteList).mockResolvedValue(null as never)
```

2. Add a new `describe` block at the end of the file:

```typescript
describe('DashboardScreen — list management', () => {
  it('tapping ⋯ on a card opens the action sheet for that list', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    expect(screen.getByText(/renombrar/i)).toBeInTheDocument()
  })

  it('confirming rename updates the list name in the dashboard', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mercado Nuevo' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(screen.getByText('Mercado Nuevo')).toBeInTheDocument())
  })

  it('rename failure reverts the name and shows a toast', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.renameList).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /renombrar/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Mercado Nuevo' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(screen.getByText(/no se pudo renombrar/i)).toBeInTheDocument()
  })

  it('confirming delete removes the list card from the dashboard', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
    await waitFor(() => expect(screen.queryByText('Mercado')).not.toBeInTheDocument())
  })

  it('delete failure shows a toast and the list card remains', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    vi.mocked(api.deleteList).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /eliminar lista/i }))
    fireEvent.click(screen.getByRole('button', { name: /sí, eliminar/i }))
    await waitFor(() => expect(screen.getByText(/no se pudo eliminar/i)).toBeInTheDocument())
    expect(screen.getByText('Mercado')).toBeInTheDocument()
  })

  it('delete option absent when user is not the list owner', async () => {
    const foreignList = { ...twoLists[0], owner_id: 'other-user' }
    vi.mocked(api.getLists).mockResolvedValue([foreignList, twoLists[1]] as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getAllByRole('button', { name: /opciones/i })[0])
    expect(screen.queryByRole('button', { name: /eliminar lista/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run src/components/DashboardScreen.test.tsx
```
Expected: 6 new failing tests — `onMenuOpen` prop missing, `activeList` not implemented.

- [ ] **Step 3: Update `DashboardScreen.tsx`**

Add the following changes:

1. **New imports** at the top:
```typescript
import { ListActionSheet } from './ListActionSheet'
import { renameList, deleteList } from '../lib/api'
```

2. **New state** inside `DashboardScreen()`, after existing state:
```typescript
const [activeList, setActiveList] = useState<ApiList | null>(null)
const [toast, setToast] = useState<string | null>(null)

// Auto-dismiss toast after 3 seconds
useEffect(() => {
  if (!toast) return
  const id = setTimeout(() => setToast(null), 3000)
  return () => clearTimeout(id)
}, [toast])
```

3. **New handlers** inside `DashboardScreen()`, after `handleCreate`:
```typescript
const handleRename = useCallback(
  async (list: ApiList, newName: string) => {
    const snapshot = lists
    setLists(prev => prev ? prev.map(l => l.id === list.id ? { ...l, name: newName } : l) : prev)
    setActiveList(null)
    try {
      await renameList(getToken, list.id, newName)
    } catch {
      setLists(snapshot)
      setToast('No se pudo renombrar la lista')
    }
  },
  [lists, getToken],
)

const handleDelete = useCallback(
  async (list: ApiList) => {
    setActiveList(null)
    try {
      await deleteList(getToken, list.id)
      setLists(prev => prev ? prev.filter(l => l.id !== list.id) : prev)
    } catch {
      setToast('No se pudo eliminar la lista')
    }
  },
  [getToken],
)
```

4. **Update `setSelectedList` call** to also clear `activeList`:
```typescript
// Change: onClick={() => setSelectedListId(list.id)}
// To:
onClick={() => { setSelectedList(list); setActiveList(null) }}
```

5. **Update `ListCard` render** to pass `onMenuOpen`:
```typescript
<ListCard
  key={list.id}
  list={list}
  onClick={() => { setSelectedList(list); setActiveList(null) }}
  onMenuOpen={() => { setActiveList(list) }}
/>
```

6. **Render `ListActionSheet`** just before the closing `</div>` of the main return:
```typescript
{activeList && (
  <ListActionSheet
    list={activeList}
    isOwner={activeList.owner_id === (user?.id ?? '')}
    onRename={newName => void handleRename(activeList, newName)}
    onDelete={() => void handleDelete(activeList)}
    onClose={() => setActiveList(null)}
  />
)}
{toast && (
  <div className="dashboard-screen__toast" role="alert">{toast}</div>
)}
```

7. **Add toast style** to `DashboardScreen.css`:
```css
.dashboard-screen__toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: #1f2937;
  color: #fff;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 0.875rem;
  white-space: nowrap;
  z-index: 200;
}
```

- [ ] **Step 4: Run to verify all new tests pass**

```bash
npx vitest run src/components/DashboardScreen.test.tsx
```
Expected: all tests pass (including the 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardScreen.tsx src/components/DashboardScreen.test.tsx src/components/DashboardScreen.css
git commit -m "feat: wire list rename and delete in DashboardScreen"
```

---

## Task 5: Final verification

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

- [ ] **Step 3: Commit if any files remain unstaged**

```bash
git status
```
If clean, no commit needed. If any files were missed in earlier commits, stage and commit them.
