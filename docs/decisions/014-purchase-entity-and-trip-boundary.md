# ADR-014: The Purchase entity, and a trip declared at reconciliation

**Status:** Accepted
**Date:** 2026-08-02

## Context

A "shopping trip" has never been a stored fact. It is inferred by grouping
purchased `list_items` on their calendar day — a view, not a row. That
inference cannot express a shop that ended before midnight, two shops on one
day, or a total someone actually read off a receipt: summing the priced lines
gives `≥ € 11,20`, a running tally wearing a receipt's clothes, and no amount
of date grouping turns it into `€ 14,60`.

The absence of an entity shows up as duplication. "Is this purchase from
today" is implemented six times — three in the frontend, three in the
backend — and they disagree: some compare the viewer's local day, others the
UTC day. The inventory of that duplication was itself wrong at first: a grep
for date arithmetic found five, and the sixth — the dashboard progress counts
in `app/routers/lists.py`, spelled `func.date(purchased_at) ==
func.current_date()` — only surfaced during implementation, because a text
search cannot see into SQL. That an audit of the duplication missed a sixth
of it is evidence for the decision, not a footnote to it.

An earlier, cancelled iteration of this design (PR #175, spec v6) worked out
the entity and its semantics; this ADR carries those over with one deliberate
change to the boundary's timezone, noted below.

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

Collapsing them would let a bad OCR read on a re-scan overwrite a total
someone confirmed, and there would be no error to signal it happened. That
silence is the whole reason for the split.

**A trip is declared at reconciliation, not inferred from tap timestamps.**
Tapping an item only puts it in the day's open trip — the cart. Nothing about
the shop is decided until someone reconciles — closing by hand, or applying a
receipt scan — and reconciling claims a *subset* of the open cart. That
subset is what lets two people who shopped at two shops on one evening end up
with a ticket each; until they reconcile they share one open trip, and
nothing has been claimed about who bought what where.

**"In the cart" is derived, not stored.** An item is in the cart when
`purchased_at` is set and its trip is still open; there is no item state
column. The whole family of same-day rules collapses into one question — is
this item's trip still open? — answered by `closed_at ?? tears_off_at`
against the clock. The six duplicated rules above are the motivation for the
entity; migrating them onto it is follow-up work, not part of the schema
change that introduces it.

**The boundary is stamped at trip creation, in the purchaser's client
timezone.** `tears_off_at` is the local midnight after `opened_at`, computed
from the timezone the client declares in `X-Client-Timezone`
([ADR-012](012-viewer-day-for-date-guards.md)) — members of a household are
assumed to share a zone, so whoever opens the trip speaks for it. Stamping an
instant rather than computing the boundary at read time keeps every "is this
trip still open" check a single comparison, gives the tear-off a schedulable
instant instead of a polled predicate, and means a later policy change cannot
re-file trips that have already torn off.

The cancelled iteration hardcoded `Europe/Madrid` as "the household's zone".
This design rejects that: the app already resolves date rules from the
client's declared zone, and a second timezone authority is exactly the kind
of duplicated rule this entity exists to remove. Madrid appears in one place
only — the one-time migration backfill that groups pre-existing purchases
into synthetic trips, because those rows predate any client declaration and
every existing user is in Spain. Backfilled trips keep `closed_at = NULL`
(nobody wrote those shops down) and `total = NULL` (a confirmed total that
was never confirmed is exactly what the column exists not to be).

**Supporting choices:** `list_items.purchase_id` stays nullable permanently,
with *purchased ⇒ `purchase_id` set* enforced in-app the way
`list_members.is_default` is ([ADR-007](007-per-user-default-list.md));
"at most one open trip per list and boundary" is a partial unique index
(`uq_purchases_open_per_list`) rather than application discipline; and
`receipt_scans.purchase_id` links a scan to the one trip it reconciled, NULL
when it reconciled none or several.

## Alternatives considered

- **Merge into `ReceiptScan`** — rejected: a re-scan would overwrite a
  confirmed total with a parsed one, silently. See above.
- **A single `lists.trip_closed_at` column** — rejected, and it was a real
  contender: one column buys the closed state and folds away the day-boundary
  duplication for almost none of the cost. It does not buy two shops on one
  day, a confirmed total distinct from the sum of the lines, or a link from a
  scan to what it reconciled. A column cannot hold a store, a total, and a
  history of past trips at once.
- **Resolve a trip from tap timestamps** — the cancelled iteration's first
  draft: find the trip whose window contains the tap instant, back-dating
  `opened_at` when the tap predates it. Four branches of machinery guessing
  at something nobody had said yet — and it merged two concurrent shoppers at
  two stores into one ticket, which no later UI phase could un-merge. A trip
  is something someone *says*, not something a window contains.
- **A fixed household timezone (`Europe/Madrid`)** — the cancelled
  iteration's choice, rejected here: it duplicates the timezone rule ADR-012
  already settled, and it files a trip on the wrong ticket for any household
  outside Spain, permanently.

## Consequences

- Two people at two shops on one evening get two tickets once each
  reconciles, and share one open trip, honestly, until then.
- Every same-day rule can become one comparison against a stored instant;
  until each is migrated, the old copies (including the SQL one in the
  dashboard counts) stand.
- A scan spanning several trips reconciles none of them — ergonomics traded
  for truth. Closing that cart by hand is recoverable; a total attached to
  lines it does not describe is not.
- Backfilled history is honest about what nobody recorded: synthetic trips
  carry no `closed_at`, no `total`, and a `store` only when the day's items
  named exactly one.
- Per-member trips stay reachable later without a schema change, since
  `list_items.purchased_by` is already populated and trips could be
  re-derived.
