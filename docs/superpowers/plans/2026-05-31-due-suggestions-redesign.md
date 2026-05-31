# Due Suggestions Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cycling `FrequencySuggestionBanner` with a ✨ button (left of the SmartInputBar input) that opens a bottom sheet listing due items with human-readable frequency and recency context.

**Architecture:** The backend adds `median_interval_days` and `days_since_last` to `DueSuggestionRead` (no new queries or migrations — values are already computed). The frontend gains two pure formatting utilities, a new `DueSuggestionsSheet` component, and a small extension to `SmartInputBar`. `ListScreen` wires them together; `FrequencySuggestionBanner` is deleted.

**Tech Stack:** FastAPI + Pydantic (backend), React + TypeScript + Vitest + Testing Library (frontend)

---

## File Map

| Action | Path |
|---|---|
| Modify | `backend/app/schemas/due_suggestions.py` |
| Modify | `backend/app/routers/suggestions.py` |
| Modify | `backend/tests/test_due_suggestions.py` |
| Modify | `frontend/src/types.ts` |
| Modify | `frontend/src/lib/suggestions.ts` |
| Modify | `frontend/src/lib/suggestions.test.ts` |
| **Create** | `frontend/src/components/DueSuggestionsSheet.tsx` |
| **Create** | `frontend/src/components/DueSuggestionsSheet.css` |
| **Create** | `frontend/src/components/DueSuggestionsSheet.test.tsx` |
| Modify | `frontend/src/components/SmartInputBar.tsx` |
| Modify | `frontend/src/components/SmartInputBar.css` |
| Modify | `frontend/src/components/SmartInputBar.test.tsx` |
| Modify | `frontend/src/components/ListScreen.tsx` |
| **Delete** | `frontend/src/components/FrequencySuggestionBanner.tsx` |
| **Delete** | `frontend/src/components/FrequencySuggestionBanner.css` |
| **Delete** | `frontend/src/components/FrequencySuggestionBanner.test.tsx` |

---

## Task 1: Backend — extend DueSuggestionRead and suggestions endpoint

**Files:**
- Modify: `backend/app/schemas/due_suggestions.py`
- Modify: `backend/app/routers/suggestions.py`
- Modify: `backend/tests/test_due_suggestions.py`

- [ ] **Step 1: Write the failing tests**

Append these two tests to `backend/tests/test_due_suggestions.py`:

```python
def test_due_suggestions_includes_median_interval_days(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # 3 purchases 14 days apart; median gap = 14
    for i in range(3, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Butter", now - timedelta(days=14 * i))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    assert response.status_code == 200
    data = response.json()
    butter = next(s for s in data if s["name"] == "Butter")
    assert abs(butter["median_interval_days"] - 14) < 0.1


def test_due_suggestions_includes_days_since_last(client: TestClient, session: Session, user):
    lst = _create_list(client)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Last purchase exactly 14 days ago; median=14
    for i in range(3, 0, -1):
        _add_purchased(session, lst["id"], user.id, "Cream", now - timedelta(days=14 * i))

    response = client.get(f"/lists/{lst['id']}/due-suggestions")
    data = response.json()
    cream = next(s for s in data if s["name"] == "Cream")
    assert abs(cream["days_since_last"] - 14) < 0.1
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd backend && uv run pytest tests/test_due_suggestions.py::test_due_suggestions_includes_median_interval_days tests/test_due_suggestions.py::test_due_suggestions_includes_days_since_last -v
```

Expected: FAIL — `KeyError: 'median_interval_days'`

- [ ] **Step 3: Add the two fields to the schema**

Replace the contents of `backend/app/schemas/due_suggestions.py`:

```python
from pydantic import BaseModel


class DueSuggestionRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]
    days_overdue: float
    dismissal_ttl_days: float
    median_interval_days: float
    days_since_last: float
```

- [ ] **Step 4: Thread the values through in the suggestions endpoint**

In `backend/app/routers/suggestions.py`, find the `results.append(DueSuggestionRead(...))` call (around line 128) and add the two new fields:

