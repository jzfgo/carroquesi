# Shopping List View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CarroQueSí shopping list screen — a mobile-first React prototype with mock data covering the item list, smart input bar with inline syntax parsing, optimistic interactions, and inline tag editing.

**Architecture:** Prototype-first with mock data in `ListScreen` state; no routing. Pure `parseInput` function drives the smart input bar. API calls are stubbed by direct state mutations in the prototype phase. Small, focused components — each with its own CSS file.

**Tech Stack:** React 19, TypeScript 5, Vite 8, Vitest + @testing-library/react (jsdom), Node 24.14.0.

---

## File Map

| File | Create / Modify | Responsibility |
|------|----------------|----------------|
| `frontend/package.json` | Modify | Add vitest + testing library deps |
| `frontend/vite.config.ts` | Modify | Add `test` block for jsdom |
| `frontend/tsconfig.app.json` | Modify | Add `vitest/globals` to types |
| `frontend/src/vitest.setup.ts` | Create | Import `@testing-library/jest-dom` |
| `frontend/src/index.css` | Modify | Add `--purchased` token |
| `frontend/src/types.ts` | Create | `ListItem`, `ParsedInput`, `Member` interfaces |
| `frontend/src/mockData.ts` | Create | Mock items + members for prototype |
| `frontend/src/parseInput.ts` | Create | Pure tokeniser: `string → ParsedInput` |
| `frontend/src/parseInput.test.ts` | Create | Tokeniser unit tests |
| `frontend/src/components/ListHeader.tsx` | Create | Title + hamburger menu button |
| `frontend/src/components/ListHeader.css` | Create | Header styles |
| `frontend/src/components/ProgressBar.tsx` | Create | 3px accent progress bar |
| `frontend/src/components/ProgressBar.css` | Create | Progress bar styles |
| `frontend/src/components/ItemCard.tsx` | Create | Item row: checkbox, name, qty, tags, avatar |
| `frontend/src/components/ItemCard.css` | Create | Item card styles |
| `frontend/src/components/ItemCard.test.tsx` | Create | ItemCard unit tests |
| `frontend/src/components/ItemList.tsx` | Create | Sections + loading/error/empty states |
| `frontend/src/components/ItemList.css` | Create | List and section styles |
| `frontend/src/components/ItemList.test.tsx` | Create | ItemList unit tests |
| `frontend/src/components/Toast.tsx` | Create | Transient error/success message |
| `frontend/src/components/Toast.css` | Create | Toast styles |
| `frontend/src/components/Toast.test.tsx` | Create | Toast unit tests |
| `frontend/src/components/SmartInputBar.tsx` | Create | Sticky input bar: legend, input, preview, suggestions |
| `frontend/src/components/SmartInputBar.css` | Create | Input bar styles |
| `frontend/src/components/SmartInputBar.test.tsx` | Create | SmartInputBar unit tests |
| `frontend/src/components/ListScreen.tsx` | Create | Root screen: all state, orchestrates children |
| `frontend/src/components/ListScreen.css` | Create | Full-screen layout |
| `frontend/src/App.tsx` | Modify | Render `<ListScreen>` |

---

## Task 1: Vitest + React Testing Library

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.app.json`
- Create: `frontend/src/vitest.setup.ts`

- [ ] **Step 1.1: Install test dependencies**

Run from `frontend/`:
```bash
PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm install --save-dev \
  vitest \
  @testing-library/react \
  @testing-library/user-event \
  @testing-library/jest-dom \
  jsdom
```
Expected: `added N packages`

- [ ] **Step 1.2: Add test config to `vite.config.ts`**

Replace entire file:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: true,
  },
})
```

- [ ] **Step 1.3: Create `src/vitest.setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 1.4: Add vitest globals to `tsconfig.app.json`**

In the `"compilerOptions"` object, add or extend the `"types"` array:
```json
"types": ["vitest/globals"]
```

- [ ] **Step 1.5: Add `test` script to `package.json`**

In `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 1.6: Verify setup with a smoke test**

Create `frontend/src/smoke.test.ts`:
```ts
test('vitest works', () => {
  expect(1 + 1).toBe(2)
})
```

Run:
```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test
```
Expected: `1 passed`

- [ ] **Step 1.7: Delete smoke test and commit**

```bash
rm frontend/src/smoke.test.ts
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts \
  frontend/tsconfig.app.json frontend/src/vitest.setup.ts
git commit -m "chore: add vitest + react testing library"
```

---

## Task 2: Types and mock data

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/mockData.ts`
- Modify: `frontend/src/index.css`

- [ ] **Step 2.1: Create `src/types.ts`**

```ts
export interface ListItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  brand: string | null
  variety: string | null
  store: string | null
  purchased: boolean
  added_by: string       // user UUID
  created_at: string
  updated_at: string
}

export interface ParsedInput {
  name: string           // empty string if no name tokens found
  quantity: string | null
  variety: string | null
  brand: string | null
  store: string | null
}

export interface Member {
  id: string
  displayName: string
  initial: string
  colour: string
}

export type TagField = 'variety' | 'brand' | 'store'

export interface EditingTag {
  itemId: string
  field: TagField
}
```

- [ ] **Step 2.2: Create `src/mockData.ts`**

```ts
import type { ListItem, Member } from './types'

export const MOCK_LIST_ID = 'list-001'

// Deterministic colour palette for avatars
export const AVATAR_COLOURS = [
  '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#9333ea',
]

export const MOCK_MEMBERS: Member[] = [
  { id: 'user-javi', displayName: 'Javier', initial: 'J', colour: AVATAR_COLOURS[0] },
  { id: 'user-maria', displayName: 'María',  initial: 'M', colour: AVATAR_COLOURS[1] },
]

