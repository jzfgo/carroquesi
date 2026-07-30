# Phase 3c — ticket mode, and the retirement of the scan screen

Design for the second half of spec v6 phase 3. Base branch is
`feat/redesign-spec-v6`, never `main`.

Phase 3b built `CloseTripSheet` in its hand-written mode and left the thumbnail
in the header dashed and inert. Scanning is still a separate screen with its own
review table, its own apply endpoint and its own reconciliation. This phase makes
the thumbnail work and retires all three.

## Design authority

The screens are already designed. The UI redesign handoff
(`design_handoff_carroquesi_ui`) is the reference, and this spec records
structure and behaviour rather than look. The option ids used below:

| id | what it is |
|---|---|
| `10b` | the close sheet in hand mode — the table 3b shipped |
| `10d` | "Ajustar producto" — the line editor 3b shipped |
| `13a` | receipt review — the same sheet with the paper's data in it |
| `13b` | resolving one receipt line |
| `18b` | the sheet at scale: forty lines, a total that does not agree |
| `25b` | the thumbnail's two states, with paper and without |
| `26b` | the review when there is nothing to match against |
| `30a` | the four sheet types, and what the ticket header prints |
| `6c` | inherited prices, opt-in with confirmation |

Where this spec and the handoff disagree, the handoff wins and the disagreement
is a bug in this spec.

## What this is for

The app has two doors to one act. Closing a shop and scanning its receipt are
the same declaration — these lines, that shop, this total — and today they are
two screens, two endpoints and two ways of deciding which trip was meant. Rule 1
of the handoff is *una acción, un camino*, and this is the largest breach of it
left in the app.

3b said the destination was right and the timing was wrong: migrating a
755-line component while trips were being introduced would put two moving things
in one review. Trips are in now. This is the review.

## Scope

**In:** ticket mode in `CloseTripSheet`, the raw line and match state on every
row, `13b`'s resolve flow, the paper's total and the reconciliation check,
`scan_id` and `mappings` on the close endpoint, the receipt date clamp, and the
deletion of `ReceiptScanSheet`, `POST /lists/{id}/receipt-prices` and
`trips.reconcile_scan`.

**Out, deferred:** `6c`'s inherited prices, for the reason 3b gave — they need a
last-confirmed-price-per-item-per-store read that does not exist.

**Out, still:** receipt image storage, pending its own ADR. Two consequences
follow and both are load-bearing:

- The ticket header in the list keeps shipping without the miniature `30a`
  draws. The thumbnail inside the sheet is unaffected, because that image is in
  memory for the length of the flow and never stored.
- `25b`'s second door — scanning a purchase that is already filed, to attach
  the paper and fill in the amounts it is missing — stays out. It cannot be
  built without somewhere to keep the paper, and its whole value is the paper.
  See "A filed trip is not scannable" below, which is where that shows up as a
  rule rather than an omission.

## Settled decisions

### One act, one endpoint — and the deferred bug dissolves

3b handed 3c a bug and a choice. `reconcile_scan` reads its trip with
`session.get`, which SQLAlchemy answers from the identity map, so a member who
filed that trip in the meantime is invisible and the scan overwrites figures
they confirmed. 3b fixed the same read in `close()` with a filtered `SELECT ...
WHERE closed_at IS NULL` and named two ways to answer it here: the same patch,
or routing reconciliation through `close()`.

This spec takes the second. `apply_receipt_prices` and `reconcile_scan` are
deleted, and a scan-driven close is a close.

The argument is not that the patch would not work. It is that `reconcile_scan`
exists to *guess which trip a scan meant*, and it only has to guess because the
scan flow never asks. Its own docstring is four sentences of reasoning about
what to do when the guess is ambiguous. The close sheet asks. A guess with no
question behind it does not deserve a filtered `SELECT`; it deserves deleting.

What the two paths actually did, side by side, is nearly the same work: stamp
`purchased_at` from server state, `trips.attach`, write price and quantity,
create the impulse buys, bump `lists.updated_at`. The real differences are four,
and each is handled below rather than kept as a second endpoint: the store is
per-patch instead of per-close, the receipt path learns name mappings, it
records what a scan updated, and it clamps the date differently.

