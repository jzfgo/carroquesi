# Phase 3a — the `Purchase` entity

Design for the data half of spec v6 phase 3. Base branch is
`feat/redesign-spec-v6`, never `main`.

## What this is for

The list becomes a receipt as you shop. Today the receipt is an illusion: a
"trip" is not stored anywhere, it is inferred by grouping purchased items on
their calendar day. That inference cannot express the three things the phase
needs — a shop that ended before midnight, two shops on one day, and a total
that was **confirmed** rather than summed.

The last of those is the reason the entity exists. A ticket header reading
`Lidl · lunes 20 — € 14,60` is a record of something you were handed at a till.
Summing the priced lines gives `≥ € 11,20`, which is a running tally wearing a
receipt's clothes. There is nowhere to put the real figure, and no amount of
date grouping creates one.

## Scope

**In:** the `Purchase` model, `list_items.purchase_id`,
`receipt_scans.purchase_id`, the migration and its backfill, closing a trip
(manually and from a receipt scan), collapsing the five duplicated day-rule
implementations, a test that actually runs migrations, and **an ADR** —
AGENTS.md asks for one when introducing a data-model pattern, and both the
`Purchase`/`ReceiptScan` split and the `Europe/Madrid` boundary qualify.
Landing it beside the migration is cheaper than remembering later.

**Out, to 3b:** the ticket header, `CloseTripSheet`, the offline `QueuedOp` for
closing, and the `purchases` read endpoint that feeds store/total to the header.

**Out, entirely:** `.receipt-thumb`. The receipt image is sent to Gemini
client-side and discarded — nothing stores it, and `frontend/src/lib/firebase.ts`
is Auth-only by deliberate decision. Storing receipt photographs is a new
infrastructure dependency and needs its own ADR. It should come off phase 3.

## Settled decisions

### `Purchase` is a second entity, not a renamed `ReceiptScan`

`ReceiptScan` already carries `store`, `receipt_at`, `receipt_total`. The
discriminating question is whether all three of these are reachable, and they
are:

| case | why |
|---|---|
| trip with no scan | closing a trip without photographing anything is the ordinary path |
| scan attached to a trip that predates it | `scan_receipt` matches *already-purchased* items (`receipt.py:130`) |
| scan with no trip | the `ReceiptScan` row commits (`receipt.py:143`) before the user applies anything, and `/receipt-prices` is a separate endpoint they may never reach |

So: two tables, nullable FK from scan to purchase. The distinction to encode in
a model comment, because it will not be obvious later:

- **`ReceiptScan` is parsed evidence.** What the OCR read. Possibly wrong,
  possibly abandoned.
- **`Purchase` is confirmed truth.** What the household says the trip was.

Collapse them and a bad OCR read silently overwrites a total someone confirmed.
That is a data-integrity failure with no error message.

### A trip is *declared*, not inferred

The first draft of this design resolved a tap to a trip by timestamp: find the
trip whose window contains the tap instant, back-date its `opened_at` if the tap
predates it, create one otherwise. Four branches of machinery, all of it
guessing at something nobody had said yet.

It also got the household case wrong. Two people shopping at two shops at the
same time have their taps fall inside one window, so they get one ticket
containing two shops. That is not a rendering gap — no UI phase fixes it.

The trip is decided **when you get home and say what the shop was**, not while
you walk around. Tapping only puts something in the cart. Reconciling — closing
manually, or scanning the receipt — is the act that declares a ticket, and it
takes a *subset* of the cart. The evening then works out correctly:

| | |
|---|---|
| 18:00 | five items tapped at Lidl → open trip `T1` |
| 18:10 | partner taps four at Mercadona → also `T1`; nothing is declared yet and that is fine |
| 20:00 | Lidl receipt scanned, matches the five → creates `T2` (store Lidl, total € 14,60, closed); those five move out of `T1` |
| 20:05 | Mercadona receipt scanned → `T3`; `T1` is now empty and is deleted |

Two tickets, two stores, two confirmed totals, one day. The concurrent-shoppers
problem dissolves rather than being deferred, and the resolver disappears with
it.

### The tear-off boundary is stamped, not computed

`tears_off_at` is written onto the trip at creation: local midnight after
`opened_at`, in `Europe/Madrid`. Three consequences, and they are the reason
this is worth a column:

- **All date arithmetic leaves the client.** `itemState` becomes one instant
  comparison. No `getFullYear()/getMonth()/getDate()`, no timezone in the
  frontend at all.
- **`Europe/Madrid` lives in exactly one place** — the backend, at trip creation
  — and is recorded per trip, so revisiting the policy later does not
  retroactively re-file old trips.