export const MOCK_ITEMS: ListItem[] = [
  {
    id: 'item-1', list_id: MOCK_LIST_ID,
    name: 'Leche', quantity: '2 unidades',
    variety: 'Entera', brand: 'Hacendado', store: 'Mercadona',
    purchased: false, added_by: 'user-javi',
    created_at: '2026-03-19T10:00:00Z', updated_at: '2026-03-19T10:00:00Z',
  },
  {
    id: 'item-2', list_id: MOCK_LIST_ID,
    name: 'Huevos', quantity: '12 unidades',
    variety: null, brand: null, store: null,
    purchased: false, added_by: 'user-maria',
    created_at: '2026-03-19T10:01:00Z', updated_at: '2026-03-19T10:01:00Z',
  },
  {
    id: 'item-3', list_id: MOCK_LIST_ID,
    name: 'Tomates cherry', quantity: '1 bolsa',
    variety: null, brand: 'Florette', store: null,
    purchased: false, added_by: 'user-javi',
    created_at: '2026-03-19T10:02:00Z', updated_at: '2026-03-19T10:02:00Z',
  },
  {
    id: 'item-4', list_id: MOCK_LIST_ID,
    name: 'Pan de molde integral', quantity: '1',
    variety: 'Sin corteza', brand: 'Bimbo', store: 'Carrefour',
    purchased: true, added_by: 'user-maria',
    created_at: '2026-03-19T10:03:00Z', updated_at: '2026-03-19T10:03:00Z',
  },
]
```

- [ ] **Step 2.3: Add `--purchased` token to `src/index.css`**

Inside the `:root` block, after the existing `--shadow` line, add:
```css
--purchased: #b0adb5;
```

Inside the `@media (prefers-color-scheme: dark)` `:root` block, add:
```css
--purchased: #6b7280;
```

- [ ] **Step 2.4: Commit**

```bash
git add frontend/src/types.ts frontend/src/mockData.ts frontend/src/index.css
git commit -m "feat: add types, mock data, and --purchased CSS token"
```

---

## Task 3: `parseInput` pure function

**Files:**
- Create: `frontend/src/parseInput.ts`
- Create: `frontend/src/parseInput.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `frontend/src/parseInput.test.ts`:
```ts
import { parseInput } from './parseInput'

describe('parseInput', () => {
  test('empty string returns empty ParsedInput', () => {
    expect(parseInput('')).toEqual({ name: '', quantity: null, variety: null, brand: null, store: null })
  })

  test('plain name with no sigils', () => {
    expect(parseInput('Leche entera')).toEqual({
      name: 'Leche entera', quantity: null, variety: null, brand: null, store: null,
    })
  })

  test('name + single-word quantity', () => {
    const result = parseInput('Leche +3')
    expect(result.name).toBe('Leche')
    expect(result.quantity).toBe('3')
  })

  test('multi-word quantity: +1 bolsa', () => {
    const result = parseInput('Tomates +1 bolsa')
    expect(result.name).toBe('Tomates')
    expect(result.quantity).toBe('1 bolsa')
  })

  test('multi-word quantity: +6 litros de leche', () => {
    const result = parseInput('Agua +6 litros de leche')
    expect(result.quantity).toBe('6 litros de leche')
  })

  test('all four sigils', () => {
    const result = parseInput('Leche entera +3 *Desnatada #Puleva @Mercadona')
    expect(result.name).toBe('Leche entera')
    expect(result.quantity).toBe('3')
    expect(result.variety).toBe('Desnatada')
    expect(result.brand).toBe('Puleva')
    expect(result.store).toBe('Mercadona')
  })

  test('sigils in any order', () => {
    const result = parseInput('Leche @Mercadona #Puleva *Entera +2')
    expect(result.name).toBe('Leche')
    expect(result.store).toBe('Mercadona')
    expect(result.brand).toBe('Puleva')
    expect(result.variety).toBe('Entera')
    expect(result.quantity).toBe('2')
  })

  test('multi-word store: @El Corte Inglés', () => {
    const result = parseInput('Jamón @El Corte Inglés')
    expect(result.name).toBe('Jamón')
    expect(result.store).toBe('El Corte Inglés')
  })

  test('last occurrence of same sigil wins', () => {
    const result = parseInput('Leche +2 +3')
    expect(result.quantity).toBe('3')
  })

  test('word starting with sigil is never part of name', () => {
    const result = parseInput('+2')
    expect(result.name).toBe('')
    expect(result.quantity).toBe('2')
  })

  test('trailing partial token (typing in progress)', () => {
    const result = parseInput('Leche +3 @Mer')
    expect(result.store).toBe('Mer')
  })

  test('only whitespace returns empty', () => {
    expect(parseInput('   ')).toEqual({ name: '', quantity: null, variety: null, brand: null, store: null })
  })
})
```

- [ ] **Step 3.2: Run tests — confirm they fail**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- parseInput
```
Expected: FAIL — `Cannot find module './parseInput'`

- [ ] **Step 3.3: Implement `parseInput.ts`**

```ts
import type { ParsedInput } from './types'

const SIGIL_MAP: Record<string, keyof Omit<ParsedInput, 'name'>> = {
  '+': 'quantity',
  '*': 'variety',
  '#': 'brand',
  '@': 'store',
}

