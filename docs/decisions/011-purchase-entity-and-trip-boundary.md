# ADR-011: The Purchase entity, and a trip declared at reconciliation

**Status:** Accepted
**Date:** 2026-07-29

## Context

A "shopping trip" was never a stored fact. It was inferred by grouping
purchased `list_items` on their calendar day — a view, not a row. That
inference cannot express a shop that ended before midnight, two shops on one
day, or a total someone actually read off a receipt: summing the priced lines
gives `≥ € 11,20`, a running tally wearing a receipt's clothes, and no amount
of date grouping turns it into `€ 14,60`.

The absence of an entity showed up as duplication. "Is this purchase from
today" was implemented **six** times, four of them comparing UTC days when the
boundary that matters is Madrid local midnight. The inventory itself was wrong
at first: a grep for Python date arithmetic found five; the sixth,
`func.date(...) == func.current_date()` in the dashboard progress counts
(`routers/lists.py:54`), only turned up once implementation started, because a
text grep cannot see into SQL. That the inventory was incomplete is evidence
for the decision, not a footnote to it — a predicate with no home gets
re-derived at every call site, and each copy drifts to whatever assumption its
author held reaching for what was in scope.

## Decision

**`Purchase` is a second entity, not a renamed `ReceiptScan`.** `ReceiptScan`
already carries `store`, `receipt_at`, `receipt_total`, but three cases are all
reachable: a trip closed with no scan (the ordinary manual close), a scan that
matches items already filed under an older trip (`scan_receipt`'s `±3 day`
window), and a scan that commits before the user applies anything from it. Two
tables, with a nullable FK from scan to purchase, because `ReceiptScan` is
*parsed evidence* — what the OCR read, possibly wrong, possibly abandoned —
and `Purchase` is *confirmed truth*, what the household says the shop was.

**A trip is declared at reconciliation, not inferred from tap timestamps.**
Tapping an item only puts it in the list's open trip, filed by
`app/services/trips.trip_for`. Nothing about a trip is decided until someone
reconciles — closing it by hand or applying a receipt scan — and reconciling
takes a *subset* of the open cart, not the whole thing. That subset is what
lets two shoppers who tapped into the same open trip end up with two tickets,
one apiece, once each of their receipts is scanned; until then they share one
open trip, and nothing has been claimed about who bought what where.

**`tears_off_at` is stamped onto the row at creation**, not computed at read
time: local midnight after `opened_at`, in `Europe/Madrid`
(`app/services/trips.TRIP_TIMEZONE`). Every "is this trip still open" check
everywhere else — client and server — is one instant comparison against a
stored value, never a repeated day computation.

**`list_items.purchase_id` stays nullable permanently.** `NULL` means "not
purchased," which is most rows. *Purchased ⇒ `purchase_id` set* is enforced
in-app inside the mutating transaction, the same pattern
`list_members.is_default` already uses
([ADR-007](007-per-user-default-list.md)) — there is no follow-up `NOT NULL`
migration planned.

**At most one open trip per list is a database constraint, not a hope.** The
partial unique index `uq_purchases_open_per_list` on
`(list_id, tears_off_at) WHERE closed_at IS NULL` is what actually guarantees
it; `trip_for`'s select-then-insert is an optimization that can lose a race
(a fast-clock tap, two members tapping at the same instant) and does — the
loser catches the resulting `IntegrityError` and is handed the winner's row.

**Reconciling a scan whose matches span more than one trip reconciles
nothing.** `reconcile_scan` only acts when every affected item belongs to the
same trip; the prices still apply, but `receipt_scans.purchase_id` stays
`NULL` and the cart is left exactly as it was, for a manual close. And
confirming a torn-off trip **is** closing it: filling in `store`/`total` on an
already-torn-off trip also sets `closed_at`, because `trip_for` looks a trip up
by `closed_at IS NULL` and never checks whether `tears_off_at` has already
passed — leaving a confirmed-but-still-open trip in place would let a later
backdated tap silently join it under a total that never covered that line.

## Rationale

- **Two tables, not one**, because collapsing evidence and truth into one row
  means a bad OCR read can silently overwrite a total someone confirmed, with
  no error message. That failure mode is exactly what the split exists to rule
  out.
- **Declared, not inferred**, because the alternative — resolving a trip from
  tap timestamps — got the household case wrong (see Alternatives), and no
  later UI phase can un-merge two shoppers a timestamp window already
  combined.
- **Stamped, not computed**, so `Europe/Madrid` is written once, at trip
  creation, in exactly one place in the backend — never in the frontend, never
  repeated per read — and so a future change to the boundary policy cannot
  retroactively re-file trips that already tore off.
- **The household's zone, not the phone's**, because a trip is a household
  fact and "the local day the person lived through" has no single answer on a
  shared list — which person, if one is traveling? There is no per-user
  timezone anywhere in this schema, so a named, defensible default beats an
  implicit one.
- **A constraint, not app-level discipline alone**, because two members
  tapping at the same instant is not a hypothetical to trust a `SELECT` to
  catch — it is exactly the shape of the bug the redesign is closing.
- **No future tolerance on the client-supplied `purchased_at` clamp
  (`[now − 30d, now]`)**, because even five minutes of skew forward lets a tap
  at 23:57 Madrid from a fast-clock phone compute *tomorrow's* tear-off while
  tonight's trip is still open — two rows would then satisfy "unreconciled and
  not yet torn off" for one list, and the one-open-trip invariant would be
  broken by the exact mechanism meant to guarantee it. There is no such thing
  as a purchase in the future, so the server's clock wins outright.

## Alternatives considered

- **Merge into `ReceiptScan`** — rejected: a bad OCR read on a re-scan would
  overwrite a confirmed total, and there would be no error to signal it
  happened.
- **A single `lists.trip_closed_at` column** — rejected: buys the "is this
  list's cart closed" bit and folds away the day-boundary rule, but not two
  shops on one day, not a confirmed total, and not a link from a scan to what
  it reconciled. A column cannot hold a store, a total, and a history of past
  trips at once.
- **Resolve a trip from tap timestamps** — this was the first draft, not a
  rejected outsider: find the trip whose window contains the tap instant,
  back-dating `opened_at` if the tap predates it. Four branches of machinery,
  all of it guessing at something nobody had said yet, and it merged two
  concurrent shoppers at two stores into one ticket. Replaced once that case
  was traced through — a trip needed to be something someone *said*, not
  something a window contained.

## Consequences

- Two people at two shops on one evening end up with two tickets, one apiece,
  once each reconciles — sharing one open trip, honestly, until then.
- The client does no date arithmetic at all. `itemState` (frontend) collapses
  to one comparison against `purchase_ends_at`; `isSameCalendarDay.ts` and its
  UTC-day comparisons are deleted outright.
- A scan spanning several trips reconciles none of them — ergonomics traded
  for truth. The household closes that cart by hand instead, which is
  recoverable; a total attached to lines it doesn't describe is not.
- A traveling member's phone never decides the boundary — the household's
  clock does, unconditionally.
- Per-member trips remain possible later without a schema change if the
  concurrent-shoppers case ever needs finer splitting than reconciliation
  gives it — `list_items.purchased_by` is already populated, so trips could be
  re-derived from existing data.
- Two things stay explicitly out of this phase: `.receipt-thumb` would need
  receipt-image storage, which does not exist and is its own ADR (this schema
  stores no photograph, deliberately); and the ticket header UI —
  `CloseTripSheet` and rendering store/total — is phase 3b, reading the same
  rows this ADR puts in place.
