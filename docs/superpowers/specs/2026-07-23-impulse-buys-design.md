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
- Honour the time printed on the receipt, not just the date, when stamping
  `purchased_at`.

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

`ListItem` needs no change. It already carries every field required: `name`,
`brand`, `ean`, `stores`, `price`, `price_per`, `price_store`, `purchased_at`,
`purchased_quantity`. An impulse buy is a row born with `purchased_at` already
set.

One migration is required, for the receipt timestamp (below):

```python
op.alter_column(
    "receipt_scans",
    "receipt_date",
    new_column_name="receipt_at",
    type_=sa.DateTime(),
    existing_nullable=True,
)
```

`DATE` widens to `DATETIME` cleanly; existing rows backfill at midnight.

**Sequencing constraint:** AGENTS.md requires Alembic migrations to be the last
step before merging, created after rebasing on `main`, and never in parallel with
another branch that also has one. The implementation plan must order this
revision last, after all other work on the branch is complete.

**The test suite will not exercise this migration.** Tests build their schema with
SQLite via `create_all`, so `alter_column` never runs until `alembic upgrade head`
executes against Neon on deploy. A green suite is therefore no evidence the
migration works. It must be run against a real Postgres locally before merge —
`DATE` → `DATETIME` with a column rename is exactly the kind of statement where
SQLite and Postgres diverge.

**Deploy ordering: backend first.** The cached-old-client case is handled by
keeping the wire field name and widening its accepted values. The mirror case is
not: a new frontend emitting an instant to a not-yet-deployed backend hits the
`except ValueError: pass` above and silently loses the date. Ship Cloud Run before
Hosting.

## Receipt timestamp

### Extraction

`receiptAi.ts` currently instructs `receipt_date: purchase date as YYYY-MM-DD`
(line 33) with no time field. It gains a nullable `receipt_time` in both
`RECEIPT_SCHEMA` and `PROMPT`, extracted as `HH:MM` in 24-hour form, null when
not clearly readable — consistent with the prompt's existing "accuracy over
completeness" rule.

### Timezone

This is the part most likely to produce a wrong-looking date, so it is fixed by
construction rather than left to the backend.

`purchased_at` is stored naive-UTC throughout the codebase
(`datetime.now(UTC).replace(tzinfo=None)`), and the frontend renders it by
appending `'Z'` (`lib/itemCost.ts:92`). A receipt prints **local wall-clock
time**. Stamping "23:30" from a Madrid receipt directly as naive-UTC would render
back as 01:30 the following day, putting the item in the wrong date group.

So **`parseReceiptWithAi` performs the conversion**: it combines the extracted
date and time as local wall-clock, and emits a UTC instant. The browser already
knows the user's zone; the backend stays UTC-only and needs no timezone
awareness. When no time is extracted, local midnight is converted the same way,
which round-trips back to the correct local date.

### Wire format

`receipt_date` **keeps its name on the wire** and widens to accept either a date
(`"2026-07-12"`) or a full instant (`"2026-07-12T17:42:00Z"`).

The DB column is renamed to `receipt_at` because its type genuinely changes and a
field named `…_date` holding `17:42` invites a future reader to assume `.date()`
semantics are safe. The wire field is *not* renamed: this is a PWA with an active
service worker, and Hosting and Cloud Run deploy independently, so cached older
frontends will keep sending `receipt_date` during a rollout. Widening an existing
`str | None` field is backward compatible by construction; renaming it would not
be.

### Parsing — required change, silent failure if missed

`scan_receipt` currently parses with `date.fromisoformat` inside a bare
`except ValueError: pass` (`receipt.py:38-43`). Verified on Python 3.13:

```
date.fromisoformat('2026-07-12')             -> date(2026, 7, 12)
date.fromisoformat('2026-07-12T17:42:00Z')   -> ValueError
date.fromisoformat('2026-07-12T17:42:00+02:00') -> ValueError
```

So sending an instant to the *unchanged* endpoint yields `receipt_date = None`
via the swallowed exception. That disables the ±3-day match window and stores
NULL in the audit row — while `ReceiptScanResult` echoes the original string back
to the client, so the sheet still displays the correct date and **nothing looks
broken**. Matching silently degrades.

Both endpoints must parse with `datetime.fromisoformat`, which handles all three
forms (verified):

