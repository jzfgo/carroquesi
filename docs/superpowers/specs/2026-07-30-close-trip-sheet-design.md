# Phase 3b — closing a trip, and the ticket header

Design for the UI half of spec v6 phase 3. Base branch is
`feat/redesign-spec-v6`, never `main`.

Phase 3a built the `Purchase` entity and shipped `POST /purchases/close` with
nothing calling it. This phase gives the household a way to declare a shop, and
gives the receipt sheets a header that says which shop it was.

## Design authority

The screens are already designed. The UI redesign handoff
(`design_handoff_carroquesi_ui`) is the reference, and this spec records
structure and behaviour rather than look. The option ids used below:

| id | what it is |
|---|---|
| `10b` | the close sheet — informative table, pencil, "añadir algo que no estaba" |
| `10d` | "Ajustar producto" — where a row opens, and the blank form for an impulse buy |
| `13a` | receipt review — the same sheet with the paper's data in it |
| `13b` | resolving one receipt line |
| `18b` | the sheet header at scale: thumbnail, title, store and date controls, the count bar |
| `25b` | the thumbnail's two states, with photo and without |
| `29b` | closing a trip that already tore off |
| `30a` | the four sheet types, and what the ticket header prints |
| `6c` | inherited prices, opt-in with confirmation |

Where this spec and the handoff disagree, the handoff wins and the disagreement
is a bug in this spec.

## What this is for

A trip is declared, not inferred. Phase 3a made that true in the data and left
it unreachable in the app: the cart tears off at midnight into a trip with no
store and no total, because nothing lets anyone say what the shop was.

The stamp on the cart rubric already reads "Cerrar compra". It does nothing,
because `CartRubric` takes an optional `onClose` that no caller passes. This
phase is what happens when it is pressed.

## Scope

**In:** the close sheet in its hand-written mode, the ticket header with store
and total, a read path for trips, the offline queue op and its drain branch,
and E2E cover for a filed trip.

**Out, to 3c:** ticket mode. The sheet is designed for both modes now and
renders only one. See "One sheet, two modes" below for why the split is here
rather than somewhere else.

**Out, deferred:** `6c`'s inherited prices. They are canonical in `10b` but need
a last-confirmed-price-per-item-per-store read that does not exist. Everything
else in this phase reuses machinery that does.

**Out, still:** receipt image storage. Phase 3a pushed it out of phase 3 pending
its own ADR, and nothing here changes that. The consequence is that the ticket
header in the list ships without the dashed-or-solid miniature `30a` draws. The
miniature inside the sheet is unaffected, because that image is in memory for
the length of the flow and never stored.

## Settled decisions

### One sheet, two modes, and the paper decides which

`10b` and `13a` are the same sheet. Both set a store and a date, list what is
about to become bought, offer a way to add something that was not on the list,
and end in one button that saves. What differs is only what the paper brings.

The mode lives in the thumbnail, which is always present in the header:

- **No paper.** The thumbnail is a dashed rectangle with a camera. Tapping it
  reads a receipt and fills this same sheet in. Scanning stops being a separate
  screen and becomes something you do to a close that is already open.
- **With paper.** The thumbnail is the receipt, with a badge that opens it full
  screen. Behind that preview are the other two things you can do to a paper:
  read it again, and discard it.

Discarding returns the sheet to its hand-written mode and **keeps everything the
scan parsed**. Names, quantities and amounts stay as ordinary typed values. What
is dropped is the paper's authority, not its content — the confirmed total goes
away, the raw lines stop standing behind the names, and the header will print
`≥` again.

The two directions cost differently on purpose. Adding the paper is additive, so
one tap is right. Discarding removes an authority, so it sits one level down —
which is also how the destructive action stays separated without a confirm
dialog.

### Manual first; ticket mode is 3c

Full convergence means `ReceiptScanSheet` stops existing as a separate screen.
That is the right destination and the wrong thing to do in this phase. It is a
755-line component with 736 lines of CSS, committed visual baselines, and the
`13b` resolve flow inside it. Migrating it while trips are being introduced puts
two moving things in one review.

