# Receipt Scanning — Design Spec

**Date:** 2026-05-26
**Status:** Draft

---

## Goal

After completing a shopping trip, the user scans or uploads a receipt to bulk-log prices for the items they just purchased — instead of opening `LogPriceSheet` one item at a time.

---

## Scope

**In scope (this iteration):**
- Post-purchase price logging via receipt scan
- Camera capture and image file upload (JPEG, PNG, HEIC)
- All stores supported via a generic fallback parser; Mercadona and Ahorramas get store-specific rules for higher initial match quality
- Learned name mappings to improve match quality over time
- Storage of receipt image, raw OCR output, and match result for future debugging

**Out of scope (added to TODO):**
- List seeding from a past receipt (pre-purchase import)
- PDF receipt support (Mercadona email tickets)
- Submitting matched prices back to a community price index

---

## User Flow

1. User finishes shopping; all items are checked off the list
2. User taps **"Escanear ticket"** — from the empty-state card or the list action menu
3. A small sheet opens with two options: **Cámara** / **Subir imagen**
4. Image is captured or picked from the file picker
5. Image is uploaded to `POST /lists/{id}/receipt`; a loading state is shown
6. On success, `ReceiptScanSheet` opens with match proposals
7. User reviews: confirms auto-matched items, links or skips unmatched lines
8. User taps **"Guardar precios"** → `POST /lists/{id}/receipt-prices`
9. Toast confirms: *"X precios actualizados"*

---

## Entry Points

| Location | Condition | Treatment |
|---|---|---|
| Empty unpurchased state (`ListScreen`) | All items purchased | Card below the mascot: *"Escanear ticket para registrar precios"* |
| List action menu (`ListActionSheet`) | Always visible | New option *"Escanear ticket"*, above destructive actions |

Both entry points open the same camera/upload choice sheet.

---

## Architecture

### New backend modules

| Module | Responsibility |
|---|---|
| `routers/receipt.py` | Two new endpoints; auth + membership via existing deps |
| `services/receipt_ocr.py` | Thin interface: `extract_text(image_bytes) → str`; provider implementation is an internal detail |
| `services/receipt_parser.py` | Raw OCR text → structured line items; generic fallback parser works for any store; Mercadona and Ahorramas get tuned rules for higher initial accuracy |
| `services/receipt_matcher.py` | Fuzzy-match parsed lines against purchased list items; consults learned mappings first |
| `schemas/receipt.py` | Request/response Pydantic models |

### New frontend components

| Component | Responsibility |
|---|---|
| `ReceiptScanSheet.tsx` | Review/confirmation bottom sheet |
| Entry in `ListScreen.tsx` | Empty-state CTA |
| Entry in `ListActionSheet.tsx` | Action menu option |

The camera capture reuses the existing `BarcodeScanner` infrastructure. File upload uses `<input type="file" accept="image/*">` without `capture`, which gives the native file picker (gallery, Files, screenshots).

---

## API Endpoints

### `POST /lists/{list_id}/receipt`

Accepts a multipart form upload (`image` field). Requires list membership.

**Processing steps:**
1. Save image to object storage; record path in `receipt_scans.image_path`
2. Call OCR service → raw text; store in `receipt_scans.ocr_raw`
3. Parse raw text into line items; store in `receipt_scans.parsed_lines`
4. Fuzzy-match line items against the list's purchased items; store in `receipt_scans.match_result`
5. Return `ReceiptScanResult`

**Response: `ReceiptScanResult`**
```json
{
  "scan_id": "uuid",
  "store": "Mercadona",
  "receipt_date": "2026-04-11",
  "receipt_total": 27.10,
  "matched": [
    {
      "receipt_name": "BEBIDA ALMENDRAS 0%",
      "item_id": "uuid",
      "item_name": "Bebida de almendra 0% azúcares",
      "price": 1.15,
      "price_per": null
    }
  ],
  "unmatched": [
    {
      "receipt_name": "MANI DULCE",
      "price": 3.15,
      "price_per": null
    }
  ]
}
```

### `POST /lists/{list_id}/receipt-prices`

Batch price write. Accepts a list of confirmed matches from the frontend after user review. Requires list membership.

**Request: `ReceiptPriceBatch`**
```json
{
  "scan_id": "uuid",
  "patches": [
    { "item_id": "uuid", "price": 1.15, "price_per": null },
    { "item_id": "uuid", "price": 2.30, "price_per": "KILOGRAM" }
  ],
  "mappings": [
    { "store": "Mercadona", "receipt_name": "mani dulce", "item_name": "Maní dulce", "item_brand": null }
  ]
}
```

Each patch calls the same logic as the existing `_write_price` helper in `routers/prices.py`. The `mappings` array upserts learned name mappings for all confirmed matches (auto and manual).

