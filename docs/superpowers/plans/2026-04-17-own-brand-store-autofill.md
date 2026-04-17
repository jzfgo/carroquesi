# Own-Brand Store Autofill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user types a known supermarket own-brand (e.g. `#Hacendado`), automatically add its chain (e.g. Mercadona) as a store on the saved item, surfaced as a dismissible opt-out chip in the SmartInputBar suggestions row.

**Architecture:** A static `ownBrands.ts` lookup module feeds a `useOwnBrandInference` hook that owns the dismissed state and exposes `visibleChip` / `storeToAdd` / `dismiss`. `ListScreen` calls the hook, threads `visibleChip` and `dismiss` into `SmartInputBar` as new optional props, and merges `storeToAdd` into `parsed.stores` before calling `addItem`. No backend changes.

**Tech Stack:** React 18 + TypeScript, Vitest + Testing Library, CSS custom properties (existing theme vars).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/lib/ownBrands.ts` | Static brand→chain lookup map + `lookupOwnBrandStore()` |
| Create | `frontend/src/lib/ownBrands.test.ts` | Unit tests for the lookup function |
| Create | `frontend/src/hooks/useOwnBrandInference.ts` | Hook: infer store, own dismiss state |
| Create | `frontend/src/hooks/useOwnBrandInference.test.ts` | Unit tests for the hook |
| Modify | `frontend/src/components/SmartInputBar.tsx` | Add `inferredStoreChip` + `onDismissInferredStore` props; render chip |
| Modify | `frontend/src/components/SmartInputBar.css` | Add `.smart-input__suggestion--inferred` style |
| Modify | `frontend/src/components/SmartInputBar.test.tsx` | Tests for new chip rendering and dismiss |
| Modify | `frontend/src/components/ListScreen.tsx` | Call hook, thread props, merge store on submit |

---

## Task 1: Data layer — `ownBrands.ts`

**Files:**
- Create: `frontend/src/lib/ownBrands.ts`
- Create: `frontend/src/lib/ownBrands.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/ownBrands.test.ts`:

```ts
import { lookupOwnBrandStore } from './ownBrands'

