# ADR-012: A learned receipt name belongs to one household

**Status:** Proposed
**Date:** 2026-07-31

## Context

`receipt_name_mappings` teaches the matcher what a printed receipt line means.
When someone answers "which product is `LECHE SEMI 1L`?", the answer is stored
so nobody is asked again. The table is keyed
`UniqueConstraint("store", "receipt_name")` — no list, no user. There is one row
per store and receipt line **for the whole database**, and every household
reads and writes the same one.

Nothing leaks. The row stores `item_name` as text, not `item_id`, and
`receipt_matcher.match_lines` resolves that text against the scanning list's own
purchased items. A row belonging to another list can never be returned. When the
name is not in this list, the lookup misses and the line falls through to fuzzy
matching, which is harmless.

The failure is not disclosure, it is false confidence. When the name *is* in
this list but means something else, the mapping fires and the line comes back
with `confirmed=True`. Two households can both keep an item called "Leche" and
mean different milk.

That flag used to be inert. Phase 3c made it load-bearing: `confirmed` becomes
`matchState: 'literal'` rather than `'guess'`, and `productUnsettled` reads that
to decide whether the close sheet asks the person to check the row. A name a
stranger taught the app is now shown with the same authority as one the
household confirmed itself, and it is shown *without the prompt to check it*.

The write side compounds it. `close_purchase` does
`existing.item_name = m.item_name` — last writer wins, globally, so correcting
the row for your household silently rewrites everyone else's. `use_count`
increments on that same path, so it counts writes that *contradicted* the stored
value as though they had reinforced it.

Two things make this the moment to decide rather than later. Phase 3c made
`confirmed` visible, and [ADR-011](011-purchase-entity-and-trip-boundary.md)
made the close the single door — so the write no longer happens on a receipt
screen someone opened deliberately, it rides along with an ordinary close.

## Decision

**The key gains the list: `(list_id, store, receipt_name)`.** A learned name is
the household's, read only by that household and written only by it.

The product's principles decide this, and they point the same way three times.

**Principle 5, earned data honestly shown** — *prices, history and suggestions
come from what the household actually bought*. A match presented as confirmed
that this household never confirmed is inferred data wearing recorded data's
clothes. It is the same failure the principle already forbids for a price, and
the positioning says the same thing about the whole record: the household's own,
*not a store's, not a comparison site's*.

**Principle 6, complexity is earned** — *prefer a design that makes a failure
impossible over one that handles it; do not add a branch for a state the data
model cannot produce*. The alternative below grades each mapping by who
confirmed it. That is a branch handling a bad state on every matched line.
Scoping the key removes the state: there is no foreign mapping to grade, because
the query cannot return one.

**Principle 4, a non-technical household succeeding unaided** — nothing ships
whose value requires explaining. There is no honest copy for *a person you have
never met named this product*. Scoped, the behaviour explains itself in one
sentence: the app learns what you call things.

The key also mixes two kinds of thing. `store` and `receipt_name` are objective —
a chain prints the identical string on every receipt it issues. `item_name` is a
household's own word for something. Keying globally on that pair treats a
preference as if it were a fact. Where the key really is objective, a global
table is right and stays: `barcode_cache` and `price_cache` are keyed by EAN,
which is nobody's preference. A receipt line carries no EAN, which is why this
table cannot borrow their design.

## Migration

Existing rows carry `confirmed_by`, a non-null FK to `users.id`, so every row
has a user to migrate from. Each row moves to that user's default list
([ADR-007](007-per-user-default-list.md)).

A user may belong to several lists, so naming one is a choice. It is a better
choice than it first looks: `confirmed_by`, `item_name` and `item_brand` are all
assigned on the same last-writer-wins branch, so the stored name and the stored
user always come from the *same* write. The row moves to the household whose
answer it currently holds, not to an arbitrary one of its past writers.

The default list is explicit-only and may be unset. A row whose confirming user
has no default list is **dropped rather than guessed at**, which costs one
question at that household's next scan and invents nothing. The old constraint
guarantees at most one row per `(store, receipt_name)`, so adding `list_id`
cannot produce a duplicate and the backfill needs no dedup pass.

`batch_alter_table` is the usual tool for a constraint change here, but it is
not automatic: `b9f26e9bb379` rejects batch mode deliberately, because batch
recreates a table from reflection and `7005338bb031` recorded that
`receipt_scans.receipt_at` reflects as a distinct type on SQLite. This table is
`str`, `int` and `datetime` only, so batch is very likely safe — check that
before reaching for it rather than after.

## Alternatives considered

- **Keep the table global, but only set `confirmed=True` when `confirmed_by` is
  a member of the scanning list.** The real contender, and cheap on the surface
  — `confirmed_by` already exists, so it needs no new column. Rejected on
  principle 6: it handles the collision instead of preventing it, adds a
  membership lookup to every matched line, and leaves a stranger's answer still
  steering the match, merely demoted to a guess. It also keeps last-writer-wins,
  so one household correcting a row still overwrites another's.
- **Keep it global, unchanged.** Rejected on principle 5. This is the current
  behaviour and the reason for the ADR.
- **Scope to the user rather than the list.** Rejected: the household shares the
  list, the shop and the receipt, and after ADR-011 the close is one shared act.
  Two members of one household would teach the app the same name twice, and the
  one who did not scan would never benefit from the one who did.

## Consequences

- A household's scan can no longer be steered by a row it did not write.
- `confirmed=True` comes to mean exactly what the close sheet claims when it
  renders a row settled rather than as a guess: *someone here confirmed this*.
- Each household teaches its own names. The cost is real and small: the same
  staples recur weekly, so the dictionary fills over the first shops, and it
  fills through the resolve flow that already exists rather than through
  anything new.
- `use_count` becomes per-household and finally counts what its name says.
- Two paths need a `list_id`, and they are not the same path. The read side is
  `match_lines` and `_lookup_mapping`, which `receipt.py` alone calls; the write
  side is the mapping loop in `close_purchase`. Both files already hold a
  `list_id` — one from the path parameter, one from the close — so neither has
  to have it plumbed in from anywhere new.
- **`delete_list` needs a cleanup loop.** It removes every list-scoped row by
  hand, in an ordered sequence of flushes, because no model here declares a
  `relationship()`. A `list_id` FK to `lists.id` with no `ondelete` and no loop
  raises `ForeignKeyViolation` on Postgres the first time anyone deletes a list
  that ever learned a name. That function's own comment records why this is
  worth writing down: nothing sets `PRAGMA foreign_keys=ON`, so the SQLite
  suite cannot see the bug and it would ship green.
- The EAN-keyed caches are untouched and stay global, deliberately.
- Cross-household learning becomes possible again only on an objective key. That
  needs a product identity a receipt line does not carry, so it would be its own
  ADR and its own feature, not a loosened constraint here.
