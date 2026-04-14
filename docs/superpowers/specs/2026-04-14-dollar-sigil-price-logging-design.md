# Design: `$` Sigil for Inline Price Logging

**Date:** 2026-04-14
**Status:** Approved

---

## Overview

Add a `$` sigil to the SmartInputBar so users can log an item's price inline at add time without opening the price sheet. For example:

```
leche $1,50 @Mercadona
arroz $3,20/kg @Mercadona @Lidl
```

`€` is accepted as a silent alias for `$` (undocumented).

As part of this work, all existing price display throughout the app is updated to use `Intl`-based locale formatting so that future locale additions require no code changes.

---

## Section 1 — Parsing Layer

### Changes to `types.ts`

Two new optional fields on `ParsedInput`:

```ts
price?: number | null       // parsed numeric amount
pricePer?: 'KILOGRAM' | null  // null = per unit
```

### Changes to `parseInput.ts`

`$` and `€` are handled with a dedicated `else if` branch in the parse loop — the same pattern used by `|` (EAN) — rather than via `SINGLE_SIGIL_MAP`, because they require numeric parsing and `/kg` detection beyond what the string-collecting map supports. Only the **first** price token is stored; subsequent `$`/`€` tokens are silently ignored (same guard as existing sigils).

**Token format:** after stripping the sigil (`$` or `€`), the remainder must match:

```
^(\d+([,.]\d{1,2})?|[,.]\d{1,2})(/kg)?$   (case-insensitive)
```

- Integer part is optional when a decimal part is present (`$,50` → `0.50`)
- At most **two decimal digits** after the separator — resolves `$1,500` / `$1.500` ambiguity
- Both `,` and `.` are always accepted as decimal separators regardless of locale; whichever matches is replaced with `.` before `parseFloat`
- Trailing `/kg` sets `pricePer: 'KILOGRAM'`; absent means `pricePer: null`
- Tokens that do not match are silently dropped (no price set), consistent with how invalid `|` EANs are handled

No locale detection is needed in the parser. Display-side `Intl.NumberFormat(undefined)` handles locale automatically. Adding a new locale requires no changes to parsing logic.

`hasSigil` in `SmartInputBar` is extended to return `true` when `parsed.price != null`.

---

## Section 2 — Backend

### `schemas/items.py` — `ItemCreate`

Three new optional fields:

```python
price: float | None = None
price_per: Literal['KILOGRAM'] | None = None
price_store: str | None = None
```

No migration required — these columns already exist on `list_items`.

### `routers/items.py` — `create_item`

The create endpoint writes `price`, `price_per`, and `price_store` directly onto the new `ListItem` before `session.commit()` when present. Price is stored atomically with the item in a single request.

The existing `POST /lists/{id}/items/{item_id}/prices` endpoint is untouched — it remains the path for logging price after item creation.

---

## Section 3 — Frontend Wiring

### `api.ts`

`createItem` payload gains three optional fields:

```ts
price?: number | null
price_per?: 'KILOGRAM' | null
price_store?: string | null
```

### `useListItems.ts` — `addItem`

Reads `parsed.price`, `parsed.pricePer`, and derives `price_store` from `parsed.stores[0] ?? null`. Passes all three to `createItem`. The optimistic temp item also sets these fields so the UI reflects the price before the server responds.

### `SmartInputBar.tsx`

- `ALL_SIGILS` and `LEGEND_CHIPS` gain a `$` entry labelled `precio`
- `hasSigil` returns `true` when `parsed.price != null`
- The parse preview strip shows a price pill using `formatPrice` (e.g. `💶 1,50 €` or `💶 3,20 €/kg`)
- `sigilChipAction` handles `$` like other single-value sigils (replace if already present, append otherwise)

---

## Section 4 — Locale Utility & Price Display

### New file: `frontend/src/lib/formatPrice.ts`

```ts
export function formatPrice(amount: number, pricePer?: string | null): string {
  const formatted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
  return pricePer === 'KILOGRAM' ? `${formatted}/kg` : formatted
}
```

`undefined` locale means "use the runtime locale" — no locale string is hardcoded anywhere. Adding a new locale requires no changes here or in the parser.

### Callsites updated

Replace raw number rendering with `formatPrice`:

- `SmartInputBar` — price preview pill
- `ItemCard` — current item price display
- `PriceHistorySheet` — entry amounts, last/min/max stats

`LogPriceSheet` is an input form — not applicable.

---

## Section 5 — Testing

### `parseInput.test.ts` — new cases

| Input | Expected |
|---|---|
| `leche $1,50` | `{ price: 1.5, pricePer: null }` |
| `arroz €3,20/kg` | `{ price: 3.2, pricePer: 'KILOGRAM' }` |
| `leche $1.50` | `{ price: 1.5, pricePer: null }` (dot also accepted) |
| `leche $,50` | `{ price: 0.5, pricePer: null }` |
| `leche $.50` | `{ price: 0.5, pricePer: null }` |
| `leche $1,5` | `{ price: 1.5, pricePer: null }` |
| `leche $1500` | `{ price: 1500, pricePer: null }` |
| `leche $1,50 $2,00` | `{ price: 1.5 }` (first wins) |
| `leche $` | `{ price: null }` (no number — ignored) |
| `leche $abc` | `{ price: null }` (non-numeric — ignored) |
| `leche $1,500` | `{ price: null }` (3 decimal digits — ambiguous, ignored) |
| `leche $1.500` | `{ price: null }` (3 decimal digits — ambiguous, ignored) |
| `leche $1,50,30` | `{ price: null }` (two commas — ignored) |
| `leche $1.50.30` | `{ price: null }` (two dots — ignored) |
| `leche $1,50.30` | `{ price: null }` (mixed separators — ignored) |
| `leche $1,` | `{ price: null }` (trailing separator — ignored) |
| `leche $-1` | `{ price: null }` (negative — ignored) |
| `leche $0` | `{ price: 0, pricePer: null }` (zero is valid) |
| `leche $/kg` | `{ price: null }` (no number — ignored) |

### `SmartInputBar.test.tsx`

- `$` chip renders in legend
- Price preview pill appears when `parsed.price` is set
- Price pill shows `/kg` suffix when `pricePer === 'KILOGRAM'`

### Backend — `tests/routers/test_items.py`

One new test: `POST /lists/{id}/items` with `price: 1.5`, `price_per: null`, `price_store: "Mercadona"` returns an item with those fields populated.

---

## Out of Scope

- Submitting prices to Open Prices API (requires proof image)
- Editing price inline via the sigil (use the price sheet for corrections)
- i18n beyond locale-aware formatting (app remains single-locale for now)