```python
dt = datetime.fromisoformat(body.receipt_date)      # bare date -> midnight
if dt.tzinfo:
    dt = dt.astimezone(UTC)
receipt_at = dt.replace(tzinfo=None)                # naive UTC for storage
receipt_day = receipt_at.date()                     # for the match window
```

An explicit offset normalises correctly too: `…T17:42:00+02:00` → `15:42` UTC.

### Match window

`scan_receipt` must now call `.date()` before its `timedelta` arithmetic:

```python
receipt_day = receipt_at.date()
window_start = datetime.combine(receipt_day - timedelta(days=RECEIPT_MATCH_WINDOW_DAYS), time.min)
```

Note this date is derived in **UTC**, so a receipt printed at 00:30 local yields a
UTC date one day earlier. This is harmless only because the window is ±3 days and
absorbs a ≤2h skew. If `RECEIPT_MATCH_WINDOW_DAYS` is ever narrowed, revisit
this.

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
    receipt_date: str | None = None          # NEW — date or full UTC instant
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

1. **Resolve a single purchase timestamp.** `receipt_date` parsed as an ISO 8601
   value — a bare date yields midnight, a full instant is used as sent — and
   normalised to naive UTC. If absent or unparseable, `datetime.now(UTC)`. Used
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
| Time extracted but date null | Time alone is meaningless; treated as no timestamp, falls back to `now()` |
| Gemini never returns a time for a given receipt layout | **Intended degradation, not a bug.** Null time → local midnight → correct local date. There is no way to unit-test the model's extraction, so this fallback is the safety net; do not "fix" it into an error |
| Instant sent to a backend that still uses `date.fromisoformat` | Silently nulls the date and disables the match window. Prevented by deploy ordering, not by code |
| Date extracted, time null | Local midnight converted to UTC — round-trips to the correct local date |
| Receipt printed near local midnight (23:30 / 00:30) | Correct, because the frontend converts local wall-clock to a UTC instant before sending |
| Receipt from the other side of a DST change | Correct if the conversion uses the browser's zone rules for *that* date rather than the current offset — implementation must not use a fixed offset |
| Cached older PWA client sends a bare `"YYYY-MM-DD"` | Accepted; parses as midnight. Wire field deliberately not renamed for this reason |
| Receipt at 00:30 local vs. the ±3-day match window | Window day derived in UTC, so up to one day off; absorbed by the ±3-day slack. Revisit if the window narrows |
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
- `purchased_at` taken from `receipt_date` when it is a bare date (midnight)
- `purchased_at` preserves the time when `receipt_date` is a full instant
- `purchased_at` falls back to `now()` when `receipt_date` is absent or unparseable
- a bare `"YYYY-MM-DD"` from an older client is still accepted
- `scan_receipt` stores `receipt_at` with its time, and the ±3-day window still
  matches items either side of the receipt day
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

**Receipt time** (`frontend/src/lib/receiptAi.test.ts` or equivalent):

- date + time combine to the correct UTC instant for a known zone
- date with null time yields local midnight as a UTC instant that renders back to
  the same local date
- a date on the other side of a DST change uses that date's offset, not today's

- an instant with an explicit offset (`…+02:00`) normalises to the right UTC time

**Visual:** the sheet's committed screenshot baselines will need regenerating via
`just frontend update-snapshots` (Docker, to match CI's Linux font rendering).

**Migration, manually:** `alembic upgrade head` against a real Postgres, with rows
present, then confirm existing dates survived as midnight timestamps. The SQLite
test suite cannot cover this.

## Surface touched

- `backend/app/schemas/receipt.py`
- `backend/app/routers/receipt.py`
- `backend/app/db/models.py` — `ReceiptScan.receipt_date` → `receipt_at: datetime`
- `backend/alembic/versions/` — one revision, **created last**
- `backend/tests/test_receipt.py`
- `frontend/src/lib/receiptAi.ts` — prompt, schema, local→UTC conversion
- `frontend/src/components/ReceiptScanSheet.tsx` + `.css` + `.test.tsx`
- `frontend/src/components/ListScreen.tsx`
- `frontend/src/types.ts`
- `frontend/src/lib/api.ts`
- `CHANGELOG.md`

The barcode scan-target routing is the most separable layer, and is the natural
split point if implementation has to span more than one PR. The receipt-timestamp
work is the second most separable, but it owns the migration, so it must land
last regardless of how the work is divided.
