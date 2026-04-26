# Price History Mixed Unit Normalization — Design Spec

**Date:** 2026-04-26  
**Status:** Approved

---

## Problem

`PriceHistorySheet` charts raw `PriceEntry.amount` values with no unit awareness. An item that alternates between per-unit and per-kg logging produces a misleading chart: a 500 g pack logged as `€0.60` one week and `€1.20/kg` the next week shows two disconnected data points with a large apparent jump, when the economic value is identical.

The issue affects any weight-based item that can be bought either pre-packaged (total price logged) or by weight (shelf price in €/kg logged). The chart and stats must normalize to a common basis to be meaningful.

---

## Scope

### In scope
- Weight-based normalization: convert mixed per-unit / per-kg entries to a common €/kg basis for charting and stats
- Per-entry normalization using each entry's own `quantity` (not the current item's quantity)
- Graceful fallback (disconnected dots) for entries that cannot be normalized
- Visual badge when normalization is applied
- Backend: expose `quantity` on `PriceEntry` (already available on `ListItem`, no migration required)

### Out of scope (follow-up)
- **Count-based normalization** (e.g. a 6-pack of toilet rolls at €3.50 vs a 4-pack at €2.40 → €/roll): requires a new `pack_size` field on `ListItem`, UI changes in `LogPriceSheet`/`ItemCard`, and a `price_per='UNIT'` concept. Discrete items where all entries are `price_per=null` are left as-is.
- **Varying pack size with all-per-unit entries**: e.g. yogurt sometimes bought in a 125 g pot and sometimes a 250 g pot, always logged per-pack. The normalization trigger (see below) won't fire unless at least one entry has a parseable SI quantity or is explicitly €/kg. This is acceptable for v1.

---

## Architecture

### Backend change — `PriceEntry` schema

Add `quantity: str | None` to the `PriceEntry` response schema in `backend/app/schemas/prices.py`. Populate it from `i.quantity` in the `get_price_history` projection in `backend/app/routers/prices.py`. No Alembic migration required — `list_items.quantity` already exists.

Each `PriceEntry` now carries the quantity that was on the item at purchase time (since history entries are individual `ListItem` rows, not a separate history table).

```python
class PriceEntry(BaseModel):
    amount: float
    price_per: str | None
    store: str | None
    purchased_at: str | None = None
    quantity: str | None = None  # new
```

### Frontend type

Add `quantity: string | null` to the `PriceEntry` interface in `frontend/src/types.ts`.

---

## Normalization logic — `frontend/src/lib/priceNormalization.ts`

New pure module, no side effects, easily unit-tested.

### Trigger (global, not per store group)

Scan **all** entries for the item across all store groups. Enter normalization mode if **any** entry either:
- has `price_per === 'KILOGRAM'`, or
- has a parseable SI quantity (units: `g kg ml cl dl l`)

If neither condition matches, the item is treated as discrete/per-unit: normalization mode is off and all entries pass through unchanged.

Rationale: if one store always logs €/kg and another always logs €/pack (with a known weight), both store sparklines should be on the same scale — enabling direct comparison.

### Per-entry conversion

For each entry in normalization mode:

```ts
const kgFactor = parseKgFactor(entry.quantity)
// extracts numeric value × UNIT_TO_KG[unit], or null if unparseable

let displayAmount: number | null
if (entry.price_per === 'KILOGRAM') {
  displayAmount = entry.amount              // already €/kg
} else if (kgFactor !== null) {
  displayAmount = entry.amount / kgFactor   // e.g. €0.60 / 0.5 kg = €1.20/kg
} else {
  displayAmount = null                      // can't normalize → disconnected dot
}
```

`parseKgFactor` imports `UNIT_TO_KG` from `itemCost.ts` (no duplication). It returns `value_in_kg` as a float, or `null`.

### Return type

```ts
interface ChartEntry {
  displayAmount: number | null    // null = render as isolated dot
  displayPricePer: 'KILOGRAM' | null
  store: string | null
  purchased_at: string | null
  originalAmount: number          // preserve for per-record row display
  originalPricePer: string | null
}

interface NormalizationResult {
  entries: ChartEntry[]
  isNormalized: boolean   // true when any per-unit → €/kg conversion occurred
  hasGaps: boolean        // true when any entry has displayAmount === null
}

function normalizeEntries(entries: PriceEntry[]): NormalizationResult
```

The function takes all entries (across all stores) and returns one flat `ChartEntry[]` in the same order. Callers partition by store for rendering.

---

## PriceHistorySheet changes

### Normalization call

Called once after history loads, before `groupByStore`:

```ts
const normalized = history ? normalizeEntries(history.entries) : null
const groups = normalized ? groupByStore(normalized.entries) : null
```

`groupByStore` is updated to accept `ChartEntry[]`.

### Chart components

`Sparkline` and `ExpandedChart` switch from `records: PriceEntry[]` to `records: ChartEntry[]`.

**Line path:** include only entries where `displayAmount !== null`. Entries with `displayAmount === null` are rendered as isolated dots (same style as the single-point fallback already in `Sparkline`).

**Stats (Último / Mínimo / Máximo):** computed from `displayAmount` values (excluding nulls). "Último" uses the most recent entry with a non-null `displayAmount`.

**Per-record rows (`ExpandedChart`):** Show `displayAmount` formatted with `displayPricePer`. Show `originalAmount` formatted with `originalPricePer` as a secondary label (smaller, muted) so users can see what they actually paid.

### Badges

- **`isNormalized = true`:** Render a small pill `≈ €/kg` between the scope buttons and the community price row. Color: `var(--color-text-secondary)`.
- **`hasGaps = true`:** Render a `⚠️` icon next to the store name for each store group that contains at least one `displayAmount === null` entry.

---

## Edge cases

| Scenario | Behaviour |
|---|---|
| All entries `price_per='KILOGRAM'` | No trigger, passthrough unchanged |
| All entries `price_per=null`, no SI quantity | No trigger, passthrough unchanged |
| All entries `price_per=null`, all have SI quantities | Trigger fires (SI quantity), normalize all to €/kg, `isNormalized=true` |
| Mixed `price_per`, item has valid SI quantity | Normalize all entries, disconnected dots for any entry missing SI quantity |
| Mixed `price_per`, entry `quantity=null` or non-SI | That entry gets `displayAmount=null` → isolated dot |
| Quantity field changed between purchases | Each entry uses its own `quantity` snapshot; historical accuracy is correct |
| Discrete item (toilet rolls, yogurts) — all per-unit | No trigger, shown per-pack; count-based normalization is v2 |

---

## Testing

New test file: `frontend/src/lib/priceNormalization.test.ts`

Key cases to cover:
- All per-kg: no normalization, passthrough
- All per-unit, no SI quantity: no normalization, passthrough  
- All per-unit, all SI quantities: normalizes to €/kg without an explicit €/kg entry
- Mixed per-unit + per-kg, entry with SI quantity: correct conversion
- Mixed per-unit + per-kg, entry with `quantity=null`: yields `displayAmount=null` for that entry
- `isNormalized` and `hasGaps` flags set correctly

Backend tests: add a test in `tests/test_prices.py` verifying `quantity` is present in the `GET /prices` response.

---

## Known limitations

- **Quantity changed after purchase**: each price history entry is an independent `ListItem` row, so `PriceEntry.quantity` reflects the quantity on that specific row. If a user edits the `quantity` field on a purchased item after purchase, that entry's normalization factor will change. In practice this is rare and acceptable for v1.
- **Count-based items**: packs with varying unit counts (6-pack vs 4-pack) are not normalized. Tracked in TODO as a follow-up requiring a `pack_size` field.