- **It settles who owns the boundary.** On a shared list, "the local day the
  person lived through" is ambiguous: which person? A trip is a household fact,
  so the household's zone decides it, not whichever member's phone is in an
  airport.

There is no per-user timezone anywhere (`User` has no tz column, the backend
imports no `ZoneInfo` today). `Europe/Madrid` is the defensible default for a
Spanish household product and is written down as a named constant rather than
left implicit.

### `list_items.purchase_id` stays nullable permanently

`NULL` means "not purchased", which is most rows. The invariant is
*purchased ⇒ `purchase_id` set*, enforced in-app inside the mutating
transaction — the same pattern `list_members.is_default` already uses. There is
no follow-up NOT NULL migration.

## The model

```python
class Purchase(SQLModel, table=True):
    """A shopping trip: what the household says the shop was.

    Deliberately not merged into ReceiptScan. A ReceiptScan is *parsed
    evidence* — what the OCR read, possibly wrong, possibly abandoned before
    anything was applied. A Purchase is *confirmed truth*. Collapse the two and
    a bad OCR read silently overwrites a total someone confirmed, with no error
    message.
    """

    __tablename__ = "purchases"

    id: str = Field(default_factory=_uuid, primary_key=True)
    list_id: str = Field(foreign_key="lists.id", index=True)
    opened_at: datetime = Field(default_factory=_now)
    # Local midnight after opened_at, in TRIP_TIMEZONE. Stamped here so the
    # tear-off is an instant comparison everywhere else, and so changing the
    # policy later cannot re-file trips that already tore off.
    tears_off_at: datetime
    # Set only by an explicit reconciliation. NULL with tears_off_at in the
    # past means nobody wrote this shop down; the paper simply got torn.
    closed_at: datetime | None = Field(default=None)
    store: str | None = None
    # Confirmed from the receipt — never the sum of the lines. A trip whose
    # total was never confirmed keeps NULL, and the UI says so with ≥.
    total: float | None = Field(default=None)
```

Plus `list_items.purchase_id` and `receipt_scans.purchase_id`, both nullable
FKs to `purchases.id`.

**The open trip** of a list is the row where `closed_at IS NULL AND
tears_off_at > now`. At most one exists per list; the invariant is enforced
in-app. A row with `closed_at IS NULL` and `tears_off_at` in the past is a trip
that tore off unreconciled — no reaping job, no write on read, no scheduler.

**Effective end** of a trip is `closed_at ?? tears_off_at`. That single
expression replaces every "is this today" comparison in the codebase, on both
sides of the wire.

## Lifecycle

**Tapping an item purchased** attaches it to the list's **unreconciled trip for
the Madrid day of its `purchased_at`**, creating that trip if it does not exist
(`opened_at = purchased_at`, `tears_off_at` = the Madrid midnight after it).

One rule, and it is the same rule the backfill uses — `(list_id, Madrid day)` —
which is why an offline tap from three days ago, drained today, files itself
into that day's trip rather than into this evening's shop, and why two such taps
from the same past day find one trip rather than making two. A trip created for
a past day is born already torn off, so *at most one open trip per list* still
holds. "The open trip" is just this rule evaluated for today.

Without this the clamp on `purchased_at` (`now − 30d`) and the tap rule
disagree: a tap accepted as three days old would be filed into a trip opened
now.

**Un-tapping** detaches it. If that empties the open trip, the trip row is
deleted — an empty open trip is not a fact about anything.

**Closing manually** (`POST /lists/{id}/purchases/close`) takes an optional
list of item ids, a store and a total.

- No open trip, or an empty cart → `409`. Closing nothing is not a thing that
  happened.
- Selection omitted, or equal to the whole cart → close the open trip in place:
  set `closed_at`, `store`, `total`.
- A strict subset → **split**: create a new trip (`opened_at` = earliest
  `purchased_at` in the selection, `tears_off_at` inherited, `closed_at = now`,
  with the store and total), move the selected items to it, leave the rest in
  the still-open trip.

**Closing from a scan** (`POST /lists/{id}/receipt-prices`) does the same split,
driven by what the receipt matched. Store and total come from the `ReceiptScan`
row that `scan_id` names — not from new request fields, because those two
figures are exactly what the scan already recorded.

- Affected items (patched, plus impulse `new_items`) that sit in the **open**
  trip are split out into a new closed trip, exactly as a manual subset close.
- Affected items already in a **closed** trip keep their trip. If every affected
  item is in one such trip and it has no store or total, fill those in from the
  scan — the scan is confirming a trip that was torn off unreconciled.
- `receipt_scans.purchase_id` records whichever trip the scan reconciled, and
  stays `NULL` when the matches span several.