describe('lookupOwnBrandStore', () => {
  test('null input returns null', () => {
    expect(lookupOwnBrandStore(null)).toBeNull()
  })

  test('empty string returns null', () => {
    expect(lookupOwnBrandStore('')).toBeNull()
  })

  test('unknown brand returns null', () => {
    expect(lookupOwnBrandStore('Danone')).toBeNull()
  })

  test('Hacendado → Mercadona (exact case)', () => {
    expect(lookupOwnBrandStore('Hacendado')).toBe('Mercadona')
  })

  test('hacendado → Mercadona (lowercase)', () => {
    expect(lookupOwnBrandStore('hacendado')).toBe('Mercadona')
  })

  test('HACENDADO → Mercadona (uppercase)', () => {
    expect(lookupOwnBrandStore('HACENDADO')).toBe('Mercadona')
  })

  test('Bosque Verde → Mercadona', () => {
    expect(lookupOwnBrandStore('Bosque Verde')).toBe('Mercadona')
  })

  test('Deliplus → Mercadona', () => {
    expect(lookupOwnBrandStore('Deliplus')).toBe('Mercadona')
  })

  test('Compy → Mercadona', () => {
    expect(lookupOwnBrandStore('Compy')).toBe('Mercadona')
  })

  test('Milbona → Lidl', () => {
    expect(lookupOwnBrandStore('Milbona')).toBe('Lidl')
  })

  test('Realvalle → Lidl', () => {
    expect(lookupOwnBrandStore('Realvalle')).toBe('Lidl')
  })

  test('GutBio → Aldi', () => {
    expect(lookupOwnBrandStore('GutBio')).toBe('Aldi')
  })

  test('Milsani → Aldi', () => {
    expect(lookupOwnBrandStore('Milsani')).toBe('Aldi')
  })

  test('Auchan → Alcampo', () => {
    expect(lookupOwnBrandStore('Auchan')).toBe('Alcampo')
  })

  test('Eroski → Eroski', () => {
    expect(lookupOwnBrandStore('Eroski')).toBe('Eroski')
  })

  test('Aliada → El Corte Inglés', () => {
    expect(lookupOwnBrandStore('Aliada')).toBe('El Corte Inglés')
  })

  test('IFA Eliges → Gadis', () => {
    expect(lookupOwnBrandStore('IFA Eliges')).toBe('Gadis')
  })

  test('Consum → Consum', () => {
    expect(lookupOwnBrandStore('Consum')).toBe('Consum')
  })

  test('DIA → DIA', () => {
    expect(lookupOwnBrandStore('DIA')).toBe('DIA')
  })

  test('Alipende → Ahorramas', () => {
    expect(lookupOwnBrandStore('Alipende')).toBe('Ahorramas')
  })

  test('leading/trailing whitespace is ignored', () => {
    expect(lookupOwnBrandStore('  Hacendado  ')).toBe('Mercadona')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd frontend && npm run test -- src/lib/ownBrands.test.ts
```

Expected: all tests fail with `Cannot find module './ownBrands'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/ownBrands.ts`:

```ts
const OWN_BRAND_MAP: Record<string, string> = {
  // Mercadona
  'hacendado': 'Mercadona',
  'bosque verde': 'Mercadona',
  'deliplus': 'Mercadona',
  'deliplus baby': 'Mercadona',
  'compy': 'Mercadona',
  // Carrefour
  'carrefour bio': 'Carrefour',
  'carrefour home': 'Carrefour',
  'carrefour soft': 'Carrefour',
  'carrefour': 'Carrefour',
  'selection': 'Carrefour',
  'no. 1': 'Carrefour',
  'tex': 'Carrefour',
  // Lidl
  'milbona': 'Lidl',
  'realvalle': 'Lidl',
  'w5': 'Lidl',
  'formil': 'Lidl',
  'cien': 'Lidl',
  'lupilu': 'Lidl',
  'deluxe': 'Lidl',
  'silvercrest': 'Lidl',
  // Aldi
  'gutbio': 'Aldi',
  'milsani': 'Aldi',
  'tandil': 'Aldi',
  'mildeen': 'Aldi',
  'el mercado': 'Aldi',
  'my night': 'Aldi',
  // DIA
  'dia': 'DIA',
  'as': 'DIA',
  'bonté': 'DIA',
  'delicious': 'DIA',
  'mari marinera': 'DIA',
  'baby smile': 'DIA',
  // Ahorramas
  'alipende': 'Ahorramas',
  'lanta': 'Ahorramas',
  'bodyplus': 'Ahorramas',
  'meque': 'Ahorramas',
  // Alcampo
  'auchan': 'Alcampo',
  'cosmia': 'Alcampo',
  'producto económico': 'Alcampo',
  'inextenso': 'Alcampo',
  // Eroski
  'eroski natur': 'Eroski',
  'eroski': 'Eroski',
  'belle': 'Eroski',
  'seleqtia': 'Eroski',
  'sannia': 'Eroski',
  // El Corte Inglés
  'el corte inglés': 'El Corte Inglés',
  'aliada': 'El Corte Inglés',
  'hipercor': 'El Corte Inglés',
  'special line': 'El Corte Inglés',
  // Gadis
  'ifa eliges': 'Gadis',
  'ifa sabe': 'Gadis',
  'ifa unnia': 'Gadis',
  'peny': 'Gadis',
  'amigo': 'Gadis',
  // Consum
  'consum eco': 'Consum',
  'consum kids': 'Consum',
  'consum': 'Consum',
  'kyrey': 'Consum',
}

export function lookupOwnBrandStore(brand: string | null): string | null {
  if (!brand) return null
  return OWN_BRAND_MAP[brand.toLowerCase().trim()] ?? null
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd frontend && npm run test -- src/lib/ownBrands.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/lib/ownBrands.ts src/lib/ownBrands.test.ts
git commit -m "feat: add own-brand store lookup table"
```

---

## Task 2: `useOwnBrandInference` hook

**Files:**
- Create: `frontend/src/hooks/useOwnBrandInference.ts`
- Create: `frontend/src/hooks/useOwnBrandInference.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hooks/useOwnBrandInference.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { useOwnBrandInference } from './useOwnBrandInference'

describe('useOwnBrandInference', () => {
  test('unknown brand — visibleChip and storeToAdd are null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Danone', [])
    )
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('null brand — visibleChip and storeToAdd are null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference(null, [])
    )
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('known brand not in explicitStores — chip and storeToAdd are set', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', [])
    )
    expect(result.current.visibleChip).toBe('Mercadona')
    expect(result.current.storeToAdd).toBe('Mercadona')
  })

  test('known brand already in explicitStores (exact) — both null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', ['Mercadona'])
    )
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('known brand already in explicitStores (case-insensitive) — both null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', ['mercadona'])
    )
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('known brand with other stores but not its own — chip is shown', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', ['Carrefour'])
    )
    expect(result.current.visibleChip).toBe('Mercadona')
    expect(result.current.storeToAdd).toBe('Mercadona')
  })

  test('after dismiss — visibleChip and storeToAdd are null', () => {
    const { result } = renderHook(() =>
      useOwnBrandInference('Hacendado', [])
    )
    act(() => { result.current.dismiss() })
    expect(result.current.visibleChip).toBeNull()
    expect(result.current.storeToAdd).toBeNull()
  })

  test('dismissed state resets when brand changes', () => {
    let brand = 'Hacendado'
    const { result, rerender } = renderHook(() =>
      useOwnBrandInference(brand, [])
    )
    act(() => { result.current.dismiss() })
    expect(result.current.visibleChip).toBeNull()

    brand = 'Milbona'
    rerender()
    expect(result.current.visibleChip).toBe('Lidl')
    expect(result.current.storeToAdd).toBe('Lidl')
  })

  test('dismissed state resets when same brand re-entered after being cleared', () => {
    let brand: string | null = 'Hacendado'
    const { result, rerender } = renderHook(() =>
      useOwnBrandInference(brand, [])
    )
    act(() => { result.current.dismiss() })
    expect(result.current.visibleChip).toBeNull()

    brand = null
    rerender()
    brand = 'Hacendado'
    rerender()
    expect(result.current.visibleChip).toBe('Mercadona')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd frontend && npm run test -- src/hooks/useOwnBrandInference.test.ts
```

Expected: all tests fail with `Cannot find module './useOwnBrandInference'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/hooks/useOwnBrandInference.ts`:

```ts
import { useEffect, useState } from 'react'
import { lookupOwnBrandStore } from '../lib/ownBrands'

interface OwnBrandInference {
  visibleChip: string | null
  storeToAdd: string | null
  dismiss: () => void
}

export function useOwnBrandInference(
  brand: string | null,
  explicitStores: string[],
): OwnBrandInference {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(false)
  }, [brand])

  const inferredStore = lookupOwnBrandStore(brand)

  const alreadyAdded =
    inferredStore !== null &&
    explicitStores.some(s => s.toLowerCase() === inferredStore.toLowerCase())

  const active = !dismissed && !alreadyAdded && inferredStore !== null

  return {
    visibleChip: active ? inferredStore : null,
    storeToAdd: active ? inferredStore : null,
    dismiss: () => setDismissed(true),
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd frontend && npm run test -- src/hooks/useOwnBrandInference.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useOwnBrandInference.ts frontend/src/hooks/useOwnBrandInference.test.ts
git commit -m "feat: add useOwnBrandInference hook"
```

---

## Task 3: `SmartInputBar` — new props, chip rendering, and CSS

**Files:**
- Modify: `frontend/src/components/SmartInputBar.tsx`
- Modify: `frontend/src/components/SmartInputBar.css`
- Modify: `frontend/src/components/SmartInputBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append these tests to the end of `frontend/src/components/SmartInputBar.test.tsx` (before the final closing, after the existing `hasSigil` test):

```tsx
// ── Own-brand inferred store chip ────────────────────────────────────────────

test('inferredStoreChip renders as first suggestion with --inferred class', () => {
  render(<SmartInputBar value="Leche #Hacendado" parsed={parseInput('Leche #Hacendado')}
    items={NO_ITEMS} suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
    onScanRequest={noop} onEanSearch={noop} inferredStoreChip="Mercadona"
    onDismissInferredStore={noop} />)
  const chip = screen.getByTestId('inferred-store-chip')
  expect(chip).toBeInTheDocument()
  expect(chip).toHaveClass('smart-input__suggestion--inferred')
  expect(chip).toHaveTextContent('Mercadona')
})

test('inferredStoreChip renders before regular suggestions', () => {
  render(<SmartInputBar value="Le #Hacendado" parsed={parseInput('Le #Hacendado')}
    items={NO_ITEMS} suggestions={['Leche', 'Lechuga']} onChange={noop}
    onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop}
    inferredStoreChip="Mercadona" onDismissInferredStore={noop} />)
  const allButtons = screen.getAllByRole('button')
  const chipIndex = allButtons.findIndex(b => b.getAttribute('data-testid') === 'inferred-store-chip')
  const lecheIndex = allButtons.findIndex(b => b.textContent?.includes('Leche'))
  expect(chipIndex).toBeLessThan(lecheIndex)
})

test('tapping inferredStoreChip calls onDismissInferredStore', async () => {
  const onDismiss = vi.fn()
  render(<SmartInputBar value="Leche #Hacendado" parsed={parseInput('Leche #Hacendado')}
    items={NO_ITEMS} suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
    onScanRequest={noop} onEanSearch={noop} inferredStoreChip="Mercadona"
    onDismissInferredStore={onDismiss} />)
  await userEvent.click(screen.getByTestId('inferred-store-chip'))
  expect(onDismiss).toHaveBeenCalledTimes(1)
})

test('no inferredStoreChip prop — no extra chip rendered', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')}
    items={NO_ITEMS} suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
    onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.queryByTestId('inferred-store-chip')).not.toBeInTheDocument()
})

test('inferredStoreChip=null — no extra chip rendered', () => {
  render(<SmartInputBar value="Leche" parsed={parseInput('Leche')}
    items={NO_ITEMS} suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
    onScanRequest={noop} onEanSearch={noop} inferredStoreChip={null}
    onDismissInferredStore={noop} />)
  expect(screen.queryByTestId('inferred-store-chip')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd frontend && npm run test -- src/components/SmartInputBar.test.tsx
```

Expected: the 5 new tests fail, all pre-existing tests still pass.

- [ ] **Step 3: Update `SmartInputBar.tsx` — add props and render the chip**

In `frontend/src/components/SmartInputBar.tsx`, update the `Props` interface and component:

Find the `interface Props` block (around line 58) and add the two new optional props:
```ts
interface Props {
  value: string
  parsed: ParsedInput
  items: ListItem[]
  suggestions: string[]
  onChange: (v: string) => void
  onSubmit: () => void
  onClear: () => void
  onScanRequest: () => void
  onEanSearch: (ean: string) => void
  eanLoading?: boolean
  eanError?: string | null
  inferredStoreChip?: string | null
  onDismissInferredStore?: () => void
}
```

Find the component function signature and destructure the new props:
```ts
export function SmartInputBar({ value, parsed, items, suggestions, onChange, onSubmit, onClear, onScanRequest, onEanSearch, eanLoading, eanError, inferredStoreChip, onDismissInferredStore }: Props) {
```

Find the suggestions rendering block (currently `{displaySuggestions.length > 0 && (...)}`). Replace it entirely with:
```tsx
{(inferredStoreChip || displaySuggestions.length > 0) && (
  <div className="smart-input__suggestions">
    {inferredStoreChip && (
      <button
        className="smart-input__suggestion smart-input__suggestion--inferred"
        data-testid="inferred-store-chip"
        onClick={onDismissInferredStore}
        type="button"
      >
        🏪 {inferredStoreChip} <span aria-hidden="true">✕</span>
      </button>
    )}
    {displaySuggestions.map((s, i) => (
      <button key={s} className={`smart-input__suggestion${i === 0 ? ' smart-input__suggestion--top' : ''}`}
        onClick={() => applySuggestion(s)}>
        {s}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4: Add CSS for the inferred chip**

Append to `frontend/src/components/SmartInputBar.css`:

```css
.smart-input__suggestion--inferred {
  background: var(--bg2, #f9f8fb);
  border-left: 3px solid var(--accent);
  color: var(--text-h);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

- [ ] **Step 5: Run all SmartInputBar tests to confirm they pass**

```bash
cd frontend && npm run test -- src/components/SmartInputBar.test.tsx
```

Expected: all tests pass (existing + new 5).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/SmartInputBar.tsx frontend/src/components/SmartInputBar.css frontend/src/components/SmartInputBar.test.tsx
git commit -m "feat: add inferred-store chip to SmartInputBar"
```

---

## Task 4: Wire up `ListScreen`

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`

- [ ] **Step 1: Import the hook**

In `frontend/src/components/ListScreen.tsx`, add the import near the top with the other hook imports:

```ts
import { useOwnBrandInference } from '../hooks/useOwnBrandInference'
```

- [ ] **Step 2: Call the hook and update `handleSubmit`**

After the line `const parsed = useMemo(() => parseInput(inputValue), [inputValue]);` (around line 93), add:

```ts
const { visibleChip, storeToAdd, dismiss: dismissInferredStore } = useOwnBrandInference(
  parsed.brand,
  parsed.stores,
)
```

Find the `handleSubmit` callback (around line 174):

```ts
const handleSubmit = useCallback(() => {
  if (!parsed.name.trim()) return;
  void addItem(parsed);
  setInputValue("");
}, [parsed, addItem]);
```

Replace it with:

```ts
const handleSubmit = useCallback(() => {
  if (!parsed.name.trim()) return;
  const stores = storeToAdd
    ? [...new Set([...parsed.stores, storeToAdd])]
    : parsed.stores;
  void addItem({ ...parsed, stores });
  setInputValue("");
}, [parsed, addItem, storeToAdd]);
```

- [ ] **Step 3: Thread the new props into `SmartInputBar`**

Find the `<SmartInputBar` JSX block (around line 467). Add the two new props:

```tsx
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
  eanLoading={eanLookup.status === "loading"}
  eanError={eanLookup.status === "error" ? eanLookup.message : null}
  inferredStoreChip={visibleChip}
  onDismissInferredStore={dismissInferredStore}
/>
```

- [ ] **Step 4: Run the full test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 5: Type-check**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ListScreen.tsx
git commit -m "feat: wire own-brand store autofill into ListScreen"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run all tests one more time**

```bash
cd frontend && npm run test
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Type-check**

```bash
cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.