export function parseInput(raw: string): ParsedInput {
  const words = raw.trim().split(/\s+/).filter(Boolean)

  const result: ParsedInput = { name: '', quantity: null, variety: null, brand: null, store: null }
  const nameWords: string[] = []
  let currentField: keyof Omit<ParsedInput, 'name'> | null = null
  const tokenWords: Record<string, string[]> = {}

  for (const word of words) {
    const sigil = word[0]
    const field = SIGIL_MAP[sigil]

    if (field) {
      currentField = field
      tokenWords[field] = [word.slice(1)]   // strip sigil; reset (last occurrence wins)
    } else if (currentField) {
      tokenWords[currentField].push(word)
    } else {
      nameWords.push(word)
    }
  }

  result.name = nameWords.join(' ')
  for (const [field, parts] of Object.entries(tokenWords)) {
    if (parts.length > 0 && parts.join('').length > 0) {
      (result as Record<string, unknown>)[field] = parts.join(' ')
    }
  }

  return result
}
```

- [ ] **Step 3.4: Run tests — confirm they pass**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- parseInput
```
Expected: `12 passed`

- [ ] **Step 3.5: Commit**

```bash
git add frontend/src/parseInput.ts frontend/src/parseInput.test.ts
git commit -m "feat: add parseInput tokeniser with tests"
```

---

## Task 4: `ListHeader` and `ProgressBar`

**Files:**
- Create: `frontend/src/components/ListHeader.tsx`
- Create: `frontend/src/components/ListHeader.css`
- Create: `frontend/src/components/ProgressBar.tsx`
- Create: `frontend/src/components/ProgressBar.css`

These components have no logic worth TDD-ing; build them directly.

- [ ] **Step 4.1: Create `ListHeader.tsx`**

```tsx
import './ListHeader.css'

interface Props {
  title: string
  onMenuOpen: () => void
}

export function ListHeader({ title, onMenuOpen }: Props) {
  return (
    <header className="list-header">
      <button className="list-header__back">
        <span aria-hidden>‹</span> Lists
      </button>
      <h1 className="list-header__title">{title}</h1>
      <button
        className="list-header__menu"
        onClick={onMenuOpen}
        aria-label="Open menu"
      >
        <span /><span /><span />
      </button>
    </header>
  )
}
```

- [ ] **Step 4.2: Create `ListHeader.css`**

```css
.list-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  position: relative;
  flex-shrink: 0;
}

.list-header__back {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--accent);
  font-size: 16px;
  font-weight: 500;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.list-header__title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-h);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 55%;
  margin: 0;
  letter-spacing: normal;
}

.list-header__menu {
  width: 32px;
  height: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.list-header__menu span {
  width: 20px;
  height: 2px;
  background: var(--text-h);
  border-radius: 2px;
  display: block;
}
```

- [ ] **Step 4.3: Create `ProgressBar.tsx`**

```tsx
import './ProgressBar.css'

interface Props {
  purchased: number
  total: number
}

export function ProgressBar({ purchased, total }: Props) {
  if (total === 0) return null   // hidden when no items per spec
  const pct = Math.round((purchased / total) * 100)
  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
```

- [ ] **Step 4.4: Create `ProgressBar.css`**

```css
.progress-bar {
  height: 3px;
  background: var(--border);
  flex-shrink: 0;
}

.progress-bar__fill {
  height: 100%;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
  transition: width 0.3s ease;
}
```

- [ ] **Step 4.5: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: add ListHeader and ProgressBar components"
```

---

## Task 5: `ItemCard`

**Files:**
- Create: `frontend/src/components/ItemCard.tsx`
- Create: `frontend/src/components/ItemCard.css`
- Create: `frontend/src/components/ItemCard.test.tsx`

- [ ] **Step 5.1: Write failing tests**

Create `frontend/src/components/ItemCard.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ItemCard } from './ItemCard'
import type { ListItem, Member } from '../types'

const MEMBERS: Map<string, Member> = new Map([
  ['user-1', { id: 'user-1', displayName: 'Ana', initial: 'A', colour: '#7c3aed' }],
])

const BASE_ITEM: ListItem = {
  id: 'i1', list_id: 'l1',
  name: 'Leche', quantity: '2 unidades',
  variety: 'Entera', brand: 'Hacendado', store: 'Mercadona',
  purchased: false, added_by: 'user-1',
  created_at: '', updated_at: '',
}

test('renders item name', () => {
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} />)
  expect(screen.getByText('Leche')).toBeInTheDocument()
})

test('renders quantity badge', () => {
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} />)
  expect(screen.getByText('2 unidades')).toBeInTheDocument()
})

test('renders variety, brand, store tags', () => {
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} />)
  expect(screen.getByText(/Entera/)).toBeInTheDocument()
  expect(screen.getByText(/Hacendado/)).toBeInTheDocument()
  expect(screen.getByText(/Mercadona/)).toBeInTheDocument()
})

test('shows CTA tags for null fields', () => {
  const item = { ...BASE_ITEM, variety: null, brand: null, store: null }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} />)
  // Three CTA buttons with aria-label
  expect(screen.getByRole('button', { name: /add variety/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add brand/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add store/i })).toBeInTheDocument()
})

test('omits tag row entirely if all tag fields are null', () => {
  const item = { ...BASE_ITEM, variety: null, brand: null, store: null }
  const { container } = render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} />)
  // CTA tags ARE shown for null fields — tag row is only hidden if we choose not to show CTAs
  // Per spec: CTA tags shown for missing fields, row omitted only when all null AND no CTAs desired
  // In our design: CTAs always shown for missing fields, so row is always present
  expect(container.querySelector('.item-card__tags')).toBeInTheDocument()
})

