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
boundary that matters is Madrid local midnight. The inventory was itself wrong
at first: a grep for Python date arithmetic found five, and the sixth —
`func.date(...) == func.current_date()` in the dashboard progress counts — only
surfaced during implementation, because a text search cannot see into SQL. That
an audit of the duplication missed a sixth of it is evidence for the decision,
not a footnote to it.

## Decision

**`Purchase` is a second entity, not a renamed `ReceiptScan`.** `ReceiptScan`
already carries `store`, `receipt_at` and `receipt_total`, so the two look
mergeable. They are not, because three cases are all reachable: a trip closed
with no scan at all (the ordinary manual close), a scan matching items already
filed under an older trip (`scan_receipt` matches across a ±3 day window), and
a scan row that commits before the user applies anything from it. Two tables,
with a nullable FK from scan to purchase, because `ReceiptScan` is *parsed
evidence* — what the OCR read, possibly wrong, possibly abandoned — and
`Purchase` is *confirmed truth*, what the household says the shop was.

Collapsing them would let a bad OCR read on a re-scan overwrite a total someone
confirmed, and there would be no error to signal it happened. That silence is
the whole reason for the split.

**A trip is declared when someone closes it, not inferred from tap timestamps.**
Tapping an item only puts it in the list's open trip. Nothing about the shop is
decided until someone closes it, and closing takes a *subset* of the open cart.
That subset is what lets two people who shopped at two shops on one evening end
up with a ticket each; until they close, they share one open trip, and nothing
has been claimed about who bought what where.

There is one way to close, whether the lines were typed by hand or read off a
receipt. A scan fills the same sheet rather than having a screen and an endpoint
of its own — see the spec for phase 3c of the v6 redesign. This was two paths
originally, and they were merged because they were one act described twice.

**The boundary is the household's, not the phone's.** `tears_off_at` is stamped
onto the row at creation — local midnight after `opened_at`, in `Europe/Madrid`
(`app/services/trips.TRIP_TIMEZONE`) — so every "is this trip still open" check
on either side of the wire is one comparison against a stored instant. On a
shared list "the local day the person lived through" has no single answer: which
person, if one is travelling? There is no per-user timezone in this schema, so a
named default beats an implicit one. Stamping rather than computing also means a
later change to the policy cannot retroactively re-file trips that already tore
off.

**Supporting choices**, each explained at its call site rather than here:
`list_items.purchase_id` stays nullable permanently, with *purchased ⇒
`purchase_id` set* enforced in-app the way `list_members.is_default` is
([ADR-007](007-per-user-default-list.md)); and "at most one open trip per list"
is a partial unique index rather than application discipline.

## Alternatives considered

- **Merge into `ReceiptScan`** — rejected: a re-scan would overwrite a
  confirmed total with a parsed one, silently. See above.
- **A single `lists.trip_closed_at` column** — rejected, and it was a real
  contender: one column buys the closed state and folds away the day-boundary
  duplication for almost none of the cost. It does not buy two shops on one
  day, a confirmed total distinct from the sum of the lines, or a link from a
  scan to what it reconciled. A column cannot hold a store, a total, and a
  history of past trips at once. Anyone proposing this as a simplification
  should know it was weighed and what it gives up.
- **Resolve a trip from tap timestamps** — this was the first draft, not a
  rejected outsider: find the trip whose window contains the tap instant,
  back-dating `opened_at` when the tap predates it. Four branches of machinery,
  all guessing at something nobody had said yet — and it merged two concurrent
  shoppers at two stores into one ticket, which no later UI phase could
  un-merge. Replaced once that case was traced through: a trip needed to be
  something someone *said*, not something a window contained.

## Consequences

- Two people at two shops on one evening get two tickets once each reconciles,
  and share one open trip, honestly, until then.
- The client does no date arithmetic at all. `isSameCalendarDay.ts` and its UTC
  comparisons are deleted outright.
- A scan cannot attach a total to lines it does not describe. This began as a
  rule about a scan that matched across several trips: it reconciled none of
  them, because guessing which one it meant would have invented a fact.
  Phase 3c removed the guess instead. The person closing names the trip, and a
  matched line the sheet has no row for arrives as a line to assign rather than
  as a silent write to somebody else's ticket.
- A travelling member's phone never decides the boundary.
- Per-member trips stay reachable later without a schema change, since
  `list_items.purchased_by` is already populated and trips could be re-derived.
- `.receipt-thumb` stays out: it needs receipt-image storage, which does not
  exist here deliberately, and would be its own ADR.