The `±3 day` match window in `scan_receipt` is what makes the multi-trip case
reachable. Receipt scanning is behind the `ai_receipt_scanning` flag, so for
users without it the manual close is the only path — which is why the close
endpoint is not optional.

## Migration and backfill

Add one table and two nullable FK columns. No `batch_alter_table` is needed on
either dialect for adds, and nothing is made NOT NULL, so the migration needs no
batch mode at all.

**The backfill groups in Python, not SQL.** Read purchased rows through
SQLAlchemy Core, group by `(list_id, Madrid calendar day of purchased_at)` using
`zoneinfo`, insert. This is dialect-free — no `if conn.dialect.name == "sqlite"`
branch exists, which sidesteps both the shape of the precedent migration
(`661153072156_list_items_store_to_stores.py`) and its latent bug, a Postgres
`downgrade()` branch calling `conn.execute("UPDATE …")` with a bare string that
raises on SQLAlchemy 2.x. Nobody noticed because nothing tests downgrades.

Grouping must be on the **local** day. The backend stores naive UTC; grouping on
the UTC day splits or merges trips wrongly at the boundary, permanently, in
production data, with no error. In Spain a late-evening shop reads as
yesterday's.

Per synthetic trip:

| field | value |
|---|---|
| `opened_at` | earliest `purchased_at` in the group |
| `tears_off_at` | that day's Madrid midnight, plus one day |
| `closed_at` | `NULL` — nobody closed these manually, and saying otherwise fabricates a fact |
| `store` | the group's single distinct `price_store`, if there is exactly one; else `NULL` |
| `total` | `NULL`, always. A confirmed total that was never confirmed is precisely what this column exists not to be |

`downgrade()` drops the FKs and the table. It is written to work, not to
resemble the precedent.

## API surface

- `PATCH /lists/{id}/items/{item_id}` gains optional `purchased_at`, honoured
  only on the `false → true` transition and clamped to `[now − 30d, now + 5min]`
  against a wrong device clock. Without it, an offline tap drained the next
  morning is stamped at drain time — a bug that exists today and becomes
  visible as "the item joined the wrong ticket" once trips are rows.
- `ItemRead` gains **two** fields: `purchase_id`, and `purchase_ends_at`
  (the derived `closed_at ?? tears_off_at`). Two rather than four, because
  `itemState` needs exactly one comparison; store and total belong to 3b's
  header endpoint.
- `POST /lists/{id}/purchases/close` as described above.
- The un-purchase guard in `items.py:99` and the price-delete `422` in
  `prices.py:78` stop comparing UTC dates and ask whether the item's trip is
  still open.

## Frontend — data plumbing only

`itemState.ts` is rewritten to the instant comparison and stays the single place
the rule lives, as its own comment already promises:

```
no purchased_at        → pending (or bought, if the derived flag disagrees)
no purchase_ends_at    → cart      // toggled offline, not yet assigned
now >= purchase_ends_at → bought
otherwise               → cart
```

`isSameCalendarDay.ts` is **deleted** and its one caller
(`LogPurchaseSheet.tsx:65`) routed through `itemState`. Its UTC comparison is
the reason you currently cannot delete the price of something bought an hour
ago. `useListItems.togglePurchased` sends the tap time, replaces its inline
day-guard with `itemState`, and carries the timestamp in the queued payload.

`ItemList` groups receipt sheets by `purchase_id` instead of by date label, and
**`ListScreen`'s `purchasedCostByDate` is re-keyed by `purchase_id` too**
(`ListScreen.tsx:706`). It is a `Map` keyed by the rendered label string today,
so the moment two trips share a day — the case this entity exists for — the
second silently overwrites the first's total. That is a bug this phase
introduces, and re-keying is the whole fix.

The label itself still comes from a date, derived from `Purchase.opened_at`.
Against backfilled data that is the earliest `purchased_at` in the group, so
every group and every label is identical to today's and no Playwright baseline
moves. This is UI code in the data PR deliberately: without it 3a ships an
entity nothing reads. The visible ticket header stays in 3b.

**The tear-off needs something to wake it up.** `itemState` compares against
`Date.now()`, and nothing re-renders on an idle screen: the 5s poll calls
`setItems` only when `updated_at` changes (`useListItems.ts:124`), and midnight
changes nothing server-side. So the cart does not visibly tear off today either
— a pre-existing bug this phase would otherwise inherit and make load-bearing.
Fix it here with a `setTimeout` to the earliest `purchase_ends_at` still in the
future, which is only possible *because* the boundary is a stamped instant: a
value computed at read time can be polled for, a stored one can be waited on.

### Why this is worth doing at all