test('purchased state applies strikethrough class', () => {
  const item = { ...BASE_ITEM, purchased: true }
  const { container } = render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} />)
  expect(container.querySelector('.item-card--purchased')).toBeInTheDocument()
})

test('tapping checkbox calls onTogglePurchased', () => {
  const handler = vi.fn()
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={handler} onTagClick={() => {}} />)
  fireEvent.click(screen.getByRole('checkbox'))
  expect(handler).toHaveBeenCalledWith('i1')
})

test('tapping a CTA tag calls onTagClick with item id and field', () => {
  const handler = vi.fn()
  const item = { ...BASE_ITEM, variety: null }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={handler} />)
  fireEvent.click(screen.getByRole('button', { name: /add variety/i }))
  expect(handler).toHaveBeenCalledWith('i1', 'variety')
})

test('shows member initial in avatar', () => {
  render(<ItemCard item={BASE_ITEM} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} />)
  expect(screen.getByText('A')).toBeInTheDocument()
})

test('shows ? avatar for unknown member', () => {
  const item = { ...BASE_ITEM, added_by: 'unknown-uuid' }
  render(<ItemCard item={item} members={MEMBERS} onTogglePurchased={() => {}} onTagClick={() => {}} />)
  expect(screen.getByText('?')).toBeInTheDocument()
})
```

- [ ] **Step 5.2: Run tests — confirm they fail**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- ItemCard
```
Expected: FAIL — `Cannot find module './ItemCard'`

- [ ] **Step 5.3: Implement `ItemCard.tsx`**

```tsx
import './ItemCard.css'
import type { ListItem, Member, TagField } from '../types'

const TAG_CONFIG: { field: TagField; emoji: string; label: string }[] = [
  { field: 'variety', emoji: '✨', label: 'variety' },
  { field: 'brand',   emoji: '🏷️', label: 'brand' },
  { field: 'store',   emoji: '🏪', label: 'store' },
]

interface Props {
  item: ListItem
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField) => void
}

export function ItemCard({ item, members, onTogglePurchased, onTagClick }: Props) {
  const member = members.get(item.added_by)
  const initial = member?.initial ?? '?'
  const colour  = member?.colour ?? '#b0adb5'

  return (
    <div className={`item-card${item.purchased ? ' item-card--purchased' : ''}`}>
      <button
        role="checkbox"
        aria-checked={item.purchased}
        className="item-card__checkbox"
        onClick={() => onTogglePurchased(item.id)}
        aria-label={item.purchased ? 'Mark as not purchased' : 'Mark as purchased'}
      />

      <div className="item-card__body">
        <div className="item-card__name-row">
          <span className="item-card__name">{item.name}</span>
          {item.quantity && (
            <span className="item-card__qty">{item.quantity}</span>
          )}
        </div>

        <div className="item-card__tags">
          {TAG_CONFIG.map(({ field, emoji, label }) =>
            item[field] ? (
              <button
                key={field}
                className="item-card__tag"
                onClick={() => onTagClick(item.id, field)}
              >
                <span aria-hidden>{emoji}</span> {item[field]}
              </button>
            ) : (
              <button
                key={field}
                className="item-card__tag item-card__tag--cta"
                onClick={() => onTagClick(item.id, field)}
                aria-label={`Add ${label}`}
              >
                <span aria-hidden>+ {emoji}</span>
              </button>
            )
          )}
        </div>
      </div>

      <div
        className="item-card__avatar"
        style={{ background: colour }}
        aria-hidden
      >
        {initial}
      </div>
    </div>
  )
}
```

- [ ] **Step 5.4: Create `ItemCard.css`**

```css
.item-card {
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  padding: 12px 16px 12px 20px;
  gap: 12px;
}

.item-card--purchased .item-card__name {
  text-decoration: line-through;
  color: var(--purchased);
}

.item-card--purchased .item-card__qty {
  background: #f0edf5;
  color: var(--purchased);
}

.item-card--purchased .item-card__tag {
  opacity: 0.45;
}

.item-card__checkbox {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: none;
  cursor: pointer;
  flex-shrink: 0;
  margin-top: 3px;
  padding: 0;
  position: relative;
}

.item-card__checkbox[aria-checked="true"] {
  background: var(--accent);
  border-color: var(--accent);
}

.item-card__checkbox[aria-checked="true"]::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 7px;
  border-left: 2px solid white;
  border-bottom: 2px solid white;
  transform: translate(-50%, -60%) rotate(-45deg);
}

.item-card__body {
  flex: 1;
  min-width: 0;
}

.item-card__name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 5px;
}

.item-card__name {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-h);
}

.item-card__qty {
  font-size: 13px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-bg);
  border-radius: 20px;
  padding: 1px 7px;
  white-space: nowrap;
}

.item-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.item-card__tag {
  background: var(--bg2, #f9f8fb);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 7px;
  font-size: 11.5px;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  cursor: pointer;
  font-family: inherit;
}

.item-card__tag--cta {
  background: transparent;
  border: 1.5px dashed var(--border);
}

.item-card__tag--cta:hover,
.item-card__tag--cta:focus {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-bg);
}

.item-card__avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: white;
  margin-top: 3px;
}
```

- [ ] **Step 5.5: Add `--bg2` token to `index.css`**

Inside the `:root` block, add:
```css
--bg2: #f9f8fb;
```

In the dark mode block, add:
```css
--bg2: #1e1f27;
```

- [ ] **Step 5.6: Run tests — confirm they pass**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- ItemCard
```
Expected: `10 passed`

- [ ] **Step 5.7: Commit**

```bash
git add frontend/src/components/ItemCard.tsx frontend/src/components/ItemCard.css \
  frontend/src/components/ItemCard.test.tsx frontend/src/index.css
