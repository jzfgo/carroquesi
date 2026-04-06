# Price Tracking — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

## Summary

Integrate the Open Prices API (Open Food Facts ecosystem) into CarroQueSí to display community grocery prices and let users record the prices they pay. Prices are private to CarroQueSí — no submission to Open Prices (the API requires a proof image and OSM location, which is too complex for this context).

---

## Data Model

### `list_items` — new column

| Column | Type | Notes |
|---|---|---|
| `ean` | `Optional[str]` | Barcode scanned when item was created. Null for typed items. |

### `price_cache` — new table

Caches community prices fetched from Open Prices, keyed by EAN. TTL: 7 days.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `ean` | str UNIQUE | Product barcode |
| `amount` | float | Median of recent community prices in € |
| `fetched_at` | datetime | Used to determine cache staleness |

### `price_records` — new table

User-contributed prices. One row per purchase logged.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `list_item_id` | FK → list_items | Which item was purchased |
| `ean` | `Optional[str]` | Denormalized from `list_items.ean` at log time. Enables cross-list queries without joins. |
| `amount` | float | Price paid in € |
| `store` | `Optional[str]` | Store where purchased |
| `user_id` | FK → users | Who recorded the price |
| `recorded_at` | datetime | When the price was logged |

---

## Backend

### Extended barcode response

`GET /barcode/{ean}` response gains a `community_price: float | null` field. On a cache hit in `price_cache` (within 7 days), return the cached value. On miss, fetch from `GET https://prices.openfoodfacts.org/api/v1/prices?product_code={ean}`, compute the median of returned prices, and store in `price_cache`. If Open Prices is unreachable or returns no results, return `null` — never block the barcode lookup.

### Prices router — `backend/app/routers/prices.py`

**`GET /lists/{list_id}/items/{item_id}/prices?scope=this_list|my_lists|all`**

Returns price records for the item, filtered by scope:

| Scope | Filter logic |
|---|---|
| `this_list` | `price_records` where `list_item_id` belongs to this list |
| `my_lists` | Records by current user matched by EAN (all their lists); falls back to `list_item_id` if no EAN |
| `all` | All records for this EAN across all users; falls back to `my_lists` if no EAN |

Response includes records grouped by store, sorted by `recorded_at` desc within each group.

**`POST /lists/{list_id}/items/{item_id}/prices`**

Body: `{ amount: float, store: string | null }`

Requires list membership. Creates a `price_records` row. Denormalizes `ean` from the item at write time.

### New environment variable

None required — Open Prices is read-only and unauthenticated for price lookups.

---

## Frontend

### `BarcodeRead` type

Add `community_price: number | null`.

### `BarcodeScanSheet`

When `community_price` is present, show: *"~€X.XX según la comunidad ⓘ"*  
Tooltip on `ⓘ`: *"Precio medio aportado por la comunidad de Open Prices. Puede no reflejar precios en tiendas españolas."*

### `ItemCard`

New tag in the tags row:
- If a price has been recorded: `💶 €X.XX` — tapping opens `PriceHistorySheet`
- If no price yet: `+ 💶` CTA tag (same style as `+ 🏷️`, `+ 🏪`) — tapping opens `PriceHistorySheet`

### `PriceHistorySheet` (new component)

Bottom sheet. Structure:

1. **Scope segmented control** — `Esta lista / Mis listas / Todos`
2. **Community price banner** (EAN items only) — `🌍 Comunidad ~€X.XX ⓘ`  
   Tooltip: same text as BarcodeScanSheet
3. **Store summary rows** — one row per store with:
   - Store name, purchase count, last purchase date
   - Latest price (green)
   - Area sparkline (blue fill, color encodes trend)
   - Tapping a row **expands inline**: mini area chart with last/min/max stats; other rows dim. Tap again or tap another row to collapse.
4. **`+ Registrar precio` button** at the bottom — opens `LogPriceSheet`

### `LogPriceSheet` (new component)

Bottom sheet for logging a price. Triggered from:
- `PriceHistorySheet` → `+ Registrar precio`
- Purchase toast → `Añadir precio`

Fields:
- **Precio pagado** — numeric input, pre-filled with the item's last recorded price if available
- **Tienda** — chip selector built from the item's `stores` array; pre-selected if only one store; `+ otra` chip for free-type entry

### Purchase toast

Appears after the user marks an item as purchased (checkbox tap). Non-blocking.

Structure:
```
[progress bar — drains over ~6s]
[ Compraste Leche Entera    [Añadir precio]  ✕ ]
```

- Progress bar drains left-to-right above the toast body, indicating auto-dismiss timer
- `Añadir precio` opens `LogPriceSheet` pre-populated with:
  - Last recorded price for this item (if any)
  - Item's stores pre-populated as chips; pre-selected if only one
- `✕` dismisses immediately
- Toast auto-dismisses when the timer expires

---

## Open Prices API

**Base URL:** `https://prices.openfoodfacts.org/api/v1`  
**Endpoint used:** `GET /prices?product_code={ean}` — no authentication required for reads  
**Cache TTL:** 7 days in `price_cache`  
**Aggregation:** median of `price` values from the response  
**Failure handling:** if unavailable or no data, return `community_price: null` — never block barcode lookup

---

## Out of Scope

- Submitting prices to Open Prices (requires proof image + OSM location)
- Price trend charts on the drill-in view (inline expand shows stats only: last/min/max)
- Multi-currency support (€ only)
- Price alerts or notifications
