# Own-Brand Store Autofill — Design Spec

**Date:** 2026-04-17  
**Branch:** feat/own-brand-store-autofill

## Overview

When a user types a brand that belongs to a Spanish supermarket chain's own label (e.g. `#Hacendado`), the app automatically infers the chain as a store (e.g. Mercadona) and includes it in the saved item — without modifying the raw input text.

The inferred store surfaces as an opt-out chip in the SmartInputBar suggestions row. The user can dismiss it to exclude the store; if left alone, it is silently merged on submit.

## Data Layer

**File:** `frontend/src/lib/ownBrands.ts`

A static lookup map from brand name (lowercase) to chain display name, covering all major Spanish chains and their own-label brands:

| Chain | Brands covered |
|-------|---------------|
| Mercadona | Hacendado, Bosque Verde, Deliplus, Compy |
| Carrefour | Carrefour, Carrefour Bio, Carrefour Home, Carrefour Soft, Selection, No. 1, Tex |
| Lidl | Milbona, Realvalle, W5, Formil, Cien, Lupilu, Deluxe, Silvercrest |
| Aldi | GutBio, Milsani, Tandil, Mildeen, El Mercado, My Night |
| DIA | DIA, AS, Bonté, Delicious, Mari Marinera, Baby Smile |
| Ahorramas | Alipende, Lanta, Bodyplus, Meque |
| Alcampo | Auchan, Cosmia, Producto Económico, Inextenso |
| Eroski | Eroski, Eroski Natur, Belle, SeleQtia, Sannia |
| El Corte Inglés | El Corte Inglés, Aliada, Hipercor, Special Line |
| Gadis (IFA Group) | IFA Eliges, IFA Sabe, IFA Unnia, Peny, Amigo |
| Consum | Consum, Kyrey, Consum Eco, Consum Kids |

Exported function:
```ts
export function lookupOwnBrandStore(brand: string | null): string | null
```
- Case-insensitive exact match on trimmed input
- Returns `null` for unknown brands
- No fuzzy matching

## Hook

**File:** `frontend/src/hooks/useOwnBrandInference.ts`

```ts
useOwnBrandInference(brand: string | null, explicitStores: string[])
// returns: { visibleChip, storeToAdd, dismiss }
```

**Behaviour:**
- `visibleChip: string | null` — the store name to render as a chip, or `null` if hidden
- `storeToAdd: string | null` — the store to silently merge on submit (same as `visibleChip` when non-null)
- `dismiss()` — called when the user taps the chip; sets `dismissed = true`
- Dismissed state resets via `useEffect` when `brand` changes
- Both `visibleChip` and `storeToAdd` are `null` when:
  - No own-brand match
  - User has dismissed the chip
  - The inferred store is already present in `explicitStores` (case-insensitive)

## SmartInputBar Changes

Two new optional props:
```ts
inferredStoreChip?: string | null
onDismissInferredStore?: () => void
```

The chip renders as the **first item** in the existing suggestions row with a distinct CSS class (`smart-input__suggestion--inferred`). Visual treatment: slightly different background/border to distinguish it from name autocomplete suggestions, plus a visible ✕ icon to communicate its dismissible/opt-out nature. Tapping anywhere on the chip calls `onDismissInferredStore`.

When `inferredStoreChip` is `null`, nothing extra is rendered — no layout shift.

## ListScreen Changes

```ts
const { visibleChip, storeToAdd, dismiss } = useOwnBrandInference(parsed.brand, parsed.stores)
```

`handleSubmit` merges `storeToAdd` before calling `addItem`:
```ts
const stores = storeToAdd
  ? [...new Set([...parsed.stores, storeToAdd])]
  : parsed.stores
void addItem({ ...parsed, stores })
```

`handleClear` remains unchanged — the hook self-resets when brand changes (which clearing triggers).

`SmartInputBar` receives `inferredStoreChip={visibleChip}` and `onDismissInferredStore={dismiss}`.

## Error Handling

No error states. The lookup is a static in-memory map; it either returns a string or `null`. All edge cases (empty brand, unknown brand, already-added store) are handled by returning `null` from the hook, which results in no UI change.

## Testing

**`ownBrands.test.ts`**
- Known brand (various chains) → correct chain name
- Case variations: `HACENDADO`, `Hacendado`, `hacendado` → `Mercadona`
- Unknown brand → `null`
- `null` input → `null`
- All chains have at least one brand that resolves correctly

**`useOwnBrandInference.test.ts`**
- Unknown brand → `{ visibleChip: null, storeToAdd: null }`
- Known brand not in explicitStores → chip and storeToAdd are set
- Known brand already in explicitStores (case-insensitive) → both null
- After dismiss → both null
- Brand changes → dismissed state resets (chip re-appears for new brand)

**`SmartInputBar.test.tsx`** (additions)
- `inferredStoreChip="Mercadona"` → chip renders first with `--inferred` class
- Tapping chip calls `onDismissInferredStore`
- No `inferredStoreChip` prop → no extra chip rendered