```python
        results.append(
            DueSuggestionRead(
                name=most_recent.name,
                brand=most_recent.brand,
                stores=most_recent.stores if most_recent.stores is not None else [],
                days_overdue=days_since_last - lower,
                dismissal_ttl_days=upper - days_since_last,
                median_interval_days=median_interval,
                days_since_last=days_since_last,
            )
        )
```

- [ ] **Step 5: Run all due-suggestions tests**

```bash
cd backend && uv run pytest tests/test_due_suggestions.py -v
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/due_suggestions.py backend/app/routers/suggestions.py backend/tests/test_due_suggestions.py
git commit -m "feat: expose median_interval_days and days_since_last in due suggestions"
```

---

## Task 2: Frontend types + formatting utilities

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/suggestions.ts`
- Modify: `frontend/src/lib/suggestions.test.ts`

- [ ] **Step 1: Write the failing utility tests**

Append to `frontend/src/lib/suggestions.test.ts`:

```ts
import { formatFrequency, formatRecency } from './suggestions'

describe('formatFrequency', () => {
  test('< 2 days → cada día', () => expect(formatFrequency(1)).toBe('cada día'))
  test('2 days → cada 2 días', () => expect(formatFrequency(2)).toBe('cada 2 días'))
  test('6 days → cada 6 días', () => expect(formatFrequency(6)).toBe('cada 6 días'))
  test('7 days → cada semana', () => expect(formatFrequency(7)).toBe('cada semana'))
  test('13 days → cada semana', () => expect(formatFrequency(13)).toBe('cada semana'))
  test('14 days → cada 2 semanas', () => expect(formatFrequency(14)).toBe('cada 2 semanas'))
  test('21 days → cada 3 semanas', () => expect(formatFrequency(21)).toBe('cada 3 semanas'))
  test('28 days → cada mes', () => expect(formatFrequency(28)).toBe('cada mes'))
  test('59 days → cada mes', () => expect(formatFrequency(59)).toBe('cada mes'))
  test('60 days → cada 2 meses', () => expect(formatFrequency(60)).toBe('cada 2 meses'))
  test('90 days → cada 3 meses', () => expect(formatFrequency(90)).toBe('cada 3 meses'))
})

