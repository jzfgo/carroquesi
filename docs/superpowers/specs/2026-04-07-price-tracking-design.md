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
| `amount` | float | Median of Spanish EUR community prices (see filtering below) |
| `price_per` | `Optional[str]` | `"KILOGRAM"` or `null` (unit price). Mapped from Open Prices `price_per`. |
| `fetched_at` | datetime | Used to determine cache staleness |

### `price_records` — new table

User-contributed prices. One row per purchase logged.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `list_item_id` | FK → list_items | Which item was purchased |
| `ean` | `Optional[str]` | Denormalized from `list_items.ean` at log time. Enables cross-list queries without joins. |
| `amount` | float | Normalized price in €: per unit or per kg |
| `price_per` | `Optional[str]` | `"KILOGRAM"` or `null` (per unit). Chosen by user in `LogPriceSheet`. |
| `store` | `Optional[str]` | Store where purchased |
| `user_id` | FK → users | Who recorded the price |
| `recorded_at` | datetime | When the price was logged |

---

## Backend

### Extended barcode response

`GET /barcode/{ean}` response gains `community_price: float | null` and `community_price_per: string | null` fields. On a cache hit in `price_cache` (within 7 days), return the cached values. On miss:

1. Fetch `GET https://prices.openfoodfacts.org/api/v1/prices?product_code={ean}&currency=EUR&page_size=50`
2. Filter results to `location.osm_address_country_code == "ES"` (Spanish prices only). The API has no country query param — filtering is done backend-side.
3. If no Spanish results, fall back to all EUR results.
4. Map `price_per`: `null`/`"UNIT"` → `null` (unit price); `"KILOGRAM"` → `"KILOGRAM"`; anything else → discard those results.
5. Group by mapped `price_per`; take the most common group (usually `null` for packaged goods).
6. Compute median `price` within that group.
7. Store `amount` and mapped `price_per` in `price_cache`.

If Open Prices is unreachable or returns no usable results, return `null` — never block the barcode lookup.

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

Body: `{ amount: float, price_per: "KILOGRAM" | null, store: string | null }`

Requires list membership. Creates a `price_records` row. Denormalizes `ean` from the item at write time.

### New environment variable

None required — Open Prices is read-only and unauthenticated for price lookups.

---

## Frontend

### `BarcodeRead` type

Add `community_price: number | null` and `community_price_per: "KILOGRAM" | null`.

### Price display rule

Applies to both community prices and user-logged prices wherever they are shown:

| `price_per` | Display format |
|---|---|
| `null` (unit) | `€X.XX` / `~€X.XX según la comunidad` |
| `"KILOGRAM"` | `€X.XX/kg` / `~€X.XX/kg según la comunidad` |

This rule applies in `BarcodeScanSheet`, `ItemCard`, and `PriceHistorySheet`.

### `BarcodeScanSheet`

When `community_price` is present, show the formatted community price string (per rule above) followed by `ⓘ`.  
Tooltip on `ⓘ`: *"Precio medio de la comunidad de Open Prices, filtrado a tiendas españolas cuando hay datos disponibles. Puede no reflejar los precios actuales."*

### `ItemCard`

New tag in the tags row:
- If a price has been recorded: `💶 €X.XX` or `💶 €X.XX/kg` (per display rule) — tapping opens `PriceHistorySheet`
- If no price yet: `+ 💶` CTA tag (same style as `+ 🏷️`, `+ 🏪`) — tapping opens `PriceHistorySheet`

### `PriceHistorySheet` (new component)

Bottom sheet. Structure:

1. **Scope segmented control** — `Esta lista / Mis listas / Todos`
2. **Community price banner** (EAN items only) — `🌍 Comunidad ~€X.XX[/unit] ⓘ`  
   Formatted per the community price display rule above. Tooltip: same text as BarcodeScanSheet.
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
- **Precio pagado** — numeric input with unit selector (`por unidad` / `por kg`). Pre-filled with the item's last recorded price and `price_per` (for this `list_item_id`) if available; otherwise defaults to the item's cached `community_price_per` if known, or `por unidad`. Below the input, a static legend: *"Introduce el precio normalizado: por unidad (ej. €0.89 por un cartón de leche) o por kg (ej. €3.20/kg de arroz a granel)."*
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
**Endpoint used:** `GET /prices?product_code={ean}&currency=EUR&page_size=50` — no authentication required for reads  
**Country filtering:** backend-side, `location.osm_address_country_code == "ES"`. Falls back to all EUR results if no Spanish data exists.  
**Price unit:** `price_per` is a two-value enum: `null` (per unit) or `"KILOGRAM"`. Open Prices values are mapped accordingly; unrecognised values are discarded.  
**Cache TTL:** 7 days in `price_cache`  
**Aggregation:** median of `price` values within the selected `price_per` group  
**Failure handling:** if unavailable or no data, return `community_price: null` — never block barcode lookup

---

## Out of Scope

- Submitting prices to Open Prices (requires proof image + OSM location)
- Price trend charts on the drill-in view (inline expand shows stats only: last/min/max)
- Multi-currency support (€ only)
- Price alerts or notifications