"Is this today" is currently implemented five times, and three of them are
wrong:

| where | basis | |
|---|---|---|
| `lib/itemState.ts:22` | local | correct |
| `hooks/useListItems.ts:152` | local | correct, but a copy |
| `lib/isSameCalendarDay.ts:3` | **UTC** | the price-delete bug |
| `routers/items.py:99` | **UTC** | un-purchase guard |
| `routers/prices.py:78` | **UTC** | price-delete `422` |

Both frontend copies are local and both backend copies are UTC, which is not
coincidence: the browser has a timezone to read and the backend has none, so
each side reached for what was in scope. This is what an absent entity looks
like in code — the predicate that would have been a method gets re-derived at
every call site, and each copy drifts to whatever assumption its author held.
After this phase there is one predicate, and the trip owns it.

## Failure space

| case | behaviour |
|---|---|
| two shoppers, two shops, one evening | **correct**, provided each shop is reconciled. Until then both sit in one open trip, which is honest — nothing has been declared |
| nobody reconciles | at Madrid midnight the cart tears off into a trip with no store and no confirmed total. The truthful record of a shop nobody wrote down |
| item marked *after* reconciling | you scan at 20:00, remember the olive oil at 20:05 → a fresh open trip with one item. Recoverable by closing it into the right ticket; named here rather than built for |
| two devices offline at once | both drain into the open trip. Correct — assignment is not timestamp-driven |
| offline across midnight | items stay in the cart (`purchase_ends_at` null) until sync, then land in whichever trip the server assigns. Visible jump, honest: the paper had not been filed |
| un-purchasing the last item of a trip | only reachable while the trip is open, and the emptied trip is deleted |
| deleting the last item of a *closed* trip | the trip row is kept. It holds a store and a total someone confirmed, and those outlive the lines |
| closing an empty cart | `409`, no empty `Purchase` row |
| DST | Madrid days of 23 and 25 hours. `tears_off_at` is computed with `ZoneInfo`, and both are tested |
| traveling member | the boundary is Madrid, not the phone. Deliberate: a trip is a household fact |
| scan spanning several trips | `receipt_scans.purchase_id` stays `NULL`; each item keeps its own trip |
| clock skew | `purchased_at` clamped to `[now − 30d, now + 5min]`; anything older files into that day's trip, not this evening's |
| midnight with the app open and idle | a `setTimeout` to the earliest future `purchase_ends_at` re-renders the tear-off. Without it nothing wakes the screen — the poll re-renders only when `updated_at` moves |
| large backfill | grouping loads all purchased rows into memory. Fine at this scale; noted so it is checked, not assumed |

## Testing and verification

Baselines measured on this worktree before any change: **847 frontend / 63
files**, **306 backend**, **90 e2e**. A test-count *drop* is the tell for local
`.env` keys masking a failure CI will hit.

1. **A test that runs the migration.** Required, not optional: the phase's whole
   risk is a migration plus a one-shot backfill, and *no test in this repo runs
   one* — `conftest.py` builds the schema with `SQLModel.metadata.create_all`,
   so a broken migration and a model/migration drift both pass CI green. Use a
   **file-based** temp SQLite database; in-memory with `StaticPool` does not
   survive Alembic's connection handling, so `conftest.py`'s engine cannot be
   reused. Seed pre-migration purchased rows straddling Madrid midnight,
   `upgrade head`, assert the grouping. Assert `downgrade` runs.
2. **A schema drift check.** After `upgrade head`, reflect and compare against
   `SQLModel.metadata`. This catches the second failure mode above, which
   nothing catches today.
3. **Split tests**: subset close, whole-cart close, close-then-tap opens a new
   trip, scan-driven split, scan spanning a closed trip.
4. **`itemState`** table including the offline-unassigned case.
5. **Postgres by hand, on a Neon branch.** CI will not apply a migration to a
   database with pre-existing rows on either dialect. Vary the environment
   before calling it verified.
6. `just ci` green; Playwright in Docker (`just frontend update-snapshots`) — a
   local macOS run writes `-darwin` baselines instead of comparing and proves
   nothing. Run a verify pass *before* regenerating anything, so it is known
   which snapshots are supposed to move.

## Follow-ups this creates

- **3b** owes: `CloseTripSheet` with item selection, the ticket header, a
  `purchases` read endpoint, and a `QueuedOp` type plus drain branch for
  closing. An API call that bypasses the offline queue silently loses the write.
- Per-member trips remain possible if the concurrent case ever bites in a way
  reconciliation does not fix: `list_items.purchased_by` is already populated,
  so trips can be re-split from existing data.
- Receipt image storage, if `.receipt-thumb` is still wanted, as its own ADR.
