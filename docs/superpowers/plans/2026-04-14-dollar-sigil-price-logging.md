# $ Sigil for Inline Price Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `$` sigil to SmartInputBar so users can type `leche $1,50 @Mercadona` to log price atomically with item creation, and migrate all existing price display to use `Intl`-based locale formatting.

**Architecture:** Price fields are added to `ItemCreate` (backend schema only — the router already uses `**body.model_dump()` so no router changes are needed). The frontend parser gains a dedicated `else if` branch for `$`/`€` that regex-validates the token and normalises the decimal separator before `parseFloat`. A shared `formatPrice` utility using `Intl.NumberFormat(undefined)` replaces all raw `.toFixed(2)` price display calls.

**Tech Stack:** FastAPI + SQLModel (backend), React + TypeScript + Vitest + Testing Library (frontend)

**Spec:** `docs/superpowers/specs/2026-04-14-dollar-sigil-price-logging-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `backend/app/schemas/items.py` | Modify | Add `price`, `price_per`, `price_store` to `ItemCreate` |
| `backend/tests/test_items.py` | Modify | Add test for item creation with inline price |
| `frontend/src/lib/formatPrice.ts` | **Create** | Shared `Intl`-based price formatter |
| `frontend/src/components/PriceHistorySheet.tsx` | Modify | Remove local `formatPrice`, use shared one |
| `frontend/src/components/ItemCard.tsx` | Modify | Replace raw price string with `formatPrice` |
| `frontend/src/types.ts` | Modify | Add `price` and `pricePer` to `ParsedInput` |
| `frontend/src/parseInput.ts` | Modify | Add `$`/`€` sigil branch |
| `frontend/src/parseInput.test.ts` | Modify | Price sigil test cases |
| `frontend/src/lib/api.ts` | Modify | Add price fields to `createItem` payload |
| `frontend/src/hooks/useListItems.ts` | Modify | Pass price fields in `addItem` |
| `frontend/src/components/SmartInputBar.tsx` | Modify | `$` chip, price preview pill |
| `frontend/src/components/SmartInputBar.test.tsx` | Modify | Tests for `$` chip and preview pill |

---

## Task 1: Backend — write failing test for inline price at item creation

**Files:**
- Modify: `backend/tests/test_items.py`

- [ ] **Step 1: Append this test to `backend/tests/test_items.py`**

```python
def test_add_item_with_inline_price(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={
            "name": "Leche",
            "price": 1.5,
            "price_per": None,
            "price_store": "Mercadona",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["price"] == 1.5
    assert body["price_per"] is None
    assert body["price_store"] == "Mercadona"


def test_add_item_with_inline_price_per_kg(client: TestClient):
    lst = _create_list(client)
    response = client.post(
        f"/lists/{lst['id']}/items",
        json={
            "name": "Arroz",
            "price": 3.2,
            "price_per": "KILOGRAM",
            "price_store": None,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["price"] == 3.2
    assert body["price_per"] == "KILOGRAM"
    assert body["price_store"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && uv run pytest tests/test_items.py::test_add_item_with_inline_price tests/test_items.py::test_add_item_with_inline_price_per_kg -v
```

Expected: FAIL — `422 Unprocessable Entity` because `ItemCreate` doesn't accept `price` yet.

---

## Task 2: Backend — extend `ItemCreate` to accept price fields

**Files:**
- Modify: `backend/app/schemas/items.py`

The `add_item` router spreads `ItemCreate` with `**body.model_dump()` onto `ListItem`, which already has `price`, `price_per`, `price_store` columns. No router changes needed.

- [ ] **Step 1: Edit `backend/app/schemas/items.py` — add price fields to `ItemCreate`**

Replace the existing `ItemCreate` class:

```python
class ItemCreate(BaseModel):
    name: str = Field(min_length=1)
    quantity: str | None = None
    brand: str | None = None
    stores: list[str] = Field(default_factory=list)
    ean: str | None = None
    price: float | None = None
    price_per: str | None = None
    price_store: str | None = None
```

- [ ] **Step 2: Run the new tests to verify they now pass**

```bash
cd backend && uv run pytest tests/test_items.py::test_add_item_with_inline_price tests/test_items.py::test_add_item_with_inline_price_per_kg -v
```

Expected: PASS

- [ ] **Step 3: Run the full backend test suite to check for regressions**

```bash
cd backend && uv run pytest
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/items.py backend/tests/test_items.py
git commit -m "feat(backend): accept price fields on item creation"
```

---

## Task 3: Frontend — create shared `formatPrice` utility

**Files:**
- Create: `frontend/src/lib/formatPrice.ts`

- [ ] **Step 1: Create `frontend/src/lib/formatPrice.ts`**

```typescript
export function formatPrice(amount: number, pricePer?: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
  return pricePer === 'KILOGRAM' ? `${formatted}/kg` : formatted
}
```

`Intl.NumberFormat(undefined)` uses the runtime locale — no locale string is hardcoded, so future locale changes require no code edits here.

- [ ] **Step 2: Run typecheck to confirm no errors**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/formatPrice.ts
git commit -m "feat(frontend): add Intl-based formatPrice utility"
```

---

## Task 4: Apply `formatPrice` to existing price display

**Files:**
- Modify: `frontend/src/components/PriceHistorySheet.tsx`
- Modify: `frontend/src/components/ItemCard.tsx`

- [ ] **Step 1: Edit `PriceHistorySheet.tsx` — remove local `formatPrice`, import shared**

At the top of the file, add the import:
```typescript
import { formatPrice } from '../lib/formatPrice'
```

Delete the local `formatPrice` function (lines 44–46):
```typescript
// DELETE this entire function:
function formatPrice(amount: number, pricePer: string | null): string {
  return pricePer === 'KILOGRAM' ? `€${amount.toFixed(2)}/kg` : `€${amount.toFixed(2)}`
}
```

The rest of the file calls `formatPrice(...)` with the same signature — they will now use the shared utility automatically.

- [ ] **Step 2: Edit `ItemCard.tsx` — replace raw price string**

Add import at top:
```typescript
import { formatPrice } from '../lib/formatPrice'
```

Find the price tag render block (around line 124–127) and replace:
```typescript
// BEFORE:
{item.price_per === 'KILOGRAM'
  ? `€${item.price.toFixed(2)}/kg`
  : `€${item.price.toFixed(2)}`}

// AFTER:
{formatPrice(item.price, item.price_per)}
```

- [ ] **Step 3: Run typecheck**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npm run test -- --run
```

Expected: all green (no test uses exact formatted price strings).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PriceHistorySheet.tsx frontend/src/components/ItemCard.tsx
git commit -m "refactor(frontend): use shared formatPrice utility for all price display"
```

---

## Task 5: Extend `ParsedInput` type

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Edit the `ParsedInput` interface in `frontend/src/types.ts`**

```typescript
export interface ParsedInput {
  name: string
  quantity: string | null
  brand: string | null
  stores: string[]
  ean?: string | null
  price?: number | null
  pricePer?: 'KILOGRAM' | null
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors (the new fields are optional so no callers break).

---

## Task 6: Write failing `parseInput` price sigil tests

**Files:**
- Modify: `frontend/src/parseInput.test.ts`

- [ ] **Step 1: Append a new `describe('$ price sigil', ...)` block to `frontend/src/parseInput.test.ts`**

```typescript
describe('$ price sigil', () => {
  test('$1,50 parses to price 1.5, pricePer null', () => {
    const result = parseInput('leche $1,50')
    expect(result.name).toBe('leche')
    expect(result.price).toBe(1.5)
    expect(result.pricePer).toBeNull()
  })

  test('€3,20/kg parses to price 3.2, pricePer KILOGRAM', () => {
    const result = parseInput('arroz €3,20/kg')
    expect(result.price).toBe(3.2)
    expect(result.pricePer).toBe('KILOGRAM')
  })

  test('dot as decimal separator also accepted: $1.50', () => {
    const result = parseInput('leche $1.50')
    expect(result.price).toBe(1.5)
    expect(result.pricePer).toBeNull()
  })

  test('$,50 parses to 0.5 (no integer part)', () => {
    const result = parseInput('leche $,50')
    expect(result.price).toBe(0.5)
  })

  test('$.50 parses to 0.5 (dot, no integer part)', () => {
    const result = parseInput('leche $.50')
    expect(result.price).toBe(0.5)
  })

  test('$1,5 single decimal digit parses correctly', () => {
    const result = parseInput('leche $1,5')
    expect(result.price).toBe(1.5)
  })

  test('$1500 integer-only parses correctly', () => {
    const result = parseInput('carne $1500')
    expect(result.price).toBe(1500)
  })

  test('$0 is valid (zero price)', () => {
    const result = parseInput('leche $0')
    expect(result.price).toBe(0)
  })

  test('$/kg with no number is ignored', () => {
    const result = parseInput('leche $/kg')
    expect(result.price).toBeUndefined()
  })

  test('bare $ with no number is ignored', () => {
    const result = parseInput('leche $')
    expect(result.price).toBeUndefined()
  })

  test('$abc non-numeric is ignored', () => {
    const result = parseInput('leche $abc')
    expect(result.price).toBeUndefined()
  })

  test('$1,500 three decimal digits is ignored (ambiguous)', () => {
    const result = parseInput('leche $1,500')
    expect(result.price).toBeUndefined()
  })

  test('$1.500 three decimal digits is ignored (ambiguous)', () => {
    const result = parseInput('leche $1.500')
    expect(result.price).toBeUndefined()
  })

  test('$1,50,30 two commas is ignored', () => {
    const result = parseInput('leche $1,50,30')
    expect(result.price).toBeUndefined()
  })

  test('$1.50.30 two dots is ignored', () => {
    const result = parseInput('leche $1.50.30')
    expect(result.price).toBeUndefined()
  })

  test('$1,50.30 mixed separators is ignored', () => {
    const result = parseInput('leche $1,50.30')
    expect(result.price).toBeUndefined()
  })

  test('$1, trailing separator is ignored', () => {
    const result = parseInput('leche $1,')
    expect(result.price).toBeUndefined()
  })

  test('$-1 negative is ignored', () => {
    const result = parseInput('leche $-1')
    expect(result.price).toBeUndefined()
  })

  test('first price sigil wins when two are present', () => {
    const result = parseInput('leche $1,50 $2,00')
    expect(result.price).toBe(1.5)
  })

  test('€ is accepted as alias for $', () => {
    const result = parseInput('leche €1,50')
    expect(result.price).toBe(1.5)
  })

  test('$/kg case-insensitive: $1,50/KG', () => {
    const result = parseInput('arroz $1,50/KG')
    expect(result.price).toBe(1.5)
    expect(result.pricePer).toBe('KILOGRAM')
  })

  test('price composes with other sigils', () => {
    const result = parseInput('leche $1,50 @Mercadona #Puleva')
    expect(result.name).toBe('leche')
    expect(result.price).toBe(1.5)
    expect(result.stores).toEqual(['Mercadona'])
    expect(result.brand).toBe('Puleva')
  })

  test('no price sigil: price field is undefined', () => {
    const result = parseInput('leche @Mercadona')
    expect(result.price).toBeUndefined()
    expect(result.pricePer).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run only the new tests to verify they all fail**

```bash
cd frontend && npm run test -- --run parseInput
```

Expected: the `$ price sigil` describe block all FAIL with "price is not a function" or "expected undefined to be 1.5" etc.

---

## Task 7: Implement `$`/`€` sigil parsing in `parseInput.ts`

**Files:**
- Modify: `frontend/src/parseInput.ts`

- [ ] **Step 1: Replace `frontend/src/parseInput.ts` with the following**

```typescript
import type { ParsedInput } from './types'

const SINGLE_SIGIL_MAP: Record<string, keyof Omit<ParsedInput, 'name' | 'stores'>> = {
  '+': 'quantity',
  '#': 'brand',
}

const PRICE_SIGILS = new Set(['$', '€'])
const PRICE_RE = /^(\d+([,.]\d{1,2})?|[,.]\d{1,2})(\/kg)?$/i

export function parseInput(raw: string): ParsedInput {
  const words = raw.trim().split(/\s+/).filter(Boolean)

  const result: ParsedInput = { name: '', quantity: null, brand: null, stores: [] }
  const nameWords: string[] = []

  let currentField: keyof Omit<ParsedInput, 'name' | 'stores'> | '@' | null = null
  const tokenWords: Record<string, string[]> = {}
  const storeEntries: string[][] = []

  for (const word of words) {
    const sigil = word[0]

    if (sigil === '|') {
      const digits = word.slice(1)
      if (/^\d{8}$|^\d{13}$/.test(digits) && result.ean === undefined) {
        result.ean = digits
      }
    } else if (PRICE_SIGILS.has(sigil)) {
      if (result.price === undefined) {
        const rest = word.slice(1)
        const match = rest.match(PRICE_RE)
        if (match) {
          const normalized = match[1].replace(/[,.]/, '.')
          result.price = parseFloat(normalized)
          result.pricePer = match[3] ? 'KILOGRAM' : null
        }
      }
      // Price is single-token: do not update currentField
    } else if (sigil === '@') {
      storeEntries.push([word.slice(1)])
      currentField = '@'
    } else if (sigil in SINGLE_SIGIL_MAP) {
      const field = SINGLE_SIGIL_MAP[sigil]
      if (!(field in tokenWords)) {
        tokenWords[field] = [word.slice(1)]
      }
      currentField = field
    } else if (currentField === '@') {
      storeEntries[storeEntries.length - 1].push(word)
    } else if (currentField) {
      tokenWords[currentField as string].push(word)
    } else {
      nameWords.push(word)
    }
  }

  result.name = nameWords.join(' ')

  for (const [field, parts] of Object.entries(tokenWords)) {
    if (parts.length > 0 && parts.join('').length > 0) {
      (result as unknown as Record<string, unknown>)[field] = parts.join(' ')
    }
  }

  result.stores = storeEntries
    .map(parts => parts.join(' ').trim())
    .filter(s => s.length > 0)

  return result
}
```

- [ ] **Step 2: Run all `parseInput` tests**

```bash
cd frontend && npm run test -- --run parseInput
```

Expected: all PASS including the new `$ price sigil` block.

- [ ] **Step 3: Run the full frontend test suite**

```bash
cd frontend && npm run test -- --run
```

Expected: all green.

- [ ] **Step 4: Run typecheck**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts frontend/src/parseInput.ts frontend/src/parseInput.test.ts
git commit -m "feat(frontend): add \$ sigil for inline price parsing"
```

---

## Task 8: Wire price fields through `api.ts` and `useListItems`

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/hooks/useListItems.ts`

- [ ] **Step 1: Edit `frontend/src/lib/api.ts` — add price fields to `createItem` payload**

Find the `createItem` function and extend its payload type:

```typescript
export function createItem(
  getToken: () => Promise<string>,
  listId: string,
  payload: {
    name: string
    quantity?: string | null
    brand?: string | null
    stores?: string[]
    ean?: string | null
    price?: number | null
    price_per?: 'KILOGRAM' | null
    price_store?: string | null
  },
) {
  return apiFetch(getToken, `/lists/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
```

- [ ] **Step 2: Edit `frontend/src/hooks/useListItems.ts` — pass price fields in `addItem`**

Find the `addItem` callback. Replace the `createItem` call block:

```typescript
const addItem = useCallback(
  async (parsed: ParsedInput) => {
    const tempId = `tmp-${Date.now()}`
    const priceStore = parsed.price != null ? (parsed.stores[0] ?? null) : null
    const temp: ListItem = {
      id: tempId,
      list_id: listId,
      name: parsed.name,
      quantity: parsed.quantity,
      brand: parsed.brand,
      stores: parsed.stores,
      purchased: false,
      purchased_at: null,
      ean: null,
      price: parsed.price ?? null,
      price_per: parsed.pricePer ?? null,
      price_store: priceStore,
      added_by: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setItems((prev) => {
      const firstPurchasedIdx = prev.findIndex((i) => i.purchased)
      if (firstPurchasedIdx === -1) return [...prev, temp]
      return [
        ...prev.slice(0, firstPurchasedIdx),
        temp,
        ...prev.slice(firstPurchasedIdx),
      ]
    })
    try {
      const created = (await createItem(getToken, listId, {
        name: parsed.name,
        quantity: parsed.quantity,
        brand: parsed.brand,
        stores: parsed.stores,
        ean: parsed.ean ?? null,
        price: parsed.price ?? null,
        price_per: parsed.pricePer ?? null,
        price_store: priceStore,
      })) as ListItem
      setItems((prev) => prev.map((i) => (i.id === tempId ? created : i)))
    } catch {
      setItems((prev) => prev.filter((i) => i.id !== tempId))
      showToast('No se pudo añadir el producto')
    }
  },
  [getToken, listId, showToast],
)
```

- [ ] **Step 3: Run typecheck**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npm run test -- --run
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/hooks/useListItems.ts
git commit -m "feat(frontend): pass inline price through addItem to createItem API"
```

---

## Task 9: Write failing SmartInputBar tests for `$` chip and preview

**Files:**
- Modify: `frontend/src/components/SmartInputBar.test.tsx`

- [ ] **Step 1: Append the following tests to `frontend/src/components/SmartInputBar.test.tsx`**

```typescript
// ── $ price sigil ──────────────────────────────────────────────────────────────

test('$ precio chip appears in legend', () => {
  render(<SmartInputBar value="" parsed={parseInput('')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByRole('button', { name: /añadir precio/i })).toBeInTheDocument()
})

test('price preview pill appears when parsed.price is set', () => {
  render(<SmartInputBar value="leche $1,50" parsed={parseInput('leche $1,50')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  const preview = screen.getByTestId('parse-preview')
  expect(preview).toBeInTheDocument()
  // The price pill contains the 💶 emoji
  expect(preview.textContent).toContain('💶')
})

test('price preview pill contains /kg when pricePer is KILOGRAM', () => {
  render(<SmartInputBar value="arroz $3,20/kg" parsed={parseInput('arroz $3,20/kg')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  const preview = screen.getByTestId('parse-preview')
  expect(preview.textContent).toContain('/kg')
})

test('price preview pill not shown when no price sigil', () => {
  render(<SmartInputBar value="leche @Mercadona" parsed={parseInput('leche @Mercadona')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  const preview = screen.getByTestId('parse-preview')
  expect(preview.textContent).not.toContain('💶')
})

test('tapping $ chip appends $ when not present', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="leche" parsed={parseInput('leche')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir precio/i }))
  expect(onChange).toHaveBeenCalledWith('leche $')
})

test('tapping $ chip is no-op when $ already present', () => {
  const onChange = vi.fn()
  render(<SmartInputBar value="leche $1,50" parsed={parseInput('leche $1,50')} items={NO_ITEMS}
    suggestions={[]} onChange={onChange} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  fireEvent.click(screen.getByRole('button', { name: /añadir precio/i }))
  expect(onChange).not.toHaveBeenCalled()
})

test('hasSigil triggers preview when only price is set (no other sigils)', () => {
  render(<SmartInputBar value="leche $1,50" parsed={parseInput('leche $1,50')} items={NO_ITEMS}
    suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop} onScanRequest={noop} onEanSearch={noop} />)
  expect(screen.getByTestId('parse-preview')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run just the SmartInputBar tests to verify new ones fail**

```bash
cd frontend && npm run test -- --run SmartInputBar
```

Expected: the new tests FAIL (no `$ precio` chip, no price preview pill yet).

---

## Task 10: Implement `$` chip and price preview in SmartInputBar

**Files:**
- Modify: `frontend/src/components/SmartInputBar.tsx`

- [ ] **Step 1: Edit `frontend/src/components/SmartInputBar.tsx`**

Add import at top:
```typescript
import { formatPrice } from '../lib/formatPrice'
```

Update `ALL_SIGILS`:
```typescript
const ALL_SIGILS = new Set(['+', '#', '@', '|', '$'])
```

Update `LEGEND_CHIPS`:
```typescript
const LEGEND_CHIPS: { sigil: string; label: string }[] = [
  { sigil: '+', label: 'cant.' },
  { sigil: '#', label: 'marca' },
  { sigil: '@', label: 'tienda' },
  { sigil: '$', label: 'precio' },
  { sigil: '|', label: 'cod. barras' },
]
```

Update `hasSigil` to include price:
```typescript
function hasSigil(parsed: ParsedInput): boolean {
  return parsed.quantity !== null || parsed.brand !== null || parsed.stores.length > 0 || parsed.price != null
}
```

Add price pill to the parse preview block. Find the `!inEanMode && showPreview` render block and add after the stores map:
```tsx
{!inEanMode && showPreview && (
  <div className="smart-input__preview" data-testid="parse-preview">
    {nameError && <span className="smart-input__preview-error">Sin nombre de producto</span>}
    {!nameError && <span className="smart-input__preview-name">{parsed.name}</span>}
    {parsed.quantity && <span className="smart-input__preview-qty">{parsed.quantity}</span>}
    {parsed.brand && <span className="smart-input__preview-tag">🏷️ {parsed.brand}</span>}
    {parsed.stores.map(s => (
      <span key={s} className="smart-input__preview-tag">🏪 {s}</span>
    ))}
    {parsed.price != null && (
      <span className="smart-input__preview-tag">💶 {formatPrice(parsed.price, parsed.pricePer)}</span>
    )}
  </div>
)}
```

Update `sigilChipAction` — `$` behaves like `#` (single-value: no-op if already present). The existing logic already handles this: `if (sigil !== '@' && currentValue.includes(sigil)) return null`. Since `$` is not `@`, this branch fires correctly. No change needed.

- [ ] **Step 2: Run SmartInputBar tests**

```bash
cd frontend && npm run test -- --run SmartInputBar
```

Expected: all PASS including the new `$ price sigil` tests.

- [ ] **Step 3: Run full frontend test suite**

```bash
cd frontend && npm run test -- --run
```

Expected: all green.

- [ ] **Step 4: Run typecheck**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SmartInputBar.tsx frontend/src/components/SmartInputBar.test.tsx
git commit -m "feat(frontend): add \$ sigil chip and price preview pill to SmartInputBar"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && uv run pytest
```

Expected: all green.

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend && npm run test -- --run
```

Expected: all green.

- [ ] **Step 3: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Run typecheck**

```bash
cd frontend && npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Update TODO.md — mark `$` sigil item as done**

In `TODO.md`, change:
```markdown
- [ ] **`$` sigil in SmartInputBar** — ...
```
to:
```markdown
- [x] **`$` sigil in SmartInputBar** — ...
```

- [ ] **Step 6: Final commit**

```bash
git add TODO.md
git commit -m "chore: mark \$ sigil feature as complete in TODO"
```