### A scan narrows the sheet's rows; it does not replace them

The two modes are one component and one row model, which is the hedge 3b built:
`CloseLine` already carries `receiptLine` and `matchState`, populated by nobody.
3c populates them.

A scan does three things to a sheet that is already open:

1. Rows the matcher recognised get their `receiptLine`, `matchState`, price and
   quantity from the paper.
2. Lines the matcher could not place become rows with `itemId: null` and no
   name — the `Asignar producto` state of `13a`.
3. Rows the paper never mentioned stay, unticked. `12c` grouped these under "En
   el carro, pero no en el ticket"; `13a` withdrew the grouping because a group
   asserts, and the matcher is what is being checked. They are simply rows the
   scan did not tick.

The order is the paper's, because the raw line is the only thing a person can
check against what they are holding. Rows the paper never mentioned come after,
in the order they already had.

### Two totals in ticket mode, and only one of them is the paper's

Hand mode has one figure: the sum of what was ticked, shown with `≥` because a
till adds things no line ever held. Ticket mode has three, and conflating any
two of them is how a receipt screen starts lying.

- **`Purchase.total`** is the figure printed on the paper. Confirmed truth,
  never computed, and the reason the ticket header prints an amount plain
  instead of with `≥`.
- **The reconciliation check** compares the paper's total against the sum of
  **every** receipt line, ticked or not. An unticked line is still on the paper.
  Green when they agree, amber with the difference when they do not, and no
  amount is ever adjusted to make them agree — a till discount is ordinary, and
  moving a line so the arithmetic closes would be inventing data.
- **The primary's figure** — "Guardar compra · € 11,16" — is the sum of what is
  ticked, which is what is about to enter price history.

`13a` shows all three at once and they disagree by design: the disc is green at
11,31 while the button saves 11,16. That is not a defect to reconcile. It is the
screen saying *the paper says this, and you are recording that much of it*.

This is why `linesTotal` is not inverted for ticket mode. Ticket mode needs a
second, different sum — every receipt line — and a function that changed meaning
by mode would make the two impossible to tell apart at the call site.

### The paper wins, and the app's guess is an annotation

Rule 9, and the whole shape of `13a`. Every row leads with the raw string in
mono, because that is the only thing that can be checked against what is in the
household's hand. Underneath sits what the app believes, in two forms and with
no words explaining which:

- **Solid ink, no underline** — the match was literal. A string somebody already
  resolved for this shop, or the exact name of something on the list.
- **Accent with a dashed underline** — the matcher interpreted, and it is
  waiting to be confirmed. The same dashed grammar the whole app uses for "this
  is not real yet".

Confirming makes it solid, and stores the mapping so the same string arrives
resolved next time. Saving without confirming is allowed: the shop is recorded,
the amount counts toward the paper's total, and the line enters no product's
history. That is `13a`'s rule and it is what keeps a bad guess from becoming a
bad price.

### Resolving a line has two causes, in that order

`13b` is one sheet and it puts the two causes one under the other, because a
line the matcher could not place is either something already on the list that no
line has claimed, or something that was never on the list at all.

- **Pendientes de asignar** — the rows of this sheet no receipt line has taken
  yet, including what is in the cart. Radio buttons; the answer is usually one
  tap.
- **Si no estaba en la lista** — the smart input bar, which is already both
  search and create. It arrives filled from the receipt line, with the parse
  shown above it in the same form the input bar already uses.

One action, `Asignar`. Creating is only the step before assigning, so it is not
a second button. There is no *Cancelar* — the chevron is the way out — and no
"do not save this line", because that is the row's checkbox and lives in `13a`.
Repeating it here would be two paths to one decision.

`13b` is a sibling of `10d`, not a mode of it. `10d` edits four fields of a row
that already has a name; `13b` answers *which product is this*. They are reached
from the same chevron and are told apart by whether the row has an `itemId`.

### A filed trip is not scannable

`close()` refuses a trip that already has `closed_at`, and that rule does not
bend for a scan. Its total is a figure someone confirmed for the lines it held;
re-closing it would restate that figure for a different set.

