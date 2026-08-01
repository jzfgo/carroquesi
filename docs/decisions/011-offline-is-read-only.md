# ADR-011: Offline is read-only

**Status:** Accepted
**Date:** 2026-08-01

## Context

Reverses the offline-write half of the original sync design; PRODUCT.md
principle 3 was rewritten with it.

Item writes used to go through an IndexedDB queue (`lib/offlineQueue.ts`)
that replayed on reconnect (`useQueueDrain`), with tempId remapping so
offline-created items could be edited and deleted before they had a real
id. "Never lose a write" was a written product principle.

The queue bought that promise at a high price: a third write outcome
(applied / queued / failed) that every reader of `useListItems` had to
reason about, replay-ordering races that produced real bugs (see
`frontend/tests/README.md` on what `retries: 2` hid), and a drain whose
re-read could revert what a test or a user had just done. Meanwhile most
of the app was already read-only offline: dashboard CRUD, receipt
scanning, price logging, and the smart input were all blocked. The queue's
real coverage had narrowed to item-level writes.

## Decision

While the backend is unreachable the app is read-only. A fixed band
overlays the top of every screen; the cached list stays visible; every
mutation is refused up front with a toast. No write is queued or replayed.

Connectivity is judged from evidence, last signal wins: browser
online/offline events, plus the outcome of every request through
`apiFetch` (any response proves reachability; a fetch `TypeError` proves
the opposite). The 5-second list poll doubles as the heartbeat, so the
flaky-signal case — `navigator.onLine` true, every request timing out —
is detected within one tick. The store is module state
(`lib/connectivity.ts`), not React context, because its producers
(`apiFetch`, window events) are not React.

## Consequences

- Ticking items off in a supermarket with no signal no longer works. This
  was the queue's strongest scenario and is knowingly given up.
- One write outcome pair (applied / rolled back). `markWritten` and
  `reconcileItems` stay — they guard online read-write races, which exist
  regardless of the queue.
- Reconnect needs no special handling: polling re-syncs within one tick.
- The band can never appear in an E2E run: the fixtures fulfil unmocked
  routes with a 404, which is a response and therefore reachability
  evidence.
- Pre-removal clients may hold queued writes in IndexedDB; startup deletes
  the `cqs_offline` database so they do not sit stranded.

## Alternatives considered

- **Keep the queue only for the purchase toggle.** Preserves the aisle
  scenario, but keeps the drain, the replay ordering, and the third write
  outcome for one operation — most of the complexity for a fraction of
  the coverage.
- **React context for connectivity.** Rejected: the producers are not
  React, and the guards need a synchronous read, not a hook value in a
  stale closure.