So 3b ships the sheet with no camera in the thumbnail slot, and the existing
scan flow keeps working untouched. Until 3c the sheet does not claim to scan, so
there are never two doors to the same act.

The hedge that makes 3c cheap: **the row and header state model carries the
receipt-only fields from the start** — the raw line, the match state, the
paper's total — even though nothing populates them. 3c then lays data onto a
settled component instead of rewriting it.

### The store is asked for, never inferred

`list_items.stores` is a hint about where an item *could* be bought. It is not
evidence of where it *was* bought, and `price_store` does not have to match it.
The app therefore does not know which shop you went to.

So the store control starts empty and dashed, in the same "this is asked for"
treatment `29b` uses. Recently used stores may be offered as suggestions.
Nothing is pre-selected, and the hint never decides anything.

**Asked for, and required — a deliberate deviation from `13a`.** The handoff
lets a save go through with the store empty: "sin fecha no se puede guardar; la
tienda sí puede quedar vacía". This spec requires it instead, on the maintainer's
call, and the argument is about who is answering.

Whenever a *person* closes a purchase, they were there. They know the shop,
whether they are typing the lines by hand or holding the receipt the camera just
read. Asking for something the answerer certainly knows is a fair question, and
the alternative is a ticket that says "Sin tienda" because a required field was
skippable.

The one case that cannot answer is the one with nobody in it: the cart that
tears off at midnight unreconciled. Nothing can infer a shop there, so
`Purchase.store` stays nullable in the model and store-less trips remain a valid
state — they are just no longer a state a person can *create*.

So: date required and store required at the close endpoint; both nullable in the
table.

### Everything is ticked, and unticking leaves the item in the cart

Every row carries a checkbox, checked by default, with "Quitar todas" in the
count bar toggling them. This is the pattern `13a` and `18b` already use.

An unticked row is not part of this ticket. It stays in the cart, still
purchased, waiting for the next close. That is what makes the two-shop evening
work: untick your partner's Mercadona lines, close Lidl, then close again.

Note the rule differs between modes, and the difference is deliberate. In ticket
mode an unticked line still counts toward the paper's total, because the paper
is not up for discussion — the bag charge was on the receipt whether or not it
is recorded. In hand mode there is no paper to respect, so an unticked row
contributes nothing.

### Two figures, two homes

The line amounts and the ticket total are different facts and are stored
differently.

- **The sum of the lines** is what enters `list_items.price` and price history.
  It is the only itemised money there is.
- **The paper's total** is what goes in `Purchase.total`. It is confirmed truth
  and is never computed.

A hand-written close has no paper, so it leaves `Purchase.total` NULL and the
ticket header prints the derived sum with `≥`. A scan-driven close writes the
confirmed figure and the header prints it plain. The `≥` is therefore not a
formatting detail: it is how a reader tells a shop somebody wrote down from a
shop somebody has a receipt for.

This widens what `≥` means today. The badge currently shows it only when some
line has no price. On a trip with no confirmed total it shows always, complete
lines or not, because a till adds things no line ever held — a bag, a deposit, a
discount. "At least this much" stays true in a way "exactly this much" would
not.

When the two disagree, `18b` shows the difference above the button and does not
offer to fix it. A till discount is ordinary, and adjusting a line so the
arithmetic closes would be inventing data.

### The rows are everything not yet bought

The table holds three kinds of row:

1. **In the cart** — ticked. These are already purchased and already attached to
   the open trip.
2. **On the list, not ticked off** — unticked. Ticking one stamps its
   `purchased_at` and attaches it to the trip. This is the household that shops
   without marking anything and sorts it out at home, which the impulse-buys
   design names as the most likely pattern. Without these rows that household
   gets `409 NothingToClose` and then recreates items that are already on the
   list.
3. **Added here** — an impulse buy. Created already purchased, and it stays on
   the list for next time.

Leaving a row without a price is a legitimate outcome. It is saved as bought
with no amount, and no amount is invented for it.

### Closing a trip that already tore off

`29b` is the same sheet with two differences. The date is inherited from the
trip rather than defaulting to today, because stamping an old shop with today's
date would dirty the history. And the store is empty and asked for, since a trip
that tore off unreconciled never had one.