This is a real narrowing against today's behaviour and it is deliberate. The
current scan matches items across a ±3 day window with no trip filter, so it
routinely reaches lines already filed under an older ticket and can rewrite
their prices. Under the close endpoint those lines are not in the trip being
closed and the whole sheet is refused with `NotInTheCart`.

Refusing the sheet rather than dropping the row is the existing rule and the
right one here: a receipt whose lines belong to two different shops is not a
close anybody can express, and silently pricing half of it would leave the
household with a ticket that does not match the paper in their hand.

The case this shuts out — completing an already-filed purchase from its
receipt — is `25b`'s second door, and it is out of scope anyway for want of
image storage. When it comes back it needs its own verb, not a second meaning
for closing.

### The scan gate covers the scan, not the close

`POST /lists/{id}/purchases/close` is **not** gated on `ai_receipt_scanning` and
must not become gated. That is its reason for existing: a household without the
flag has no other way to declare a shop.

`scan_id` and `mappings` are the scan's own fields and follow the scan's gate. A
request that names either without the flag is refused; a request that names
neither is the manual close and is always allowed.

This is exactly the gate that gets copied across by accident when two payloads
start looking alike, which is why 3b demanded a test that the endpoint works
with the flag off. That test stays, and gains a sibling for the refusal.

### A receipt's date is clamped forward only

Two clamps, chosen by whether the close carries a scan.

- **Hand close** — `trips.tap_time`: no future, and no older than
  `MAX_BACKDATE`. A hand-typed date carries a live clock's risks.
- **Scan close** — `trips.no_future` only. A receipt records something that
  already happened, however long ago, and flooring it would silently rewrite the
  day an old shop happened.

The future direction still matters in both: an OCR misread of a year digit, or
`DD/MM` read as `MM/DD`, would otherwise create a second open trip beside the
live cart, and `open_trip`'s unordered `.first()` would then pick between them
arbitrarily. This is the rule `apply_receipt_prices` already implements, moved
rather than invented.

## API surface

### `POST /lists/{list_id}/purchases/close` — two new fields

```
scan_id:  str | None                # ties this close to a ReceiptScan
mappings: [{store, receipt_name, item_name, item_brand}]
```

Everything else keeps the shape 3b gave it. Behaviour additions, in order:

1. If `scan_id` or `mappings` is present and `ai_receipt_scanning` is off, 403.
2. The date clamp is chosen by `scan_id` as above.
3. `mappings` are upserted the way `apply_receipt_prices` did — bump
   `use_count`, overwrite the item name and brand, record who confirmed it.
4. After `trips.close` succeeds, the named `ReceiptScan` records
   `items_updated` and `purchase_id`.

A `scan_id` naming a scan that does not exist, or belongs to another list, is
ignored rather than refused. The shop is the thing being recorded; losing the
audit link is not worth losing the close. This matches how the current apply
endpoint treats a missing scan.

### Deleted

- `POST /lists/{list_id}/receipt-prices` and `apply_receipt_prices`
- `trips.reconcile_scan`
- `PricePatch`, `NewPurchasedItem`, `ReceiptPriceBatch` in `schemas/receipt.py`

`POST /lists/{list_id}/receipt` — the scan and match step — stays exactly as it
is. It reads a paper and proposes; it writes nothing but its own audit row. Only
the *applying* half converges.

## Frontend

- **`CloseTripSheet`** gains ticket mode. The thumbnail becomes live: dashed with
  a camera when there is no paper, the receipt with a badge when there is.
  Behind the preview sit the two other things you can do to a paper — read it
  again, and discard it.
- **Discarding keeps everything the scan parsed.** Names, quantities and amounts
  stay as ordinary typed values. What is dropped is the paper's authority: the
  confirmed total goes, the raw lines stop standing behind the names, and the
  header prints `≥` again. Adding the paper is additive so it costs one tap;
  discarding removes an authority so it sits one level down, which is also how
  a destructive action stays separated without a confirm dialog.