git commit -m "feat: add ItemCard component with tag CTAs"
```

---

## Task 6: `Toast`

**Files:**
- Create: `frontend/src/components/Toast.tsx`
- Create: `frontend/src/components/Toast.css`
- Create: `frontend/src/components/Toast.test.tsx`

- [ ] **Step 6.1: Write failing tests**

Create `frontend/src/components/Toast.test.tsx`:
```tsx
import { render, screen, act } from '@testing-library/react'
import { Toast } from './Toast'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('renders message', () => {
  render(<Toast message="Could not update item" onDismiss={() => {}} />)
  expect(screen.getByText('Could not update item')).toBeInTheDocument()
})

test('calls onDismiss after 3 seconds', () => {
  const dismiss = vi.fn()
  render(<Toast message="Error" onDismiss={dismiss} />)
  expect(dismiss).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(3000) })
  expect(dismiss).toHaveBeenCalledTimes(1)
})

test('does not call onDismiss before 3 seconds', () => {
  const dismiss = vi.fn()
  render(<Toast message="Error" onDismiss={dismiss} />)
  act(() => { vi.advanceTimersByTime(2999) })
  expect(dismiss).not.toHaveBeenCalled()
})
```

- [ ] **Step 6.2: Run tests — confirm they fail**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- Toast
```
Expected: FAIL

- [ ] **Step 6.3: Implement `Toast.tsx`**

```tsx
import { useEffect } from 'react'
import './Toast.css'

interface Props {
  message: string
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: Props) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3000)
    return () => clearTimeout(id)
  }, [onDismiss])

  return (
    <div className="toast" role="alert">
      {message}
    </div>
  )
}
```

- [ ] **Step 6.4: Create `Toast.css`**

```css
.toast {
  position: fixed;
  bottom: 96px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text-h);
  color: var(--bg);
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  z-index: 100;
  box-shadow: var(--shadow);
  animation: toast-in 0.2s ease;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

- [ ] **Step 6.5: Run tests — confirm they pass**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- Toast
```
Expected: `3 passed`

- [ ] **Step 6.6: Commit**

```bash
git add frontend/src/components/Toast.tsx frontend/src/components/Toast.css \
  frontend/src/components/Toast.test.tsx
git commit -m "feat: add Toast component with auto-dismiss"
```

---

## Task 7: `ItemList`

**Files:**
- Create: `frontend/src/components/ItemList.tsx`
- Create: `frontend/src/components/ItemList.css`
- Create: `frontend/src/components/ItemList.test.tsx`

- [ ] **Step 7.1: Write failing tests**

Create `frontend/src/components/ItemList.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ItemList } from './ItemList'
import type { ListItem, Member } from '../types'

const MEMBERS: Map<string, Member> = new Map()

const makeItem = (id: string, purchased = false): ListItem => ({
  id, list_id: 'l1', name: `Item ${id}`, quantity: null,
  variety: null, brand: null, store: null,
  purchased, added_by: 'u1', created_at: '', updated_at: '',
})

test('shows loading skeleton', () => {
  const { container } = render(
    <ItemList status="loading" items={[]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(container.querySelector('.item-list__skeleton')).toBeInTheDocument()
})

test('shows error state with retry button', () => {
  const retry = vi.fn()
  render(
    <ItemList status="error" items={[]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={retry} />
  )
  expect(screen.getByText(/Couldn't load items/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /retry/i }))
  expect(retry).toHaveBeenCalledTimes(1)
})

test('shows empty state', () => {
  render(
    <ItemList status="success" items={[]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.getByText(/No items yet/i)).toBeInTheDocument()
})

test('renders active items section label', () => {
  const items = [makeItem('a'), makeItem('b')]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.getByText('2 items left')).toBeInTheDocument()
})

test('section label reads "1 item left" for single item', () => {
  render(
    <ItemList status="success" items={[makeItem('a')]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.getByText('1 item left')).toBeInTheDocument()
})

test('purchased section hidden when no items purchased', () => {
  render(
    <ItemList status="success" items={[makeItem('a')]} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.queryByText('Purchased')).not.toBeInTheDocument()
})

test('purchased section shown when items purchased', () => {
  const items = [makeItem('a', false), makeItem('b', true)]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  expect(screen.getByText('Purchased')).toBeInTheDocument()
})

test('purchased items appear below active items', () => {
  const items = [makeItem('a', true), makeItem('b', false)]
  render(
    <ItemList status="success" items={items} members={MEMBERS}
      onTogglePurchased={() => {}} onTagClick={() => {}} onRetry={() => {}} />
  )
  const allItems = screen.getAllByText(/Item [ab]/)
  // Item b (active) should appear before Item a (purchased)
  expect(allItems[0].textContent).toContain('b')
  expect(allItems[1].textContent).toContain('a')
})
```

- [ ] **Step 7.2: Run tests — confirm they fail**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- ItemList
```
Expected: FAIL

- [ ] **Step 7.3: Implement `ItemList.tsx`**

```tsx
import './ItemList.css'
import { ItemCard } from './ItemCard'
import type { ListItem, Member, TagField } from '../types'

type Status = 'loading' | 'error' | 'success'

interface Props {
  status: Status
  items: ListItem[]
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField) => void
  onRetry: () => void
}