This means closing targets a named trip, not always "the open one". The endpoint
takes an optional `purchase_id`.

## API surface

### `POST /lists/{list_id}/purchases/close`

The existing endpoint grows from `{item_ids, store, total}` into the whole
sheet, so one press of "Guardar compra" is one call and one queue entry.

```
purchase_id:  str | None        # absent means the open trip
store:        str               # required; a person closing a shop knows it
purchased_at: datetime | None   # the date control; defaults to now
total:        float | None      # the paper's figure; NULL for a hand close
scan_id:      str | None        # 3c only; ties the close to a ReceiptScan
lines:        [{item_id, price, price_per, quantity}]
new_items:    [{name, brand, ean, price, price_per, quantity}]
```

Behaviour, in order:

1. `new_items` are created with `purchased_at` set, then attached.
2. For each line, an item whose `purchased_at` is NULL is stamped and attached
   first. The transition is inferred from server state, never from a client
   flag, so one member cannot rewrite a timestamp another member set. This is
   the rule `apply_receipt_prices` already implements.
3. Prices are applied. `quantity` writes `purchased_quantity` and leaves the
   planned `quantity` alone.
4. `trips.close` files the trip with `store` and `total`.

Items absent from `lines` are untouched and stay in the cart.

`purchased_at` is clamped by the existing helpers: `trips.no_future` always, and
`trips.tap_time`'s `MAX_BACKDATE` for a hand-entered date. A scan-supplied date
is only clamped forward, since a receipt records something that already
happened however long ago.

The close gets its own `PurchaseLine` and `PurchaseNewItem` rather than sharing
the receipt module's `PricePatch` and `NewPurchasedItem`. The shapes look alike
and are not: a receipt line always has a price and carries its own store, while
a hand-written line may have **no** price and takes its store from the close.
Sharing one schema would mean making the receipt path's price optional, which
would let a priceless line through the endpoint whose whole job is prices.

**This endpoint is not gated on `ai_receipt_scanning`.** That is the reason it
exists: a household without the flag has no other way to declare a shop. The
`scan_id` argument, when 3c adds it, follows the gate that the scan itself
follows.

`store` carries `min_length=1` and the existing `max_length=100`. A bounded
string is safe to reject in Pydantic, unlike `total`, whose non-finite values
crash FastAPI's own validation-error handler and are therefore checked in plain
Python. The empty case is a 422 the sheet never reaches, because its primary
stays inert until a store is chosen.

Errors keep their current meanings: `NotInTheCart` is a 400, `NothingToClose` is
a 409, and applying a price to an already-filed trip is a 409.

### `GET /lists/{list_id}/purchases`

Returns `PurchaseRead[]` for the list, newest first, bounded. The header needs
`store`, `total`, `opened_at` and `closed_at`.

It is a separate endpoint rather than four more fields on `ItemRead`. Phase 3a
put exactly two purchase fields on the item — the ones `itemState` needs — and
deliberately left store and total for a header read. Denormalising them onto
every item row would repeat one trip's figures across all of its lines.

The frontend re-fetches it on the same `lists.updated_at` change that already
drives the item re-fetch, so this adds no polling.

## Frontend

- **`CloseTripSheet`** — the sheet. Opened from `CartRubric`'s `onClose`, which
  already exists and is passed nothing, and from the stamp on an unfiled ticket
  for the `29b` case.
- **The row model** carries both modes from the start: the item id, the display
  name, quantity, price, unit, whether it is included, and the receipt-only
  fields left empty in this phase.
- **The line editor** is `10d`. It is close to `LogPurchaseSheet` in purpose;
  whether that component is extended or a sibling is written is an
  implementation call, but there must be one editor, reached from the row's
  chevron and from "Añadir producto" with an empty form.
- **`usePurchases`** supplies the header data, refetched on the existing
  `updated_at` signal.
- **The ticket header** prints `store · día` and the figure. With no store it
  prints the unfiled form from `30a`: no store, no amounts, and the stamp where
  the total goes.

## Offline

Closing is a write, so it goes through the queue. An API call that bypasses the
queue silently loses the work.

- A `closePurchase` `QueuedOp` carries the batch verbatim, plus a drain branch
  in `useQueueDrain`.