describe('formatRecency', () => {
  test('3 days → hace 3 días', () => expect(formatRecency(3)).toBe('hace 3 días'))
  test('13 days → hace 13 días', () => expect(formatRecency(13)).toBe('hace 13 días'))
  test('14 days → hace 2 semanas', () => expect(formatRecency(14)).toBe('hace 2 semanas'))
  test('21 days → hace 3 semanas', () => expect(formatRecency(21)).toBe('hace 3 semanas'))
  test('60 days → hace 2 meses', () => expect(formatRecency(60)).toBe('hace 2 meses'))
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd frontend && npm test -- src/lib/suggestions.test.ts
```

Expected: FAIL — `formatFrequency is not a function`

- [ ] **Step 3: Add the two utility functions to suggestions.ts**

Append to `frontend/src/lib/suggestions.ts` (after the existing `clientSideSuggestions` function):

```ts
export function formatFrequency(days: number): string {
  if (days < 2) return 'cada día'
  if (days < 7) return `cada ${Math.round(days)} días`
  if (days < 14) return 'cada semana'
  if (days < 28) return `cada ${Math.round(days / 7)} semanas`
  if (days < 60) return 'cada mes'
  return `cada ${Math.round(days / 30)} meses`
}

export function formatRecency(days: number): string {
  if (days < 14) return `hace ${Math.round(days)} días`
  if (days < 60) return `hace ${Math.round(days / 7)} semanas`
  return `hace ${Math.round(days / 30)} meses`
}
```

- [ ] **Step 4: Update the DueSuggestion type in types.ts**

Find the `DueSuggestion` interface in `frontend/src/types.ts` (around line 41) and add the two new fields:

```ts
export interface DueSuggestion {
  name: string
  brand: string | null
  stores: string[]
  days_overdue: number
  dismissal_ttl_days: number
  median_interval_days: number
  days_since_last: number
}
```

- [ ] **Step 5: Run the utility tests**

```bash
cd frontend && npm test -- src/lib/suggestions.test.ts
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/lib/suggestions.ts frontend/src/lib/suggestions.test.ts
git commit -m "feat: add formatFrequency/formatRecency utilities and extend DueSuggestion type"
```

---

## Task 3: DueSuggestionsSheet component

**Files:**
- Create: `frontend/src/components/DueSuggestionsSheet.tsx`
- Create: `frontend/src/components/DueSuggestionsSheet.css`
- Create: `frontend/src/components/DueSuggestionsSheet.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `frontend/src/components/DueSuggestionsSheet.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { DueSuggestionsSheet } from './DueSuggestionsSheet'
import type { DueSuggestion } from '../types'

const makeSuggestion = (name: string, overrides: Partial<DueSuggestion> = {}): DueSuggestion => ({
  name,
  brand: 'Dodot',
  stores: ['Mercadona'],
  days_overdue: 1,
  dismissal_ttl_days: 5,
  median_interval_days: 7,
  days_since_last: 8,
  ...overrides,
})

const baseProps = {
  suggestions: [makeSuggestion('Pañales'), makeSuggestion('Leche')],
  onAdd: vi.fn(),
  onDismiss: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

test('renders all suggestion names', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  expect(screen.getByText('Pañales')).toBeInTheDocument()
  expect(screen.getByText('Leche')).toBeInTheDocument()
})

test('renders frequency chip', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  // median_interval_days=7 → 'cada semana'
  expect(screen.getAllByText('cada semana').length).toBeGreaterThan(0)
})

test('renders recency chip', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  // days_since_last=8 → 'hace 8 días'
  expect(screen.getAllByText('hace 8 días').length).toBeGreaterThan(0)
})

test('clicking + Añadir calls onAdd with the suggestion', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  fireEvent.click(screen.getAllByRole('button', { name: /añadir/i })[0])
  expect(baseProps.onAdd).toHaveBeenCalledWith(baseProps.suggestions[0])
})

test('clicking ✕ calls onDismiss with the suggestion', () => {
  render(<DueSuggestionsSheet {...baseProps} />)
  fireEvent.click(screen.getAllByRole('button', { name: /ignorar/i })[0])
  expect(baseProps.onDismiss).toHaveBeenCalledWith(baseProps.suggestions[0])
})

test('calls onClose when suggestions list is empty', () => {
  const onClose = vi.fn()
  render(<DueSuggestionsSheet suggestions={[]} onAdd={vi.fn()} onDismiss={vi.fn()} onClose={onClose} />)
  expect(onClose).toHaveBeenCalled()
})

test('clicking overlay calls onClose', () => {
  const { container } = render(<DueSuggestionsSheet {...baseProps} />)
  fireEvent.click(container.querySelector('.due-suggestions-sheet__overlay')!)
  expect(baseProps.onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- src/components/DueSuggestionsSheet.test.tsx
```

Expected: FAIL — `Cannot find module './DueSuggestionsSheet'`

- [ ] **Step 3: Create the CSS file**

Create `frontend/src/components/DueSuggestionsSheet.css`:

```css
.due-suggestions-sheet__overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.due-suggestions-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--paper-0);
  border-top: 1px solid var(--border);
  border-radius: 16px 16px 0 0;
  padding: 8px 0 24px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

.due-suggestions-sheet__handle {
  width: 36px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  margin: 0 auto 12px;
  flex-shrink: 0;
}

.due-suggestions-sheet__title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--ink-0);
  padding: 0 16px 12px;
  flex-shrink: 0;
}

.due-suggestions-sheet__list {
  overflow-y: auto;
}

.due-suggestions-sheet__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
}

.due-suggestions-sheet__info {
  flex: 1;
  min-width: 0;
}

.due-suggestions-sheet__name {
  font-size: var(--fs-14);
  font-weight: 600;
  color: var(--ink-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.due-suggestions-sheet__meta {
  font-size: var(--fs-12);
  color: var(--ink-2);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.due-suggestions-sheet__chips {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.due-suggestions-sheet__chip--frequency {
  font-size: 11px;
  background: color-mix(in srgb, var(--tinta-0) 15%, transparent);
  color: var(--tinta-0);
  border-radius: 6px;
  padding: 2px 7px;
}

.due-suggestions-sheet__chip--recency {
  font-size: 11px;
  background: #1a2a1a;
  color: #6abf6a;
  border-radius: 6px;
  padding: 2px 7px;
}

.due-suggestions-sheet__add {
  background: var(--tinta-0);
  color: var(--accent-fg);
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: var(--fs-13);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
}

.due-suggestions-sheet__add:hover {
  background: var(--tinta-1);
}

.due-suggestions-sheet__dismiss {
  font-size: var(--fs-13);
  color: var(--ink-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  flex-shrink: 0;
  font-family: inherit;
  line-height: 1;
}
```

- [ ] **Step 4: Create the component**

Create `frontend/src/components/DueSuggestionsSheet.tsx`:

```tsx
import { useEffect } from 'react'
import './DueSuggestionsSheet.css'
import { formatFrequency, formatRecency } from '../lib/suggestions'
import type { DueSuggestion } from '../types'

interface Props {
  suggestions: DueSuggestion[]
  onAdd: (s: DueSuggestion) => void
  onDismiss: (s: DueSuggestion) => void
  onClose: () => void
}

export function DueSuggestionsSheet({ suggestions, onAdd, onDismiss, onClose }: Props) {
  useEffect(() => {
    if (suggestions.length === 0) onClose()
  }, [suggestions.length, onClose])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  if (suggestions.length === 0) return null

  return (
    <>
      <div className="due-suggestions-sheet__overlay" onClick={onClose} />
      <div
        className="due-suggestions-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Toca comprar"
      >
        <div className="due-suggestions-sheet__handle" />
        <p className="due-suggestions-sheet__title">Toca comprar</p>
        <div className="due-suggestions-sheet__list">
          {suggestions.map(s => {
            const meta = [s.brand, ...s.stores].filter(Boolean).join(' · ')
            return (
              <div key={s.name} className="due-suggestions-sheet__row">
                <div className="due-suggestions-sheet__info">
                  <div className="due-suggestions-sheet__name">{s.name}</div>
                  {meta && <div className="due-suggestions-sheet__meta">{meta}</div>}
                  <div className="due-suggestions-sheet__chips">
                    <span className="due-suggestions-sheet__chip--frequency">
                      {formatFrequency(s.median_interval_days)}
                    </span>
                    <span className="due-suggestions-sheet__chip--recency">
                      {formatRecency(s.days_since_last)}
                    </span>
                  </div>
                </div>
                <button
                  className="due-suggestions-sheet__add"
                  onClick={() => onAdd(s)}
                  aria-label={`Añadir ${s.name}`}
                >
                  + Añadir
                </button>
                <button
                  className="due-suggestions-sheet__dismiss"
                  onClick={() => onDismiss(s)}
                  aria-label={`Ignorar ${s.name}`}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Run the tests**

```bash
cd frontend && npm test -- src/components/DueSuggestionsSheet.test.tsx
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DueSuggestionsSheet.tsx frontend/src/components/DueSuggestionsSheet.css frontend/src/components/DueSuggestionsSheet.test.tsx
git commit -m "feat: add DueSuggestionsSheet with frequency and recency chips"
```

---

## Task 4: SmartInputBar ✨ button

**Files:**
- Modify: `frontend/src/components/SmartInputBar.tsx`
- Modify: `frontend/src/components/SmartInputBar.css`
- Modify: `frontend/src/components/SmartInputBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/SmartInputBar.test.tsx`:

```ts
test('✨ button renders when dueSuggestionsCount > 0', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop}
    dueSuggestionsCount={3} onDueSuggestionsOpen={noop} />)
  expect(screen.getByRole('button', { name: /sugerencias pendientes/i })).toBeInTheDocument()
})

