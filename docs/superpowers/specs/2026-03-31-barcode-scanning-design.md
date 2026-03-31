# Barcode Scanning — Design Spec

**Date:** 2026-03-31

## Goal

Let users scan a product barcode to pre-fill the SmartInputBar or add an item directly, without typing. Product data is looked up via the backend, which caches results from Open Food Facts to avoid redundant external calls.

## In Scope

- Scan button inline in the SmartInputBar input row
- Camera overlay using `@undecaf/barcode-detector-polyfill`
- Backend `GET /barcode/{ean}` endpoint: validates EAN, checks cache, calls OFF on miss
- `barcode_cache` table with Alembic migration
- Confirmation sheet: product name + tags + edit button + Cancel / Add
- Edit flow: pre-fills SmartInputBar from confirmation sheet
- Not-found / error flow: toast + focus input bar

## Out of Scope

- Bulk scanning (multiple items per camera session)
- Manual EAN entry
- Contributing product data back to Open Food Facts

---

## Architecture

### Lookup flow

1. User taps scan icon → camera overlay opens
2. `BarcodeDetector` (native or polyfill) detects a barcode → EAN extracted
3. `GET /barcode/{ean}` called on the backend
4. **Cache hit** → return `{name, brand, stores}` immediately
5. **Cache miss** → backend calls Open Food Facts, caches result, returns data
6. **OFF not found (404)** → backend returns 404 → frontend: toast + focus input
7. **OFF unreachable / rate-limited** → backend returns 503 → frontend: toast + focus input

All OFF calls happen server-side. No product data is ever supplied by the client.

---

## Backend

### New table: `barcode_cache`

```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
ean         TEXT UNIQUE NOT NULL  -- validated: exactly 8 or 13 decimal digits
name        TEXT NOT NULL
brand       TEXT                  -- nullable
stores      TEXT                  -- nullable, comma-separated e.g. "Mercadona,Alcampo"
created_at  TIMESTAMP NOT NULL DEFAULT now()
```

Cache entries are **immutable once written** (`INSERT ... ON CONFLICT DO NOTHING`). If OFF data improves over time for a given EAN, the cached entry is not updated — this is an acceptable trade-off for simplicity.

### New file: `backend/app/routers/barcode.py`

**`GET /barcode/{ean}`** — auth required

1. Validate `ean`: must match `^\d{8}$|^\d{13}$`. Return 422 if invalid.
2. Query `barcode_cache` for the EAN. Return cached `BarcodeRead` if found.
3. Call `https://es.openfoodfacts.org/api/v3/product/{ean}.json`
4. If `status != 1` or product missing → return 404
5. If request fails / timeout → return 503
6. Extract fields (see mapping below), insert into `barcode_cache` with `ON CONFLICT DO NOTHING`
7. Return `BarcodeRead`

### OFF field mapping

| Cache field | OFF source |
|-------------|-----------|
| `name` | `product_name_es` → `product_name` → `generic_name_es` → `generic_name` (first non-empty) |
| `brand` | `brands.split(",")[0].strip()` — first brand only; `None` if absent |
| `stores` | `stores` field raw string; `None` if absent or empty |

### New schema: `backend/app/schemas/barcode.py`

```python
class BarcodeRead(BaseModel):
    name: str
    brand: str | None
    stores: list[str]  # split from comma-separated string; [] if None
```

`stores` is parsed on read: `stores_str.split(",") if stores_str else []`. The raw comma-separated string is stored in the DB; the list is constructed at response time.

### Alembic migration

New revision: `add_barcode_cache_table`

### Modified files

- `backend/app/main.py` — register `barcode` router
- `backend/app/routers/barcode.py` — new file

---

## Frontend

### New library

```
@undecaf/barcode-detector-polyfill
```

Implements the standard `BarcodeDetector` API. Uses native browser support where available (Chrome, Edge, Android WebView), ZXing-based polyfill elsewhere (iOS Safari, Firefox). Only EAN-8 and EAN-13 formats are requested.

### SmartInputBar changes

- Add a scan icon button between the text input and the `+` button
- Accepts a new `onScanRequest: () => void` prop
- Button is hidden when the input already has content (avoids accidental taps mid-entry)

### New components

