# ADR-013: No offline write queue — the app is read-only without a signal

**Status:** Proposed
**Date:** 2026-08-01

## Context

Item writes went through an IndexedDB queue (`cqs_offline`) that `useQueueDrain`
replayed on reconnect. It was the mechanism behind PRODUCT.md's third
principle, «never lose a write», and behind ADR-001's operating assumption that
connectivity is unreliable.

It was also the most expensive machinery in the frontend and the least visible:
roughly 1,035 lines of source against 1,754 lines of test, and a defect class of
its own. Five open issues — JAV-98 through JAV-101 and JAV-103 — are about the
queue and nothing else:

- the drain was serialised per tab, not per queue, so two tabs could send the
  same op twice with nothing recording that it happened;
- every call opened an IndexedDB connection and none were closed, which also
  blocked any future `DB_VERSION` bump;
- retrying a refused edit could silently re-apply it over a newer one;
- an op whose type the drain did not recognise was deleted with `sent` still
  false — the one path that lost a write in silence, in the phase whose thesis
  was that nothing is lost in silence;
- and a price — the paradigm typed write, an amount read off a shelf — never
  reached the queue at all.

Each is fixable. Together they are the shape of the thing: a second, durable,
concurrent write path with its own ordering, its own failure states and its own
copy, maintained beside the real one.

PRODUCT.md's sixth principle is the one that decides it: *complexity is
earned*, and *prefer a design that makes a failure impossible over one that
handles it*.

## Decision

**Remove the queue. Refuse writes when there is no signal.**

- Every mutation guards on an instantaneous `navigator.onLine` read before the
  optimistic paint, so there is nothing to roll back.
- The controls that write are drawn as unavailable, so the refusal is visible
  before the tap rather than reported after it.
- One `OfflineBand`, mounted above the router, states the condition once for the
  whole app. Because it cannot be covered or scrolled away, the guards are
  silent — a toast per refused tap would be the same fact a third time.
- Reads are untouched. The service worker shell cache and the `localStorage`
  read caches stay, so a list still opens and reads in an aisle with no signal.
- `cqs_offline` is deleted once on boot.

PRODUCT.md principle 3 is **replaced**, not softened: *refuse a write rather
than pretend it landed*. A principle the code no longer keeps reads as a rule
somebody violated.

## Consequences

**What it costs, stated plainly.**

1. **Nothing composed offline survives.** A list tidied on the sofa with the
   wifi down is refused at the point of the tap rather than lost later. That is
   the honest version of the same limit, but it is a real loss of capability.
2. **A write attempted on a connected-but-dead network is lost.** Captive
   portals and associated-but-routeless wifi both report `navigator.onLine ===
   true`, so the gate is open and there is no queue behind it. The person gets
   a toast and a *Reintentar* that is a fresh attempt, not a promise. This is a
   regression against the queue in the app's defining scene, and it is the one
   consequence that argues for reversing this decision if it turns out to bite.
   The fix, if it does, is a reachability probe — not a queue.
3. **Whatever was queued on a device at upgrade time is lost, once.** Declined
   the alternative of keeping the drain alive for one release to empty it: that
   delays the deletion behind a two-release sequence to rescue a store that
   empties itself within a day of normal use.
4. **The handoff's `19a` is partly overruled.** Its argument — *a list without
   signal is not broken* — holds in full for reads, which is where most of its
   weight was. The per-row «written here, not sent» dot has no successor,
   because the state it depicted can no longer occur.

**What it does not change.** Two-device concurrency was never the queue's
problem; the 5 s poll still owns it. Temp ids stay — they are about latency,
not connectivity — and so does JAV-97 in full.

## Alternatives considered

**Fix the five issues and keep the queue.** Each is tractable, and JAV-98's
`navigator.locks` fix is a few lines. Rejected because it buys a correct version
of a subsystem whose cost is the subsystem, not its bugs — and because the
sixth principle asks whether it is earned, not whether it can be made to work.

**Keep the queue for the close-trip write only**, the one that carries a whole
shop and a money total. Rejected: it keeps every part of the machinery — store,
drain, ordering, failure copy, the sheet — to serve one call site, which is the
worst of both. The close sheet stays open on failure instead, and is now the
only thing holding the shop.

**A reachability probe** so the gate closes on dead-but-associated networks.
Deferred rather than rejected. It is the answer to consequence 2 if that turns
out to matter in practice, and it needs no IndexedDB.

## References

- `docs/superpowers/specs/2026-07-31-remove-offline-queue-design.md`
- Supersedes `docs/superpowers/specs/2026-05-28-offline-support-design.md`, and
  the `19a`/`19c` half of `2026-07-31-offline-errors-undo-design.md`
- JAV-98, JAV-99, JAV-100, JAV-101, JAV-103 — closed by this decision
- JAV-97, JAV-105, JAV-106 — explicitly **not** closed by it