test('✨ button absent when dueSuggestionsCount is 0', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop}
    dueSuggestionsCount={0} onDueSuggestionsOpen={noop} />)
  expect(screen.queryByRole('button', { name: /sugerencias pendientes/i })).not.toBeInTheDocument()
})

test('✨ button absent when dueSuggestionsCount is omitted', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.queryByRole('button', { name: /sugerencias pendientes/i })).not.toBeInTheDocument()
})

test('✨ button click calls onDueSuggestionsOpen', () => {
  const onDueSuggestionsOpen = vi.fn()
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop}
    dueSuggestionsCount={2} onDueSuggestionsOpen={onDueSuggestionsOpen} />)
  fireEvent.click(screen.getByRole('button', { name: /sugerencias pendientes/i }))
  expect(onDueSuggestionsOpen).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
cd frontend && npm test -- src/components/SmartInputBar.test.tsx
```

Expected: FAIL — the new tests fail because `dueSuggestionsCount` prop doesn't exist yet

- [ ] **Step 3: Add the CSS for the ✨ button**

Append to `frontend/src/components/SmartInputBar.css`:

```css
.smart-input__due-btn {
  background: color-mix(in srgb, var(--tinta-0) 15%, transparent);
  border: none;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-family: inherit;
  color: var(--tinta-0);
  font-size: 16px;
  line-height: 1;
}