**`BarcodeScanner.tsx`** — camera overlay
- Full-screen overlay with a close button
- Initialises `BarcodeDetector` with `{ formats: ['ean_8', 'ean_13'] }`
- On detection: stops scanning, calls `GET /barcode/{ean}`, emits result upward
- On not found / error: emits `onNotFound`
- On close: emits `onClose`

**`BarcodeScanSheet.tsx`** — confirmation sheet
- Appears after a successful lookup
- Layout:
  - "Producto encontrado" header
  - Product name + tall edit button (stretches to match name + tags height)
  - Brand tag (if present)
  - Store chips (if `stores` is non-empty) — shown as suggestions, not pre-filled
  - Cancel button + "Añadir a la lista" button
- **Edit button**: dismisses sheet, pre-fills SmartInputBar with `"<name> #<brand> @<store>"` (store omitted if empty, brand omitted if absent)
- **Añadir**: calls `addItem` directly with `{ name, brand, store: null }` (user has not selected a store)

### New API function: `frontend/src/lib/api.ts`

```ts
export async function getBarcode(
  getToken: () => Promise<string>,
  ean: string,
): Promise<BarcodeRead>
// GET /barcode/{ean} — throws ApiError on 404 / 503
```

### New type: `frontend/src/types.ts`

```ts
export interface BarcodeRead {
  name: string
  brand: string | null
  stores: string[]
}
```

### ListScreen changes

- Manages `scannerOpen: boolean` state
- On `onScanRequest` from SmartInputBar → open `BarcodeScanner`
- On `BarcodeScanner.onResult(product)` → close scanner, open `BarcodeScanSheet`
- On `BarcodeScanner.onNotFound` → close scanner, show toast, focus input
- On `BarcodeScanSheet.onEdit(prefill)` → close sheet, set input value, focus input
- On `BarcodeScanSheet.onAdd(parsed)` → close sheet, call `addItem`

### Modified files

| File | Change |
|------|--------|
| `frontend/src/components/SmartInputBar.tsx` | Add scan button + `onScanRequest` prop |
| `frontend/src/components/SmartInputBar.css` | Style scan button |
| `frontend/src/components/ListScreen.tsx` | Scanner/sheet state management |
| `frontend/src/lib/api.ts` | Add `getBarcode` |
| `frontend/src/types.ts` | Add `BarcodeRead` |

### New files

| File | Purpose |
|------|---------|
| `frontend/src/components/BarcodeScanner.tsx` | Camera overlay |
| `frontend/src/components/BarcodeScanner.css` | Overlay styles |
| `frontend/src/components/BarcodeScanSheet.tsx` | Confirmation sheet |
| `frontend/src/components/BarcodeScanSheet.css` | Sheet styles |
| `frontend/src/components/BarcodeScanner.test.tsx` | Scanner unit tests |
| `frontend/src/components/BarcodeScanSheet.test.tsx` | Sheet unit tests |

---

## Error handling

| Scenario | Backend response | Frontend behaviour |
|----------|-----------------|-------------------|
| Invalid EAN format | 422 | — (never reached; `BarcodeDetector` only emits valid EANs) |
| Product not in OFF | 404 | Toast "Producto no encontrado" + focus input |
| OFF unreachable | 503 | Toast "No se pudo conectar" + focus input |
| Camera permission denied | — | `BarcodeScanner` shows inline error, no toast |
| `BarcodeDetector` unsupported | — | Polyfill handles this; no special case needed |

---

## Testing

### `BarcodeScanSheet.test.tsx`

- Renders product name and brand tag
- Renders store chips when stores are present
- Does not render store chips when stores is empty
- Edit button pre-fills input with correct sigil string
- Add button calls `onAdd` with correct parsed item
- Cancel button calls `onClose`

### `BarcodeScanner.test.tsx`

- Calls `onNotFound` when API returns 404
- Calls `onNotFound` when API returns 503
- Calls `onResult` with product data on success

### `backend/tests/test_barcode.py`

- Returns 422 for invalid EAN (letters, wrong length)
- Returns cached result on second request (no OFF call)
- Returns 404 when OFF returns `status != 1`
- Returns 503 when OFF is unreachable
- Correctly maps `product_name_es` → `name`
- Falls back to `product_name` when `product_name_es` absent
- `stores` is `[]` in response when OFF field is absent
- `stores` is correctly split from comma-separated string