- Optimistically, ticked rows become bought against a local temporary purchase
  id, and the header renders the store and date with no confirmed total.
- New items follow the existing `tempId` mapping, so a close queued behind an
  offline add still refers to the right row after the drain.
- A 409 during drain — someone else filed the trip first — drops the op and
  shows the generic sync toast. `useQueueDrain` calls the API directly rather
  than through `useListItems`, so it does not inherit that hook's 409 handling.
  The refetch that follows the drain corrects the screen.
- The camera is disabled offline when 3c adds it, the way `LogPurchaseSheet`
  already disables saving.

## Failure space

| case | behaviour |
|---|---|
| nothing in the cart and nothing ticked | the primary is inert; there is no empty `Purchase` to create |
| two shops in one evening | untick one shop's lines, close, close again. Unticked rows stay purchased and stay in the cart |
| household ticked nothing all shop | the list's unticked items are rows in the sheet; ticking them stamps and attaches |
| an item is deleted by another member while the sheet is open | its line fails on drain or apply; the trip still closes with the rest |
| the trip is filed by another member first | 409, op dropped, toast, refetch corrects |
| closing with no store | not allowed. The primary is inert until one is chosen, and the endpoint 422s |
| a trip that tore off with no store | the only store-less trip there is. Nobody closed it, so nobody could be asked |
| the scan cannot read the store | the control arrives empty and dashed, and the save waits for it. Same rule as the hand path, since the person is equally present |
| closing with no date | not allowed. The date control always holds a value, so this is only reachable by clearing it |
| a long list under a short cart | the unticked list rows come after the cart rows and can be many. `18b` carries forty lines on a sticky header and a count, which is the pattern to follow rather than a fold |
| closing with no amounts | legitimate. The shop existed; its prices simply do not enter history |
| a price typed on a row whose item another member un-purchased | the item is re-stamped by the close, since the transition is read from server state |
| offline close, then the app is closed | the op is in IndexedDB and drains on next load |
| offline close of a trip that tears off before the drain | the batch names `purchase_id`, so it files the trip it meant, not tonight's |
| date set to a day older than the backdate limit | clamped, the same as a tap |
| duplicate impulse buy for something already on the list | not prevented. The unticked list rows exist precisely to make this unnecessary |

## Testing and verification

Measure the baselines on the worktree before changing anything, the way 3a did.
A drop in test count is the tell for a local `.env` key masking a failure CI
will hit.

1. **Backend** — closing with lines, with new items, with a pending item ticked,
   and with a subset. Closing a torn-off trip by `purchase_id`. The 400 and 409
   paths. `purchased_at` clamping in both directions. And a test that the
   endpoint works with `ai_receipt_scanning` off, since that is its reason for
   existing and a shared-schema refactor is exactly how such a gate gets copied
   in by accident. Also: a close with no store is a 422, and a trip that tore
   off unreconciled still has none — the requirement belongs to the endpoint,
   not to the column.
2. **Frontend** — the table's tick rules and "Quitar todas", the derived sum,
   that an unticked row is absent from the payload, and the line editor's
   round-trip. The queue op and its drain branch, including the 409.
3. **E2E** — `fixtures.ts` gains `/purchases/close` and a filed trip, which
   closes the last of the phase 3a carry-forwards. Baselines for the sheet and
   for a ticket header carrying a store.
4. **A computed-style assertion** anywhere the sheet depends on a small visual
   affordance. The pixel budget is an absolute count and can swallow a thin
   dashed border whole.
5. Playwright in Docker, and `just ci` green.

## Follow-ups this creates

- **3c** — absorb the receipt flow into this sheet: ticket mode, the thumbnail's
  camera and preview, `13b`'s resolve flow, and the retirement of
  `ReceiptScanSheet`.
- **`6c`** — inherited prices, and the read that feeds them.
- **Receipt image storage**, as its own ADR, which would then give the ticket
  header its miniature.
- The row's door is a chevron in `18b` and a pencil in `10b`. Converged it
  should be one glyph. This spec assumes the chevron, because the row opens a
  sheet rather than editing in place, and that is worth confirming against the
  handoff before the first pixel.