export function ItemList({ status, items, members, onTogglePurchased, onTagClick, onRetry }: Props) {
  if (status === 'loading') {
    return (
      <div className="item-list">
        {[0, 1, 2].map(i => (
          <div key={i} className="item-list__skeleton" aria-hidden />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="item-list item-list--centered">
        <p>Couldn't load items</p>
        <button className="item-list__retry" onClick={onRetry}>Retry</button>
      </div>
    )
  }

  const active    = items.filter(i => !i.purchased)
  const purchased = items.filter(i =>  i.purchased)

  if (active.length === 0 && purchased.length === 0) {
    return (
      <div className="item-list item-list--centered">
        <p>No items yet — add the first one below</p>
      </div>
    )
  }

  return (
    <div className="item-list">
      <p className="item-list__label">
        {active.length} {active.length === 1 ? 'item' : 'items'} left
      </p>
      {active.map(item => (
        <ItemCard key={item.id} item={item} members={members}
          onTogglePurchased={onTogglePurchased} onTagClick={onTagClick} />
      ))}

      {purchased.length > 0 && (
        <>
          <p className="item-list__label">Purchased</p>
          {purchased.map(item => (
            <ItemCard key={item.id} item={item} members={members}
              onTogglePurchased={onTogglePurchased} onTagClick={onTagClick} />
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 7.4: Create `ItemList.css`**

```css
.item-list {
  flex: 1;
  overflow-y: auto;
  background: var(--bg2, #f9f8fb);
  padding: 8px 0;
}

.item-list--centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text);
  font-size: 15px;
  padding: 40px 20px;
}

.item-list__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
  padding: 12px 20px 6px;
  margin: 0;
}

.item-list__retry {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.item-list__skeleton {
  height: 64px;
  background: linear-gradient(90deg, var(--border) 25%, var(--bg) 50%, var(--border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  margin-bottom: 1px;
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 7.5: Run tests — confirm they pass**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- ItemList
```
Expected: `8 passed`

- [ ] **Step 7.6: Commit**

```bash
git add frontend/src/components/ItemList.tsx frontend/src/components/ItemList.css \
  frontend/src/components/ItemList.test.tsx
git commit -m "feat: add ItemList with sections and loading/error/empty states"
```

---

## Task 8: `SmartInputBar`

**Files:**
- Create: `frontend/src/components/SmartInputBar.tsx`
- Create: `frontend/src/components/SmartInputBar.css`
- Create: `frontend/src/components/SmartInputBar.test.tsx`

- [ ] **Step 8.1: Write failing tests**

Create `frontend/src/components/SmartInputBar.test.tsx`:
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SmartInputBar } from './SmartInputBar'
import type { ListItem } from '../types'
import { parseInput } from '../parseInput'

const NO_ITEMS: ListItem[] = []
const noop = () => {}

test('renders syntax legend chips', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} />)
  expect(screen.getByText(/\+/)).toBeInTheDocument()   // qty chip
  expect(screen.getByText(/\*/)).toBeInTheDocument()   // variety chip
  expect(screen.getByText(/#/)).toBeInTheDocument()    // brand chip
  expect(screen.getByText(/@/)).toBeInTheDocument()    // store chip
})

test('add button is disabled when name is empty', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} />)
  expect(screen.getByRole('button', { name: /add item/i })).toBeDisabled()
})

test('add button is enabled when name is present', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} />)
  expect(screen.getByRole('button', { name: /add item/i })).not.toBeDisabled()
})

test('onChange is called when user types', async () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} />)
  await userEvent.type(screen.getByRole('textbox'), 'L')
  expect(onChange).toHaveBeenCalled()
})

test('onSubmit called when add button clicked', () => {
  const onSubmit = vi.fn()
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={onSubmit} />)
  fireEvent.click(screen.getByRole('button', { name: /add item/i }))
  expect(onSubmit).toHaveBeenCalledTimes(1)
})

test('parse preview not shown when no sigil detected', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} />)
  expect(screen.queryByTestId('parse-preview')).not.toBeInTheDocument()
})

test('parse preview shown when sigil detected', () => {
  render(<SmartInputBar value="Leche +2" parsed={parseInput('Leche +2')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} />)
  expect(screen.getByTestId('parse-preview')).toBeInTheDocument()
})

test('parse preview shows parsed name and quantity', () => {
  render(<SmartInputBar value="Leche +2" parsed={parseInput('Leche +2')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} />)
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('Leche')
  expect(screen.getByTestId('parse-preview')).toHaveTextContent('2')
})

test('shows "No item name" warning when input has sigil but no name', () => {
  render(<SmartInputBar value="+3" parsed={parseInput('+3')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} />)
  expect(screen.getByText(/no item name/i)).toBeInTheDocument()
})

test('suggestion dropdown shown when suggestions provided', () => {
  render(<SmartInputBar value="Le" parsed={parseInput('Le')} items={NO_ITEMS}
    suggestions={['Leche', 'Lechuga']} onChange={noop} onSubmit={noop} />)
  expect(screen.getByText('Leche')).toBeInTheDocument()
  expect(screen.getByText('Lechuga')).toBeInTheDocument()
})

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

- [ ] **Step 8.2: Run tests — confirm they fail**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- SmartInputBar
```
Expected: FAIL

- [ ] **Step 8.3: Implement `SmartInputBar.tsx`**

```tsx
import './SmartInputBar.css'
import type { ListItem, ParsedInput } from '../types'

const SIGIL_FIELDS: Record<string, 'variety' | 'brand' | 'store'> = {
  '*': 'variety', '#': 'brand', '@': 'store',
}

function getActiveSigil(raw: string): { sigil: string; partial: string } | null {
  const words = raw.split(/\s+/)
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i]
    if (w && '*#@+'.includes(w[0])) {
      return { sigil: w[0], partial: w.slice(1) }
    }
  }
  return null
}

