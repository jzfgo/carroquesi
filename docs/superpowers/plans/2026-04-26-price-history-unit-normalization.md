# Price History Mixed Unit Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize `PriceHistorySheet` chart entries to a common €/kg basis when an item's history mixes per-unit and per-weight prices, so trends are meaningful and cross-store comparisons are accurate.

**Architecture:** Add `quantity` to the `PriceEntry` API response (no migration — it's already on `ListItem`). Implement a pure `normalizeEntries()` function that converts per-unit entries to €/kg using each entry's own quantity field. Thread normalized amounts through `PriceHistorySheet`'s chart components and stats. The normalization trigger is global (fires if any entry has a parseable SI quantity or is explicitly €/kg); entries that can't be normalized render as isolated disconnected dots.

**Tech Stack:** FastAPI/Pydantic (backend schema), TypeScript (normalization logic), React + inline SVG (chart components), Vitest (frontend tests), pytest + pytest-httpx (backend tests)

---

## File Map

| File | Change |
|---|---|
| `backend/app/schemas/prices.py` | Add `quantity: str \| None` to `PriceEntry` |
| `backend/app/routers/prices.py` | Add `quantity=i.quantity` to `get_price_history` projection |
| `backend/tests/test_prices.py` | Add test: `quantity` present in `GET /prices` response |
| `frontend/src/types.ts` | Add `quantity: string \| null` to `PriceEntry` interface |
| `frontend/src/lib/itemCost.ts` | Export new `parseKgFactor` helper (delegates to existing `parseQuantityFactor`) |
| `frontend/src/lib/priceNormalization.ts` | New: `ChartEntry`, `NormalizationResult`, `normalizeEntries()` |
| `frontend/src/lib/priceNormalization.test.ts` | New: full test suite for `normalizeEntries` |
| `frontend/src/components/PriceHistorySheet.tsx` | Call normalization; update `StoreGroup`, `groupByStore`, `Sparkline`, `ExpandedChart`; add badges |
| `frontend/src/components/PriceHistorySheet.css` | Add `.phs__normalized-badge`, `.phs__gap-warning`, `.phs__record-original` |

---

## Task 1: Expose `quantity` in the price history API response

**Files:**
- Modify: `backend/app/schemas/prices.py`
- Modify: `backend/app/routers/prices.py`
- Test: `backend/tests/test_prices.py`

- [ ] **Step 1: Write the failing backend test**

  Add to `backend/tests/test_prices.py`:

  ```python
  def test_price_history_entry_includes_quantity(client: TestClient):
      lst = _make_list(client)
      item = client.post(
          f"/lists/{lst['id']}/items",
          json={"name": "Fresas", "quantity": "500g"},
      ).json()
      _set_price(client, lst["id"], item["id"], 1.50, store="Mercadona")

      resp = client.get(f"/lists/{lst['id']}/items/{item['id']}/prices?scope=this_list")
      assert resp.status_code == 200
      entries = resp.json()["entries"]
      assert len(entries) == 1
      assert entries[0]["quantity"] == "500g"
  ```

- [ ] **Step 2: Run the test to confirm it fails**

  ```bash
  cd backend && uv run pytest tests/test_prices.py::test_price_history_entry_includes_quantity -v
  ```

  Expected: `FAILED` — `quantity` key missing from response entry.

- [ ] **Step 3: Add `quantity` to the `PriceEntry` schema**

  Edit `backend/app/schemas/prices.py` — add the field to `PriceEntry`:

  ```python
  class PriceEntry(BaseModel):
      amount: float
      price_per: str | None
      store: str | None
      purchased_at: str | None = None
      quantity: str | None = None
  ```

- [ ] **Step 4: Populate `quantity` in the router projection**

  Edit `backend/app/routers/prices.py`, inside `get_price_history`, update the list comprehension:

  ```python
  entries = [
      PriceEntry(
          amount=i.price,
          price_per=i.price_per,
          store=i.price_store,
          purchased_at=i.purchased_at.isoformat() if i.purchased_at else None,
          quantity=i.quantity,
      )
      for i in items
  ]
  ```

- [ ] **Step 5: Run the test to confirm it passes**

  ```bash
  cd backend && uv run pytest tests/test_prices.py::test_price_history_entry_includes_quantity -v
  ```

  Expected: `PASSED`.

- [ ] **Step 6: Run the full backend test suite to check for regressions**

  ```bash
  cd backend && uv run pytest
  ```

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/app/schemas/prices.py backend/app/routers/prices.py backend/tests/test_prices.py
  git commit -m "feat(backend): expose quantity field in price history entries"
  ```

---

## Task 2: Frontend prep — add `quantity` to `PriceEntry` type and export `parseKgFactor`

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/itemCost.ts`

- [ ] **Step 1: Add `quantity` to the `PriceEntry` frontend type**

  Edit `frontend/src/types.ts` — update the `PriceEntry` interface:

  ```ts
  export interface PriceEntry {
    amount: number
    price_per: string | null
    store: string | null
    purchased_at: string | null
    quantity: string | null
  }
  ```

- [ ] **Step 2: Export `parseKgFactor` from `itemCost.ts`**

  Edit `frontend/src/lib/itemCost.ts` — add this function after `parseQuantityFactor`:

  ```ts
  /**
   * Returns the weight in kg for a quantity string (e.g. "500g" → 0.5, "1 kg" → 1),
   * or null if the quantity has no parseable SI unit.
   */
  export function parseKgFactor(quantity: string | null): number | null {
    return parseQuantityFactor(quantity, 'KILOGRAM')
  }
  ```

  `parseQuantityFactor(q, 'KILOGRAM')` already returns `value × UNIT_TO_KG[unit]` for SI units and `null` for everything else — exactly the behaviour `parseKgFactor` needs.

- [ ] **Step 3: Run existing itemCost tests to confirm no regressions**

  ```bash
  cd frontend && npm run test -- src/lib/itemCost.test.ts
  ```

  Expected: all tests pass.

- [ ] **Step 4: Run the TypeScript compiler to confirm types are consistent**

  ```bash
  cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/types.ts frontend/src/lib/itemCost.ts
  git commit -m "feat(frontend): add quantity to PriceEntry type and export parseKgFactor"
  ```

---

## Task 3: Implement `priceNormalization.ts` with TDD

**Files:**
- Create: `frontend/src/lib/priceNormalization.test.ts`
- Create: `frontend/src/lib/priceNormalization.ts`

- [ ] **Step 1: Write the failing tests**

  Create `frontend/src/lib/priceNormalization.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { normalizeEntries } from './priceNormalization'
  import type { PriceEntry } from '../types'

  function entry(overrides: Partial<PriceEntry> & { amount: number }): PriceEntry {
    return {
      price_per: null,
      store: null,
      purchased_at: null,
      quantity: null,
      ...overrides,
    }
  }

  describe('normalizeEntries', () => {
    it('passes through unchanged when all entries are per-unit with no SI quantity', () => {
      const entries = [entry({ amount: 0.89 }), entry({ amount: 0.95 })]
      const result = normalizeEntries(entries)
      expect(result.isNormalized).toBe(false)
      expect(result.hasGaps).toBe(false)
      expect(result.entries[0].displayAmount).toBe(0.89)
      expect(result.entries[0].displayPricePer).toBeNull()
      expect(result.entries[0].originalAmount).toBe(0.89)
    })

    it('passes through unchanged when all entries are already per-kg (no conversion needed)', () => {
      const entries = [
        entry({ amount: 1.20, price_per: 'KILOGRAM' }),
        entry({ amount: 1.30, price_per: 'KILOGRAM' }),
      ]
      const result = normalizeEntries(entries)
      expect(result.isNormalized).toBe(false)
      expect(result.hasGaps).toBe(false)
      expect(result.entries[0].displayAmount).toBe(1.20)
      expect(result.entries[0].displayPricePer).toBe('KILOGRAM')
    })

    it('normalizes all-per-unit entries to €/kg when they have SI quantities', () => {
      const entries = [
        entry({ amount: 0.60, quantity: '500g' }),
        entry({ amount: 2.80, quantity: '1 kg' }),
      ]
      const result = normalizeEntries(entries)
      expect(result.isNormalized).toBe(true)
      expect(result.hasGaps).toBe(false)
      expect(result.entries[0].displayAmount).toBeCloseTo(1.20) // 0.60 / 0.5
      expect(result.entries[1].displayAmount).toBeCloseTo(2.80) // 2.80 / 1.0
      expect(result.entries[0].displayPricePer).toBe('KILOGRAM')
    })

    it('normalizes per-unit entry to €/kg when history mixes per-unit and per-kg', () => {
      const entries = [
        entry({ amount: 0.60, quantity: '500g' }),         // per-unit, 500g pack
        entry({ amount: 1.20, price_per: 'KILOGRAM' }),    // already €/kg
      ]
      const result = normalizeEntries(entries)
      expect(result.isNormalized).toBe(true)
      expect(result.hasGaps).toBe(false)
      expect(result.entries[0].displayAmount).toBeCloseTo(1.20)
      expect(result.entries[1].displayAmount).toBeCloseTo(1.20)
      expect(result.entries[0].displayPricePer).toBe('KILOGRAM')
    })

    it('yields displayAmount=null for a per-unit entry with no parseable SI quantity when normalization mode is active', () => {
      const entries = [
        entry({ amount: 0.60, quantity: null }),          // can't normalize
        entry({ amount: 1.20, price_per: 'KILOGRAM' }),  // triggers normalization mode
      ]
      const result = normalizeEntries(entries)
      expect(result.isNormalized).toBe(false)  // no successful per-unit→€/kg conversion
      expect(result.hasGaps).toBe(true)
      expect(result.entries[0].displayAmount).toBeNull()
      expect(result.entries[1].displayAmount).toBe(1.20)
    })

    it('sets isNormalized=true only when a per-unit entry was actually converted', () => {
      // One convertible + one gap
      const entries = [
        entry({ amount: 0.60, quantity: '500g' }),
        entry({ amount: 0.80, quantity: null }),
        entry({ amount: 1.20, price_per: 'KILOGRAM' }),
      ]
      const result = normalizeEntries(entries)
      expect(result.isNormalized).toBe(true)
      expect(result.hasGaps).toBe(true)
    })

    it('preserves originalAmount and originalPricePer on each entry', () => {
      const entries = [entry({ amount: 0.60, quantity: '500g' })]
      const result = normalizeEntries(entries)
      expect(result.entries[0].originalAmount).toBe(0.60)
      expect(result.entries[0].originalPricePer).toBeNull()
    })

    it('handles comma decimal separator in quantity (e.g. "500,5g")', () => {
      const entries = [
        entry({ amount: 1.00, quantity: '500,5g' }),
        entry({ amount: 2.00, price_per: 'KILOGRAM' }),
      ]
      const result = normalizeEntries(entries)
      expect(result.entries[0].displayAmount).toBeCloseTo(1.00 / 0.5005)
    })

    it('returns entries in the same order as the input', () => {
      const entries = [
        entry({ amount: 1.0, purchased_at: '2026-01-01' }),
        entry({ amount: 2.0, purchased_at: '2026-02-01' }),
      ]
      const result = normalizeEntries(entries)
      expect(result.entries[0].purchased_at).toBe('2026-01-01')
      expect(result.entries[1].purchased_at).toBe('2026-02-01')
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they all fail**

  ```bash
  cd frontend && npm run test -- src/lib/priceNormalization.test.ts
  ```

  Expected: `FAIL` — module not found.

- [ ] **Step 3: Implement `priceNormalization.ts`**

  Create `frontend/src/lib/priceNormalization.ts`:

  ```ts
  import type { PriceEntry } from '../types'
  import { parseKgFactor } from './itemCost'

  export interface ChartEntry {
    displayAmount: number | null
    displayPricePer: 'KILOGRAM' | null
    store: string | null
    purchased_at: string | null
    originalAmount: number
    originalPricePer: string | null
  }

  export interface NormalizationResult {
    entries: ChartEntry[]
    isNormalized: boolean
    hasGaps: boolean
  }

  /**
   * Converts a flat list of PriceEntry records to ChartEntry records,
   * normalizing to €/kg when any entry has a parseable SI quantity or
   * is already price_per='KILOGRAM'. Entries that cannot be converted
   * get displayAmount=null (rendered as isolated dots).
   *
   * The trigger is global: if any entry qualifies, all entries are processed.
   * This enables cross-store comparison on a common scale.
   */
  export function normalizeEntries(entries: PriceEntry[]): NormalizationResult {
    const shouldNormalize = entries.some(
      e => e.price_per === 'KILOGRAM' || parseKgFactor(e.quantity) !== null,
    )

    if (!shouldNormalize) {
      return {
        entries: entries.map(e => ({
          displayAmount: e.amount,
          displayPricePer: e.price_per as 'KILOGRAM' | null,
          store: e.store,
          purchased_at: e.purchased_at,
          originalAmount: e.amount,
          originalPricePer: e.price_per,
        })),
        isNormalized: false,
        hasGaps: false,
      }
    }

    let isNormalized = false
    let hasGaps = false

    const normalized: ChartEntry[] = entries.map(e => {
      let displayAmount: number | null

      if (e.price_per === 'KILOGRAM') {
        displayAmount = e.amount
      } else {
        const kgFactor = parseKgFactor(e.quantity)
        if (kgFactor !== null) {
          displayAmount = e.amount / kgFactor
          isNormalized = true
        } else {
          displayAmount = null
          hasGaps = true
        }
      }

      return {
        displayAmount,
        displayPricePer: 'KILOGRAM' as const,
        store: e.store,
        purchased_at: e.purchased_at,
        originalAmount: e.amount,
        originalPricePer: e.price_per,
      }
    })

    return { entries: normalized, isNormalized, hasGaps }
  }
  ```

- [ ] **Step 4: Run tests to confirm they all pass**

  ```bash
  cd frontend && npm run test -- src/lib/priceNormalization.test.ts
  ```

  Expected: all tests `PASS`.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/lib/priceNormalization.ts frontend/src/lib/priceNormalization.test.ts
  git commit -m "feat(frontend): implement price history unit normalization logic"
  ```

---

## Task 4: Wire normalization into `PriceHistorySheet`

**Files:**
- Modify: `frontend/src/components/PriceHistorySheet.tsx`
- Modify: `frontend/src/components/PriceHistorySheet.css`

- [ ] **Step 1: Replace the entire contents of `PriceHistorySheet.tsx`**

  ```tsx
  import { useEffect, useState } from 'react'
  import { getPriceHistory } from '../lib/api'
  import { COMMUNITY_PRICE_TOOLTIP, formatPrice } from '../lib/formatPrice'
  import { normalizeEntries, type ChartEntry } from '../lib/priceNormalization'
  import type { ListItem, PriceHistoryResponse } from '../types'
  import './PriceHistorySheet.css'

  type Scope = 'this_list' | 'my_lists' | 'all'

  interface Props {
    item: ListItem
    listId: string
    getToken: () => Promise<string>
    onLogPrice: () => void
    onClose: () => void
    readOnly?: boolean
  }

  interface StoreGroup {
    store: string | null
    records: ChartEntry[]
  }

  function groupByStore(entries: ChartEntry[]): StoreGroup[] {
    const map = new Map<string, StoreGroup>()
    for (const entry of entries) {
      const key = entry.store ?? '__none__'
      if (!map.has(key)) map.set(key, { store: entry.store, records: [] })
      map.get(key)!.records.push(entry)
    }
    for (const group of map.values()) {
      group.records.sort((a, b) => {
        if (!a.purchased_at && !b.purchased_at) return 0
        if (!a.purchased_at) return 1
        if (!b.purchased_at) return -1
        return b.purchased_at.localeCompare(a.purchased_at)
      })
    }
    return [...map.values()].sort((a, b) => {
      const aDate = a.records[0]?.purchased_at ?? ''
      const bDate = b.records[0]?.purchased_at ?? ''
      return bDate.localeCompare(aDate)
    })
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  }

  function Sparkline({ records }: { records: ChartEntry[] }) {
    const reversed = [...records].reverse()
    const validAmounts = reversed
      .map(r => r.displayAmount)
      .filter((a): a is number => a !== null)

    const w = 60, h = 28, pad = 4
    const getX = (i: number) =>
      reversed.length === 1 ? w / 2 : pad + (i / (reversed.length - 1)) * (w - 2 * pad)

    // Fewer than 2 valid points → dots only (no line to draw)
    if (validAmounts.length < 2) {
      return (
        <svg className="phs__sparkline" viewBox={`0 0 ${w} ${h}`}>
          {reversed.map((r, i) =>
            r.displayAmount !== null ? (
              <circle key={i} cx={getX(i).toFixed(1)} cy={h / 2} r="2" fill="var(--color-primary, #0a84ff)" />
            ) : (
              <circle key={i} cx={getX(i).toFixed(1)} cy={h / 2} r="2" fill="var(--color-primary, #0a84ff)" opacity="0.5" />
            ),
          )}
        </svg>
      )
    }

    const min = Math.min(...validAmounts)
    const max = Math.max(...validAmounts)
    const range = max - min || 1

    const pts = reversed.map((r, i) => {
      const x = getX(i)
      if (r.displayAmount === null) return { x, y: null }
      return { x, y: pad + ((max - r.displayAmount) / range) * (h - 2 * pad) }
    })

    const pathD = pts
      .map((pt, i) => {
        if (pt.y === null) return null
        const prev = i > 0 ? pts[i - 1] : null
        const cmd = prev === null || prev.y === null ? 'M' : 'L'
        return `${cmd}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
      })
      .filter(Boolean)
      .join(' ')

    const hasGaps = pts.some(p => p.y === null)
    const areaD =
      !hasGaps
        ? `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`
        : ''

    return (
      <svg className="phs__sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {areaD && <path d={areaD} fill="var(--color-primary-bg, rgba(10,132,255,0.15))" />}
        {pathD && (
          <path d={pathD} stroke="var(--color-primary, #0a84ff)" strokeWidth="1.5" fill="none" />
        )}
        {pts.map((pt, i) =>
          pt.y === null ? (
            <circle
              key={i}
              cx={pt.x.toFixed(1)}
              cy={h / 2}
              r="2"
              fill="var(--color-primary, #0a84ff)"
              opacity="0.5"
            />
          ) : null,
        )}
      </svg>
    )
  }

  function ExpandedChart({ records }: { records: ChartEntry[] }) {
    const reversed = [...records].reverse()
    const validAmounts = reversed
      .filter(r => r.displayAmount !== null)
      .map(r => r.displayAmount as number)

    const latestValid = records.find(r => r.displayAmount !== null)
    const displayPricePer = latestValid?.displayPricePer ?? null

    const min = validAmounts.length > 0 ? Math.min(...validAmounts) : 0
    const max = validAmounts.length > 0 ? Math.max(...validAmounts) : 0
    const range = max - min || 1
    const w = 200, h = 48, pad = 6

    const pts = reversed.map((r, i) => {
      const x = (pad + (i / (reversed.length - 1)) * (w - 2 * pad)).toFixed(1)
      if (r.displayAmount === null) return { x, y: null }
      return { x, y: (pad + ((max - r.displayAmount) / range) * (h - 2 * pad)).toFixed(1) }
    })

    const pathD = pts
      .map((pt, i) => {
        if (pt.y === null) return null
        const prev = i > 0 ? pts[i - 1] : null
        const cmd = prev === null || prev.y === null ? 'M' : 'L'
        return `${cmd}${pt.x},${pt.y}`
      })
      .filter(Boolean)
      .join(' ')

    const hasGaps = pts.some(p => p.y === null)
    const areaD =
      !hasGaps && validAmounts.length >= 2
        ? `${pathD} L${pts[pts.length - 1].x},${h} L${pts[0].x},${h} Z`
        : ''

    return (
      <div className="phs__expand">
        {validAmounts.length >= 2 && (
          <svg className="phs__expand-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            {areaD && <path d={areaD} fill="var(--color-primary-bg, rgba(10,132,255,0.15))" />}
            {pathD && (
              <path d={pathD} stroke="var(--color-primary, #0a84ff)" strokeWidth="2" fill="none" />
            )}
          </svg>
        )}
        <div className="phs__expand-stats">
          <div className="phs__stat">
            <strong>
              {latestValid ? formatPrice(latestValid.displayAmount!, displayPricePer) : '—'}
            </strong>
            Último
          </div>
          <div className="phs__stat">
            <strong>{validAmounts.length > 0 ? formatPrice(min, displayPricePer) : '—'}</strong>
            Mínimo
          </div>
          <div className="phs__stat">
            <strong>{validAmounts.length > 0 ? formatPrice(max, displayPricePer) : '—'}</strong>
            Máximo
          </div>
        </div>
        <div className="phs__expand-records">
          {records.map((r, i) => (
            <div key={i} className="phs__record-row">
              <span>{r.purchased_at ? formatDate(r.purchased_at) : '—'}</span>
              <span className="phs__record-amount">
                {r.displayAmount !== null
                  ? formatPrice(r.displayAmount, r.displayPricePer)
                  : formatPrice(r.originalAmount, r.originalPricePer as 'KILOGRAM' | null)}
                {r.displayAmount !== null &&
                  r.originalPricePer !== (r.displayPricePer as string | null) && (
                    <span className="phs__record-original">
                      {formatPrice(r.originalAmount, r.originalPricePer as 'KILOGRAM' | null)}
                    </span>
                  )}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  export default function PriceHistorySheet({
    item,
    listId,
    getToken,
    onLogPrice,
    readOnly,
  }: Props) {
    const [scope, setScope] = useState<Scope>('this_list')
    const [history, setHistory] = useState<PriceHistoryResponse | null>(null)
    const [expandedStore, setExpandedStore] = useState<string | null | undefined>(undefined)

    useEffect(() => {
      let cancelled = false
      getPriceHistory(getToken, listId, item.id, scope)
        .then(data => {
          if (!cancelled) setHistory(data)
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }, [scope, getToken, listId, item.id])

    const hasExpanded = expandedStore !== undefined

    function toggleStore(store: string | null) {
      setExpandedStore(prev => (prev === store ? undefined : store))
    }

    const normalized = history ? normalizeEntries(history.entries) : null
    const groups = normalized ? groupByStore(normalized.entries) : null

    return (
      <div className="phs">
        <div className="phs__handle" />
        <div className="phs__title">{item.name}</div>
        <div className="phs__scope">
          {(['this_list', 'my_lists', 'all'] as Scope[]).map(s => (
            <button
              key={s}
              className={`phs__scope-btn${scope === s ? ' phs__scope-btn--active' : ''}`}
              onClick={() => {
                setScope(s)
                setExpandedStore(undefined)
              }}>
              {s === 'this_list' ? 'Esta lista' : s === 'my_lists' ? 'Mis listas' : 'Todos'}
            </button>
          ))}
        </div>

        {normalized?.isNormalized && (
          <div className="phs__normalized-badge">≈ €/kg</div>
        )}

        {history?.community_price != null && (
          <div className="phs__community">
            <span>🌍 Precio estimado</span>
            <span className="phs__community-price">
              ~{formatPrice(history.community_price, history.community_price_per)}
            </span>
            <button
              className="phs__community-info"
              title={COMMUNITY_PRICE_TOOLTIP}
              aria-label="Información sobre el precio de la comunidad">
              ⓘ
            </button>
          </div>
        )}

        <div className="phs__content">
          {groups?.length === 0 && (
            <div className="phs__empty">No hay precios registrados.</div>
          )}
          {groups?.map(group => {
            const isExpanded = expandedStore === group.store
            const isDimmed = hasExpanded && !isExpanded
            const latest = group.records[0]
            const latestValid =
              group.records.find(r => r.displayAmount !== null) ?? latest
            const groupHasGaps = group.records.some(r => r.displayAmount === null)

            return (
              <div
                key={group.store ?? '__none__'}
                className={`phs__store-row${isDimmed ? ' phs__store-row--dimmed' : ''}`}
                onClick={() => toggleStore(group.store)}>
                <div className="phs__store-summary">
                  <div className="phs__store-info">
                    <div className="phs__store-name">
                      {group.store ? `🏪 ${group.store}` : 'Sin tienda'}
                      {groupHasGaps && (
                        <span className="phs__gap-warning" title="Algunos precios no pudieron normalizarse">
                          ⚠️
                        </span>
                      )}
                    </div>
                    <div className="phs__store-meta">
                      {group.records.length}{' '}
                      {group.records.length === 1 ? 'precio' : 'precios'}
                      {latest.purchased_at
                        ? ` · último ${formatDate(latest.purchased_at)}`
                        : ''}
                    </div>
                  </div>
                  <Sparkline records={group.records} />
                  <div className="phs__store-price">
                    {latestValid.displayAmount !== null
                      ? formatPrice(latestValid.displayAmount, latestValid.displayPricePer)
                      : '—'}
                  </div>
                </div>
                {isExpanded && <ExpandedChart records={group.records} />}
              </div>
            )
          })}
        </div>

        {!readOnly && (
          <button className="phs__log-btn" onClick={onLogPrice}>
            {item.price != null ? '✏️ Actualizar precio' : '+ Registrar precio'}
          </button>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Add new CSS rules to `PriceHistorySheet.css`**

  Append to `frontend/src/components/PriceHistorySheet.css`:

  ```css
  .phs__normalized-badge { display: inline-block; font-size: 0.72rem; color: var(--color-muted, #8e8e93); background: var(--color-surface, #1c1c1e); border: 1px solid var(--color-border, #3a3a3c); border-radius: 4px; padding: 2px 6px; margin: 4px 16px 0; align-self: flex-start; }
  .phs__gap-warning { margin-left: 4px; font-size: 0.85em; cursor: default; }
  .phs__record-original { display: block; font-size: 0.72rem; color: var(--color-muted, #8e8e93); font-weight: 400; }
  ```

- [ ] **Step 3: Run the TypeScript compiler to confirm no type errors**

  ```bash
  cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Run the frontend linter**

  ```bash
  cd frontend && npm run lint
  ```

  Expected: no errors.

- [ ] **Step 5: Run the full frontend test suite**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all tests pass. If any existing `PriceHistorySheet` test file exists and imports `PriceEntry` for mock data, update those mock objects to include `quantity: null`.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/components/PriceHistorySheet.tsx frontend/src/components/PriceHistorySheet.css
  git commit -m "feat(frontend): normalize mixed-unit price history to €/kg in chart"
  ```

---

## Final validation

- [ ] **Run the full CI check from the repo root**

  ```bash
  just ci
  ```

  Expected: frontend typecheck, lint, and backend tests all pass.
