# EAN Sigil Feature Design

**Date:** 2026-04-13  
**Status:** Approved

## Overview

Add `|` as a new sigil in the SmartInputBar that lets users input an EAN barcode code directly (by typing or pasting), triggering a product lookup via the existing `GET /barcode/{ean}` backend endpoint. On success, the existing `BarcodeScanSheet` opens pre-filled. The feature integrates cleanly with the existing sigil system and barcode scan flow.

## Decisions

| Question | Decision |
|----------|----------|
| Lookup trigger | Hybrid: auto-detect complete EAN, show "Buscar" CTA in preview — user taps to fire |
| Partial EAN feedback | Nothing — users are expected to paste, not type digit-by-digit |
| EAN not found | Inline error in preview area ("Código no encontrado"); input stays as-is |
| Combined with other sigils | Yes — `\|EAN #brand @store` parses all fields; brand/stores pre-fill the sheet |
| Legend chip | Yes — `\| cod. barras`, taps appends `\|` to input |
| Clear button | Always-visible ✕ in the input row when `value !== ''`; app-wide improvement |
| Architecture | Extend `parseInput` (Approach A) — consistent with existing sigil pattern |

## Data Model

`ParsedInput` gains one new field:

```ts
interface ParsedInput {
  name: string
  quantity: string | null
  brand: string | null
  stores: string[]
  ean: string | null   // 8 or 13 digits extracted after `|`, or null
}
```

## Section 1: `parseInput.ts`

- Any word starting with `|` is treated as an EAN token — stripped from `nameWords`.
- Digits after `|` are extracted. If exactly 8 or 13 digits: `result.ean` is set. Otherwise `ean` remains `null` (partial/invalid — no CTA shown).
- Validation regex mirrors the backend: `^\d{8}$|^\d{13}$`.
- `|` is composable: `|4011200296908 #Danone @Mercadona` yields `{ ean, brand: "Danone", stores: ["Mercadona"], name: "" }`.
- `getActiveSigil()` in `SmartInputBar` does not include `|` — no suggestion dropdown for EAN input.

## Section 2: `SmartInputBar.tsx`

**New props:**
```ts
onEanSearch: (ean: string) => void
eanLoading?: boolean   // true while lookup is in-flight — disables "Buscar" and shows spinner
eanError?: string | null  // error message to show in preview when lookup fails
```

**Changes:**
1. `getActiveSigil` skips `|` (not a suggestion sigil).
2. `LEGEND_CHIPS` gains `{ sigil: '|', label: 'cod. barras' }`. Chip highlights active when `parsed.ean !== null`.
3. Preview area: when `parsed.ean` is non-null, show a barcode icon + EAN digits + "Buscar" button (calls `onEanSearch(parsed.ean)`; disabled + spinner when `eanLoading`). When `eanError` is set, show it in the preview instead of the CTA. Combined sigils (`brand`, `stores`) render as preview tags alongside it. Add button stays disabled in EAN mode.
4. Clear button (✕ in circle) in the input row, visible whenever `value !== ''`. Calls `onChange('')` and refocuses input. No new props required.

## Section 3: `ListScreen.tsx`

New state:
```ts
type EanLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; product: BarcodeRead }
  | { status: 'error'; message: string }

const [eanLookup, setEanLookup] = useState<EanLookupState>({ status: 'idle' })
```

`handleEanSearch(ean: string)`:
1. `setEanLookup({ status: 'loading' })` — passed as `eanLoading={true}` to `SmartInputBar`.
2. Call `GET /barcode/{ean}` (existing `api.ts` function, same auth path as camera scan).
3. **Success** → `setEanLookup({ status: 'found', product })` — renders `BarcodeScanSheet` with `product`, `initialBrand={parsed.brand}`, `initialStores={parsed.stores}`. `parsed` is still valid because `inputValue` stays as-is.
4. **404** → `setEanLookup({ status: 'error', message: 'Código no encontrado' })` — passed as `eanError` to `SmartInputBar`.
5. **Network error** → `setEanLookup({ status: 'error', message: 'Error de conexión' })`.

On sheet close (add / edit / cancel): reset `eanLookup` to `idle` and clear `inputValue`. Mirrors existing camera scan cleanup.

No new API function needed — reuses the existing barcode lookup already used by `BarcodeScanner`.

## Section 4: `BarcodeScanSheet.tsx`

Two new optional props:
```ts
initialBrand?: string | null
initialStores?: string[]
```

- `initialBrand`: used instead of `product.brand` in the displayed tags and `onAdd` payload when provided.
- `initialStores`: seeds `useState<Set<string>>` for `selectedStores` so those stores start pre-selected. User can still deselect/change.
- Camera scan path passes neither prop — behaviour unchanged.

## Section 5: Testing

### `parseInput.test.ts`
- `|4011200296908` → `ean: "4011200296908"`, `name: ""`
- `|123` (partial) → `ean: null`
- `|4011200296908 #Danone @Mercadona` → `{ ean: "4011200296908", brand: "Danone", stores: ["Mercadona"], name: "" }`
- `|` alone → `ean: null`
- `|abcdefghijklm` (non-digits) → `ean: null`

### `SmartInputBar.test.tsx`
- `onEanSearch` called with correct EAN when "Buscar" tapped
- "Buscar" not rendered when `parsed.ean === null`
- Clear button appears when `value !== ''`, calls `onChange('')`
- Clear button absent when `value === ''`
- `| cod. barras` chip appends `|` to input

### `BarcodeScanSheet.test.tsx`
- `initialBrand` overrides `product.brand` in displayed tags and `onAdd` payload
- `initialStores` pre-selects stores in the sheet
- Existing camera scan tests unaffected (no props = existing behaviour)

## Out of Scope

- Auto-lookup on paste (no `onChange` side-effects — user always taps "Buscar")
- Validating EAN check digits (Luhn/GS1) — backend already handles not-found gracefully
- Keyboard shortcut for the `|` sigil chip