.smart-input__due-badge {
  background: var(--tinta-0);
  color: var(--paper-0);
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  min-width: 16px;
  text-align: center;
  line-height: 1.4;
}
```

- [ ] **Step 4: Add props and render the button in SmartInputBar.tsx**

In `frontend/src/components/SmartInputBar.tsx`:

**Add two optional props to the `Props` interface** (after `isOffline?: boolean`):
```ts
  dueSuggestionsCount?: number
  onDueSuggestionsOpen?: () => void
```

**Update the destructured parameter** in the function signature to include the new props:
```ts
export function SmartInputBar({ value, parsed, items, suggestions, onChange, onSubmit, onClear, onScanRequest, onEanSearch, eanLoading, eanError, inferredStoreChip, onDismissInferredStore, isOffline = false, dueSuggestionsCount, onDueSuggestionsOpen }: Props) {
```

**Add the ✨ button inside `<div className="smart-input__row">`**, immediately before the existing `<input className="smart-input__field" ...>` element. The input itself and everything after it are unchanged — only insert this block before it:
```tsx
        {!!dueSuggestionsCount && dueSuggestionsCount > 0 && (
          <button
            className="smart-input__due-btn"
            onClick={onDueSuggestionsOpen}
            aria-label={`Sugerencias pendientes (${dueSuggestionsCount})`}
            type="button"
          >
            ✨
            <span className="smart-input__due-badge">{dueSuggestionsCount}</span>
          </button>
        )}
```

- [ ] **Step 5: Run SmartInputBar tests**

```bash
cd frontend && npm test -- src/components/SmartInputBar.test.tsx
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SmartInputBar.tsx frontend/src/components/SmartInputBar.css frontend/src/components/SmartInputBar.test.tsx
git commit -m "feat: add due suggestions button to SmartInputBar"
```

---

## Task 5: Wire up ListScreen + delete FrequencySuggestionBanner

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`
- Delete: `frontend/src/components/FrequencySuggestionBanner.tsx`
- Delete: `frontend/src/components/FrequencySuggestionBanner.css`
- Delete: `frontend/src/components/FrequencySuggestionBanner.test.tsx`

- [ ] **Step 1: Delete the old banner files**

```bash
rm frontend/src/components/FrequencySuggestionBanner.tsx
rm frontend/src/components/FrequencySuggestionBanner.css
rm frontend/src/components/FrequencySuggestionBanner.test.tsx
```

- [ ] **Step 2: Update ListScreen imports**

In `frontend/src/components/ListScreen.tsx`, replace:
```ts
import { FrequencySuggestionBanner } from "./FrequencySuggestionBanner";
```
with:
```ts
import { DueSuggestionsSheet } from "./DueSuggestionsSheet";
```

Also add `isDismissed` and `writeDismissal` to the existing dismissedSuggestions import. Find the line importing from `dismissedSuggestions` — if it doesn't exist yet, add:
```ts
import { isDismissed, writeDismissal } from "../lib/dismissedSuggestions";
```

- [ ] **Step 3: Add state and derived values**

In `ListScreen`, after the existing `const [dueSuggestions, setDueSuggestions] = useState<DueSuggestion[]>([]);` line, add:

```ts
const [dueSuggestionsOpen, setDueSuggestionsOpen] = useState(false);
```

Add a memoised filtered list right after (after other `useMemo` calls, e.g. near `parsed`):

```ts
const filteredDueSuggestions = useMemo(
  () => dueSuggestions.filter(s => !isDismissed(s.name)),
  [dueSuggestions],
)
```

- [ ] **Step 4: Add the dismiss handler**

In `ListScreen`, alongside the existing `handleSuggestionAdd` callback, add:

```ts
const handleSuggestionDismiss = useCallback(
  (s: DueSuggestion) => {
    writeDismissal(s.name, s.dismissal_ttl_days)
    setDueSuggestions(prev => prev.filter(x => x.name !== s.name))
  },
  [],
)
```

- [ ] **Step 5: Remove the banner, add the sheet, wire SmartInputBar**

In the JSX of `ListScreen`, find:
```tsx
<div className="bottom-panel">
  <FrequencySuggestionBanner
    suggestions={dueSuggestions}
    onAdd={handleSuggestionAdd}
  />
  <SmartInputBar
    ...
  />
</div>
```

Replace with:
```tsx
<div className="bottom-panel">
  <SmartInputBar
    value={inputValue}
    parsed={parsed}
    items={items}
    suggestions={suggestions}
    onChange={handleChange}
    onSubmit={handleSubmit}
    onClear={handleClear}
    onScanRequest={handleScanRequest}
    onEanSearch={handleEanSearch}
    isOffline={isOffline}
    eanLoading={eanLookup.status === "loading"}
    eanError={eanLookup.status === "error" ? eanLookup.message : null}
    inferredStoreChip={visibleChip}
    onDismissInferredStore={dismissInferredStore}
    dueSuggestionsCount={filteredDueSuggestions.length}
    onDueSuggestionsOpen={() => setDueSuggestionsOpen(true)}
  />
</div>
```

Also add the sheet mount alongside the other conditional sheets (e.g. near the `BarcodeScanner` block):
```tsx
{dueSuggestionsOpen && filteredDueSuggestions.length > 0 && (
  <DueSuggestionsSheet
    suggestions={filteredDueSuggestions}
    onAdd={s => { handleSuggestionAdd(s); }}
    onDismiss={handleSuggestionDismiss}
    onClose={() => setDueSuggestionsOpen(false)}
  />
)}
```

- [ ] **Step 6: Run the full frontend suite**

```bash
cd frontend && npm test
```

Expected: all tests PASS (FrequencySuggestionBanner tests gone, all others green)

- [ ] **Step 7: Typecheck**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors

- [ ] **Step 8: Run backend tests**

```bash
cd backend && uv run pytest
```

Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ListScreen.tsx
git add frontend/src/components/DueSuggestionsSheet.tsx  # already staged but safe to re-add
git rm frontend/src/components/FrequencySuggestionBanner.tsx
git rm frontend/src/components/FrequencySuggestionBanner.css
git rm frontend/src/components/FrequencySuggestionBanner.test.tsx
git commit -m "feat: replace FrequencySuggestionBanner with DueSuggestionsSheet"
```
