# Impulse buys — adding unlisted purchased items from a receipt scan

**Linear:** [JAV-5](https://linear.app/jzfgo/issue/JAV-5/impulse-buys-add-unlisted-purchased-items-from-receipt-scan)
**Date:** 2026-07-23
**Status:** Approved, ready for implementation planning

## Problem

After scanning a receipt, lines that don't match any purchased item can only be
linked to an existing item or ignored. Anything bought that wasn't on the list —
an impulse buy, a forgotten staple — has no path into the app, so its spend is
invisible.

A second problem surfaces through the first. `scan_receipt` matches lines only
against items that are *already purchased*
(`backend/app/routers/receipt.py:48`), inside a ±3-day window around the receipt
date. The most likely usage pattern is to shop without ticking anything off and
scan the receipt at home — in which case every line comes back unmatched,
including the items sitting on the list. Given a "create new item" button, the
natural move produces a duplicate of each.

## Goals

- Create items directly in purchased state from unmatched receipt lines.
- Capture at least name and brand for each created item.
- Let a user link an unmatched line to an item that is on the list but not yet
  marked purchased, which marks it purchased rather than duplicating it.
- Optionally fill a created item from a barcode scan.

## Non-goals

- **Auto-matching unpurchased items in `receipt_matcher.py`.** Deferred
  deliberately. Unpurchased items have no `purchased_at`, so the ±3-day window
  cannot constrain them — they would become candidates for every scan. More
  candidates means more chances a wrong best-match outscores the right one,
  which risks *regressing matches that work today*. A false positive would also
  now silently mark an item purchased rather than merely mis-pricing an already
  purchased one. Manual linking carries none of that risk. Worth its own issue.
- **Receipt-scan idempotency.** Re-scanning the same receipt creates a second
  set of items. `scan_id` is recorded but not used as a dedup key.
- **Any behavioural distinction between impulse and forgotten items.** Explicitly
  out of scope per JAV-5; both are simply purchased items.

## Data model

No migration. `ListItem` already carries every field required: `name`, `brand`,
`ean`, `stores`, `price`, `price_per`, `price_store`, `purchased_at`,
`purchased_quantity`. An impulse buy is a row born with `purchased_at` already
set.

This also keeps the branch clear of the constraint in AGENTS.md that Alembic
migrations must be the last step before merging and must never be created in
parallel with another branch that has one.

## Backend

### Schemas — `backend/app/schemas/receipt.py`

```python
class NewPurchasedItem(BaseModel):
    name: str
    brand: str | None = None
    ean: str | None = None
    price: float
    price_per: str | None = None
    store: str | None = None
    quantity: str | None = None      # receipt qty → purchased_quantity


class ReceiptPriceBatch(BaseModel):
    scan_id: str | None = None
    receipt_date: str | None = None          # NEW
    patches: list[PricePatch]
    new_items: list[NewPurchasedItem] = []   # NEW
    mappings: list[NameMappingCreate]
```

`new_items` sits parallel to `patches`, mirroring how the batch already
separates patches from mappings. The alternative — making `PricePatch.item_id`
optional and treating `None` as "create" — overloads one type with two meanings
and forces every consumer to branch. `NewPurchasedItem` carries `store` for the
same reason `PricePatch` does: symmetry between the two paths.

`receipt_date` is carried on the batch rather than read back from the optional
`scan_id`, so the create path never depends on a lookup that may not have been
sent.

### Endpoint — `apply_receipt_prices`

Three changes:

1. **Resolve a single purchase timestamp.** `receipt_date` parsed to a date and
   combined with midnight; if absent or unparseable, `datetime.now(UTC)`. Used
   for both created items and newly-purchased linked items so one confirm
   produces one consistent timestamp.

2. **Patches may transition purchase state.** Existing price/store/quantity
   writes are unchanged, plus:

   ```python
   if item.purchased_at is None:
       item.purchased_at = purchase_ts
   ```

   The transition is *inferred* from current server state — there is no flag on
   the wire. A flag would let a stale client assert something the server cannot
   verify, silently rewriting the timestamp of an item another member purchased
   days ago. Deriving it server-side makes that unrepresentable: the transition
   can only happen once, on an item genuinely unpurchased at commit time. Items
   already purchased keep their original timestamp.

3. **Create items from `new_items`.**

   ```python
   ListItem(
       list_id=list_id,
       added_by=current_user.id,
       name=..., brand=..., ean=...,
       stores=[store] if store else [],
       price=..., price_per=..., price_store=store,
       quantity=None,                    # planned qty — never set here
       purchased_quantity=...,           # actual receipt qty
       purchased_at=purchase_ts,
   )
   ```

   `quantity` stays `None` and the receipt quantity goes to
   `purchased_quantity`, matching the convention already documented at
   `receipt.py:126-127`.

Response becomes `{"items_updated": n, "items_created": m}`. `scan.items_updated`
records `n + m` — the column means items affected by the scan.

Mappings need no backend change: the frontend knows the name it typed, so it can
emit a `NameMappingCreate` for a created item exactly as it does for a linked
one. Since the created item is purchased, a future scan's mapping lookup
(`receipt_matcher.py:59`, which searches purchased items by name) will resolve
it.

## Frontend

### Row state — `ReceiptScanSheet.tsx`

A create intent is a genuine third state and gets its own field rather than
overloading `itemId`:

```ts
type LineMode = 'ignore' | 'link' | 'create'

interface LineState {
  included: boolean
  mode: LineMode
  itemId: string | null     // mode === 'link' only
  createText: string        // mode === 'create' — raw sigil text
  createEan: string | null  // captured from a barcode scan
  quantity: string
  unitPrice: number
  pricePer: 'KILOGRAM' | null
}
```

The `__create__` sentinel exists only as a `<select>` option value at the DOM
boundary; it never enters state.

### Create input

Choosing `✚ Crear artículo nuevo` in the existing "Vincular a" dropdown reveals a
single text field parsed by `lib/parseInput.ts`, reusing the app's established
sigil grammar rather than introducing a second convention:

```
Leche semidesnatada #Hacendado
```

**Sigil scope:** `#brand` and `|EAN` are honored. `+qty` and `@store` are parsed
*out* of the name but their values discarded — the row's Cantidad field and the
receipt header already own those, and two writable paths to one value invites
silent disagreement. Discarding still requires parsing, so typing `+2` never
leaks the literal text `"+2"` into the item name.

Effective EAN is `parsed.ean ?? createEan`.

Note `parseInput` is greedy: after a sigil, unsigiled words keep appending to
that field (`parseInput.ts:63-64`), so `Leche #Hacendado semi` yields brand
`"Hacendado semi"`. Sigils must come last. This matches SmartInputBar behaviour,
so the habit already exists, but the hint text under the field should reflect it.

### Linking to unpurchased items

`ListScreen` stops filtering `items.filter(i => i.purchased)` (currently
`ListScreen.tsx:924-925`) and passes the full roster with a `purchased` flag. The
sheet renders a `Sin comprar` optgroup ahead of the existing date groups.

`purchasedDateLabel(null)` returns `"Fecha desconocida"`
(`lib/itemCost.ts:91`), so unpurchased items must be split out *before*
`groupItemsByDate`, not passed through it.

The existing rule that one item cannot be linked to two rows
(`availableItems`) applies unchanged.

### Barcode scan

`ListScreen`'s `scannerOpen: boolean` becomes a target:

```ts
type ScanTarget =
  | { kind: 'add' }
  | { kind: 'receipt-line'; index: number }
  | null
```

`ReceiptScanSheet` gains `onRequestScan(index)`, a `pendingScan: { index, product
} | null` prop, and an `onScanConsumed()` callback. A `useEffect` applies the
product to that row — `createText` built by the existing `buildPrefill`
(`BarcodeScanSheet.tsx:21-28`, which already emits `"name #brand"`), `createEan`
from `product.ean` — then clears it.

This works without lifting state because `BarcodeScanner` is already rendered as
an independent sibling gated on its own flag (`ListScreen.tsx:768`), not nested
inside any sheet. The receipt sheet stays mounted throughout, so every other row
edit survives the camera.

**Known implementation hazard:** `BarcodeScanner` renders at DOM line 768 and the
receipt `.sheet-container` at line 921 — later in DOM order. Unless z-index is
explicit, the sheet paints over the camera. Verify in a real browser, not only in
tests.

Price and quantity always come from the receipt line, never from the scanned
product. Only name, brand and EAN are filled.

## Failure space

| Case | Behaviour |
|---|---|
| `receipt_date` null or unparseable | `purchased_at` falls back to `now()` |
| Create selected, name empty after parse (user types only `#Hacendado`) | Row invalid; confirm disabled with inline error |
| Price ≤ 0 — e.g. `DTO. TARJETA CLIENTE −2,00` | Warn inline; a negative-priced "item" is almost never intended |
| Junk lines — `BOLSA PLASTICO`, `TOTAL`, `IVA 10%` | No guard. Unmatched rows keep today's `included: false` default, so junk requires deliberate opt-in |
| Duplicate of an **unpurchased** item | Solved by design — it appears in the dropdown, so the user links instead of creating |
| Duplicate of an **already-purchased** item | Still possible, and sometimes legitimate (bought twice). No guard |
| Re-scanning the same receipt | Not idempotent; creates a second set. Mitigation limited to disabling confirm after submit |
| Barcode lookup 404 | Toast; text field left as typed |
| Scanned product is not the receipt line | Name/brand/EAN from the scan, price/qty from the line. Visible and correctable before confirm |
| Zero unmatched lines | Nothing changes; no create affordance appears |
| Many unmatched lines | Each row independent; no aggregate limit |
| Two members scanning concurrently | Last write wins per item; creates are additive. No new race beyond today's |
| Linked item purchased by someone else between scan and confirm | Server sees `purchased_at` non-null and leaves it; only price fields update |

## Testing

**Backend** (`backend/tests/test_receipt.py`):

- `new_items` creates a row with every field set correctly
- `purchased_at` taken from `receipt_date`
- `purchased_at` falls back to `now()` when `receipt_date` is absent
- linking an unpurchased item sets `purchased_at`
- linking an already-purchased item leaves `purchased_at` untouched
- a name mapping is written for a created item
- response reports `items_created`

**Frontend** (`frontend/src/components/ReceiptScanSheet.test.tsx`):

- selecting create reveals the text field
- empty name after parse blocks confirm
- `#brand` and `|EAN` parsed; `+qty` and `@store` stripped and ignored
- a scan fills the field and captures the EAN
- `Sin comprar` optgroup renders and linking one is included in the batch

**Visual:** the sheet's committed screenshot baselines will need regenerating via
`just frontend update-snapshots` (Docker, to match CI's Linux font rendering).

## Surface touched

- `backend/app/schemas/receipt.py`
- `backend/app/routers/receipt.py`
- `backend/tests/test_receipt.py`
- `frontend/src/components/ReceiptScanSheet.tsx` + `.css` + `.test.tsx`
- `frontend/src/components/ListScreen.tsx`
- `frontend/src/types.ts`
- `frontend/src/lib/api.ts`
- `CHANGELOG.md`

The barcode scan-target routing is the most separable layer, and is the natural
split point if implementation has to span more than one PR.