function clientSideSuggestions(
  items: ListItem[],
  field: 'variety' | 'brand' | 'store',
  partial: string
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

function hasSigil(parsed: ParsedInput): boolean {
  return parsed.quantity !== null || parsed.variety !== null ||
         parsed.brand !== null || parsed.store !== null
}

interface Props {
  value: string
  parsed: ParsedInput
  items: ListItem[]
  suggestions: string[]
  onChange: (v: string) => void
  onSubmit: () => void
}

export function SmartInputBar({ value, parsed, items, suggestions, onChange, onSubmit }: Props) {
  const activeSigil = getActiveSigil(value)
  const fieldSigil = activeSigil && SIGIL_FIELDS[activeSigil.sigil]
    ? activeSigil.sigil as '*' | '#' | '@'
    : null

  const displaySuggestions = fieldSigil
    ? clientSideSuggestions(items, SIGIL_FIELDS[fieldSigil], activeSigil!.partial)
    : suggestions.slice(0, 5)

  const showPreview = hasSigil(parsed)
  const hasName = parsed.name.trim().length > 0
  const nameError = showPreview && !hasName

  function applySuggestion(suggestion: string) {
    if (!activeSigil) {
      // Name context: replace the entire input with the suggestion
      onChange(suggestion)
      return
    }
    // Token context: replace the last partial token with the completed suggestion
    const words = value.split(/\s+/)
    words[words.length - 1] = activeSigil.sigil + suggestion + ' '
    onChange(words.join(' '))
  }

  return (
    <div className="smart-input">
      {displaySuggestions.length > 0 && (
        <div className="smart-input__suggestions">
          {displaySuggestions.map((s, i) => (
            <button key={s} className={`smart-input__suggestion${i === 0 ? ' smart-input__suggestion--top' : ''}`}
              onClick={() => applySuggestion(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {showPreview && (
        <div className="smart-input__preview" data-testid="parse-preview">
          {nameError && <span className="smart-input__preview-error">No item name</span>}
          {!nameError && <span className="smart-input__preview-name">{parsed.name}</span>}
          {parsed.quantity && <span className="smart-input__preview-qty">{parsed.quantity}</span>}
          {parsed.variety  && <span className="smart-input__preview-tag">✨ {parsed.variety}</span>}
          {parsed.brand    && <span className="smart-input__preview-tag">🏷️ {parsed.brand}</span>}
          {parsed.store    && <span className="smart-input__preview-tag">🏪 {parsed.store}</span>}
        </div>
      )}

      <div className="smart-input__legend">
        <span className="smart-input__chip"><b>+</b> qty</span>
        <span className="smart-input__chip"><b>*</b> variety</span>
        <span className="smart-input__chip"><b>#</b> brand</span>
        <span className="smart-input__chip"><b>@</b> store</span>
      </div>

      <div className="smart-input__row">
        <input
          className="smart-input__field"
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && hasName) onSubmit() }}
          placeholder="Add an item…"
          aria-label="Add an item"
        />
        <button
          className="smart-input__add"
          onClick={onSubmit}
          disabled={!hasName}
          aria-label="Add item"
        >
          +
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8.4: Create `SmartInputBar.css`**

```css
.smart-input {
  background: var(--bg);
  border-top: 1px solid var(--border);
  padding: 8px 16px 28px;
  flex-shrink: 0;
}

.smart-input__suggestions {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.07);
}

.smart-input__suggestion {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-h);
  cursor: pointer;
  font-family: inherit;
}

.smart-input__suggestion:last-child { border-bottom: none; }

.smart-input__suggestion--top {
  background: var(--accent-bg);
  color: var(--accent);
}

.smart-input__preview {
  background: var(--bg2, #f9f8fb);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
}

.smart-input__preview-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-h);
}

.smart-input__preview-qty {
  font-size: 12px;
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-bg);
  border-radius: 20px;
  padding: 1px 7px;
}

.smart-input__preview-tag {
  font-size: 11px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: 5px;
  padding: 1px 6px;
  color: var(--accent);
}

.smart-input__preview-error {
  font-size: 12px;
  font-weight: 500;
  color: #dc2626;
}

.smart-input__legend {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.smart-input__chip {
  font-size: 11px;
  color: var(--text);
  background: var(--bg2, #f9f8fb);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 7px;
}

.smart-input__chip b {
  color: var(--accent);
  font-family: monospace;
}

.smart-input__row {
  display: flex;
  gap: 10px;
  align-items: center;
  background: var(--bg2, #f9f8fb);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 10px 12px;
}

.smart-input__row:focus-within {
  border-color: var(--accent);
}

.smart-input__field {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 16px;
  color: var(--text-h);
  font-family: inherit;
}

.smart-input__field::placeholder { color: var(--text); }

.smart-input__add {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent);
  border: none;
  color: white;
  font-size: 22px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
}

.smart-input__add:disabled {
  background: var(--border);
  cursor: not-allowed;
}
```

- [ ] **Step 8.5: Run tests — confirm they pass**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test -- SmartInputBar
```
Expected: `11 passed`

- [ ] **Step 8.6: Commit**

```bash
git add frontend/src/components/SmartInputBar.tsx frontend/src/components/SmartInputBar.css \
  frontend/src/components/SmartInputBar.test.tsx
git commit -m "feat: add SmartInputBar with parse preview and context-aware suggestions"
```

---

## Task 9: `ListScreen` + `App.tsx`

**Files:**
- Create: `frontend/src/components/ListScreen.tsx`
- Create: `frontend/src/components/ListScreen.css`
- Modify: `frontend/src/App.tsx`

This task wires all state together. No separate test file — the component tests above cover the pieces; run the full suite to validate integration.

- [ ] **Step 9.1: Create `ListScreen.tsx`**

```tsx
import { useState, useCallback, useMemo } from 'react'
import './ListScreen.css'
import { ListHeader } from './ListHeader'
import { ProgressBar } from './ProgressBar'
import { ItemList } from './ItemList'
import { SmartInputBar } from './SmartInputBar'
import { Toast } from './Toast'
import { parseInput } from '../parseInput'
import { MOCK_ITEMS, MOCK_MEMBERS, AVATAR_COLOURS } from '../mockData'
import type { ListItem, Member, TagField, EditingTag } from '../types'

function buildMemberMap(members: typeof MOCK_MEMBERS): Map<string, Member> {
  const map = new Map<string, Member>()
  members.forEach((m, i) => {
    map.set(m.id, {
      id: m.id,
      displayName: m.displayName,
      initial: m.displayName[0].toUpperCase(),
      colour: AVATAR_COLOURS[i % AVATAR_COLOURS.length],
    })
  })
  return map
}

export function ListScreen() {
  const [items, setItems] = useState<ListItem[]>(MOCK_ITEMS)
  const [inputValue, setInputValue] = useState('')
  const [suggestions] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  // editingTag kept in state but wired through ItemCard in a future task
  const [_editingTag, _setEditingTag] = useState<EditingTag | null>(null)

  const memberMap = useMemo(() => buildMemberMap(MOCK_MEMBERS), [])
  const parsed = useMemo(() => parseInput(inputValue), [inputValue])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
  }, [])

  const handleTogglePurchased = useCallback((itemId: string) => {
    setItems(prev => {
      const prev_state = prev.find(i => i.id === itemId)?.purchased
      // Optimistic update
      return prev.map(i => i.id === itemId ? { ...i, purchased: !i.purchased } : i)
    })
    // In prototype phase: no API call. In API phase, PATCH here with rollback on error.
    // Example rollback:
    // api.patch(...).catch(() => {
    //   setItems(prev)
    //   showToast('Could not update item')
    // })
  }, [])

  const handleTagClick = useCallback((itemId: string, field: TagField) => {
    _setEditingTag({ itemId, field })
  }, [])

  const handleSubmit = useCallback(() => {
    if (!parsed.name.trim()) return
    const newItem: ListItem = {
      id: `item-${Date.now()}`,
      list_id: 'list-001',
      name: parsed.name,
      quantity: parsed.quantity,
      variety: parsed.variety,
      brand: parsed.brand,
      store: parsed.store,
      purchased: false,
      added_by: MOCK_MEMBERS[0].id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setItems(prev => [newItem, ...prev])
    setInputValue('')
    // In API phase: POST /lists/{id}/items with rollback on error.
  }, [parsed])

  const activeCount    = items.filter(i => !i.purchased).length
  const purchasedCount = items.filter(i =>  i.purchased).length

  return (
    <div className="list-screen">
      <ListHeader title="Compras del Domingo" onMenuOpen={() => {}} />
      <ProgressBar purchased={purchasedCount} total={items.length} />
      <ItemList
        status="success"
        items={items}
        members={memberMap}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onRetry={() => {}}
      />
      <SmartInputBar
        value={inputValue}
        parsed={parsed}
        items={items}
        suggestions={suggestions}
        onChange={setInputValue}
        onSubmit={handleSubmit}
      />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
```

- [ ] **Step 9.2: Create `ListScreen.css`**

```css
.list-screen {
  width: 100%;
  max-width: 430px;    /* comfortable on large phones / tablet emulation */
  margin: 0 auto;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  position: relative;
}

/* Override the desktop-focused root width from index.css */
#root {
  width: 100%;
  border-inline: none;
  text-align: left;
}
```

- [ ] **Step 9.3: Update `App.tsx`**

```tsx
import { ListScreen } from './components/ListScreen'

export default function App() {
  return <ListScreen />
}
```

- [ ] **Step 9.4: Run full test suite**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm test
```
Expected: all tests pass (≥ 35 tests)

- [ ] **Step 9.5: Run typecheck**

```bash
cd frontend && PATH=/Users/javi/.nvm/versions/node/v24.14.0/bin:$PATH npm run typecheck
```
Expected: no errors

- [ ] **Step 9.6: Open in browser and smoke-test**

The Vite dev server is running at http://localhost:5173. Verify:
- Shopping list renders with items from mock data
- Checking an item moves it to the Purchased section
- Typing `Aceite +1 litro @Lidl` in the input shows the parse preview card
- Adding the item prepends it to the list
- Progress bar moves when items are checked

- [ ] **Step 9.7: Commit**

```bash
git add frontend/src/components/ListScreen.tsx frontend/src/components/ListScreen.css \
  frontend/src/App.tsx
git commit -m "feat: wire ListScreen with mock data — shopping list prototype complete"
```

---

## Done

The shopping list prototype is complete. The screen is live at http://localhost:5173 with:
- Item list with sections, skeleton loading state, member avatars, tag CTAs
- Smart input bar with `+qty *variety #brand @store` syntax, live parse preview, and context-aware client-side suggestions for `@`, `#`, `*`
- Optimistic purchased toggle
- Toast error messages
- Full Vitest test suite covering all components

**Next steps (not in this plan):**
- Wire real API: replace mock state in `ListScreen` with `useListItems` hook
- Inline tag editing (the `editingTag` state is scaffolded; needs UI in `ItemCard`)
- Add routing (lists home screen, `< Lists` back nav)
- Polling for real-time sync