- **`ResolveLineSheet`** is new — `13b`.
- **`receiptToLines`** is a pure function in `lib/closeLines.ts`: a
  `ReceiptScanResult` and the sheet's current rows in, a new row set out. Every
  rule above that can be stated without a DOM is stated there.
- **`ReceiptScanSheet`, its CSS and its tests are deleted**, along with the
  `applyReceiptPrices` call and the scan-session state in `ListScreen` that only
  existed to feed it. The source picker, the upload indicator and
  `parseReceiptWithAi` all survive — they belong to reading a paper, which is
  unchanged.
- **The camera is disabled offline**, the way `LogPurchaseSheet` already
  disables saving. Reading a receipt needs Gemini and the matcher; neither is
  reachable from a basement.

## Offline

The close is already a queued write, and ticket mode adds nothing to the queue's
shape — `scan_id` and `mappings` ride inside the same `closePurchase` payload.

The ordering that matters: a scan happens **online**, and its `receipt_scans`
row is committed by the scan endpoint before the sheet ever shows a line. So a
household that scans, walks out of range, and closes offline queues a `scan_id`
that already exists server-side. It cannot dangle.

## Failure space

| case | behaviour |
|---|---|
| the scan reads nothing the matcher can place | every line is an `Asignar producto` row. This is `26b`, and it costs nothing extra — the state already exists per row |
| the paper's total does not agree with its lines | amber disc, the difference beside it, and no amount is touched |
| a line is left unconfirmed at save | saved; it counts toward the paper's total and enters no product's history |
| a receipt line matches an item on an older filed trip | `NotInTheCart`, the whole sheet refused. A receipt spanning two shops is not one close |
| the scan cannot read the store | the control arrives empty and dashed and the save waits for it, exactly as in hand mode. The person is equally present either way |
| the scan cannot read the date | dashed and accented, and it must be answered. `13a` is explicit that there is no saving without a date |
| forty lines | `18b`: a sticky header and a count, not a fold |
| the paper is discarded mid-flow | back to hand mode, values kept, authority dropped |
| `scan_id` names a scan that has been deleted | ignored; the close succeeds and the audit link is lost |
| `scan_id` sent without the feature flag | 403. The close without it is still allowed |
| scan online, close offline | queued whole; the scan row already exists |
| another member files the trip first | 409, op dropped, toast, refetch corrects — unchanged from 3b |
| the same receipt is read twice | two `receipt_scans` rows, one close. The second scan replaces the sheet's rows; only the scan named at save is linked |

## Testing and verification

Baselines measured on this worktree before anything changed: **backend 447
tests**, **frontend 72 files / 1035 tests**. A *fall* is the tell for a local
`.env` key masking a failure CI will hit — bearing in mind that this phase
deletes a test file on purpose, so the frontend count is expected to move down
and the amount must be accounted for rather than waved through.

1. **Backend** — the two new fields: mappings upserted, scan linked, the date
   clamped forward only with a scan and floored without one, and the 403 when
   the flag is off. The existing "works with the flag off" test stays green.
   `test_receipt_router.py` loses its apply-half tests and keeps its scan half.
2. **Frontend** — `receiptToLines` against every case in the table above that
   can be stated without a DOM. The sheet's two sums, the reconciliation disc in
   both colours, and that an unconfirmed row still saves. `13b`'s two causes,
   and that assigning is the only action.
3. **E2E** — `fixtures.ts` gains the scan endpoints. Baselines for ticket mode
   and for a resolve sheet. The `ReceiptScanSheet` baselines are deleted in the
   same commit that deletes the component.
4. **A computed-style assertion** for the dashed thumbnail border and for the
   dashed underline on an unconfirmed annotation. Both are thin dashed strokes
   worth fewer pixels than the screenshot tolerance, so a screenshot cannot
   guard either — the same trap 3b called out.
5. Playwright in Docker, and `just ci` green.

## Follow-ups this creates

- **`6c`** — inherited prices, and the last-confirmed-price read that feeds them.
- **Receipt image storage**, as its own ADR. It unlocks the ticket header's
  miniature and `25b`'s second door together, because both are the same missing
  thing.
- **Completing a filed purchase from its paper**, once there is a paper to keep.
  It needs its own verb; closing is taken.