Updates `receipt_scans.items_updated` with the final count.

---

## Data Model

### `receipt_scans`

```
id              UUID PK
list_id         UUID FK → lists
scanned_by      UUID FK → users
store           TEXT          — detected store name, e.g. "Mercadona"
receipt_date    DATE          — detected from OCR header
receipt_total   NUMERIC       — detected from OCR footer
image_path      TEXT          — storage key (nullable until upload confirms)
ocr_raw         JSONB         — full OCR provider response
parsed_lines    JSONB         — [{name, price, price_per, quantity}]
match_result    JSONB         — [{receipt_name, matched_item_id, confidence}]
items_updated   INT DEFAULT 0
created_at      TIMESTAMP
```

### `receipt_name_mappings`

Learned mappings between OCR abbreviations and canonical item names. Shared across users; keyed by `(store, receipt_name)`.

```
id              UUID PK
store           TEXT     — store name, e.g. "Mercadona"
receipt_name    TEXT     — normalised OCR name, e.g. "mani dulce"
item_name       TEXT     — canonical item name, e.g. "Maní dulce"
item_brand      TEXT     — nullable
confirmed_by    UUID FK → users  — last user to confirm this mapping
use_count       INT DEFAULT 1
created_at      TIMESTAMP
updated_at      TIMESTAMP
UNIQUE (store, receipt_name)
```

---

## Matching Algorithm

**`receipt_matcher.py` flow for each parsed line:**

1. Normalise the OCR name: lowercase, strip accents, strip leading quantities (`2 BOLSA` → `BOLSA`)
2. Look up `(store, normalised_name)` in `receipt_name_mappings` → instant match if found
3. If not found: run `rapidfuzz.token_sort_ratio` against the names of purchased items in this list session
4. Score ≥ 70 → auto-matched (returned in `matched[]`)
5. Score < 70 → unmatched (returned in `unmatched[]`)

**Weight-based items:** When the OCR line contains a `kg ×` pattern, extract the unit price (€/kg) and set `price_per = "KILOGRAM"`. This aligns with the existing DB convention where `price` stores the per-unit or per-kg rate, not the total paid.

**On user confirmation** (both auto-matched and manually linked):
- The frontend includes confirmed pairs in the top-level `mappings[]` array of `ReceiptPriceBatch`
- Only user-confirmed (checked) items produce mapping entries — unchecked auto-matches are not persisted
- The backend upserts into `receipt_name_mappings`; existing rows increment `use_count`

---

## `ReceiptScanSheet` UI

The sheet is a standard bottom sheet matching the app's existing sheet pattern.

**Header:** Detected store name (store badge) + receipt date + total amount

**"Encontrados" section:** Auto-matched items, pre-checked. Each row shows the raw OCR name (small, grey) above the resolved item name, with extracted price at right. Weight items show `/kg` suffix. If the item already has a stored price, the current price is shown struck-through next to the new one so the user can see what will change. User can uncheck to exclude.

**"Sin vincular" section:** Unmatched lines with a dropdown (`Vincular a elemento…`) listing all purchased items not yet matched, plus an `Omitir` button. Linking a line adds it to the confirmed set and saves the mapping.

**Filtered lines note:** A single grey line at the bottom counts how many non-item lines were discarded (IVA breakdown, total, card info, store header).

**Footer:** `Guardar precios` button with a badge showing the count of items that will be written. Disabled if count is 0.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Image > 10 MB | Frontend blocks upload; toast: *"La imagen es demasiado grande (máx. 10 MB)"* |
| OCR returns no text | Backend returns 422; frontend toast: *"No se pudo leer el ticket"* |
| Zero items matched | Sheet opens with all lines in "Sin vincular"; user can link manually or cancel |
| Network error uploading | Standard error toast; no `receipt_scans` row written |
| Item already has a price | `_write_price` uses `PATCH` logic; existing price is overwritten |

---

## Testing

**Backend:**
- `receipt_parser.py`: unit tests for Mercadona and Ahorramas using fixture OCR strings derived from real receipts; smoke test for the generic fallback path
- `receipt_matcher.py`: unit tests for normalisation, threshold behaviour, and mapping lookup
- `routers/receipt.py`: integration tests using SQLite in-memory (mock the OCR service and storage)

**Frontend:**
- `ReceiptScanSheet`: unit tests for matched/unmatched rendering, link-to-item interaction, confirm button count
- Entry point rendering in `ListScreen` (empty state) and `ListActionSheet`

---

## Storage

Receipt images are stored in object storage under a path that includes the user ID and a timestamp to avoid collisions. No provider-specific path format is enforced in the schema or service interface — `image_path` is an opaque string to the rest of the system.

A retention policy (suggested: 90 days) should be configured at the storage bucket level. This is out of scope for the initial implementation but should be set up before production rollout.
