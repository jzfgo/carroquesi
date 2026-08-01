# Offline goes read-only

**Date:** 2026-08-01
**Status:** Approved (prototype validated on device)
**Prototype:** branch `offline-readonly-proto`, commits `324ab59`, `3f229f7`, `2f77905`

## Decision

Remove the offline write queue. While the app cannot reach the backend it
becomes read-only: a band overlays the top of the screen, the cached list
stays visible, and every write is refused with a toast. No write is ever
queued or replayed.

This reverses a written product principle. PRODUCT.md currently promises
"Never lose a write. Offline queueing is the contract." The new promise is:

> **Offline is honest.** You can always see your list. Writes are refused
> visibly, never dropped silently.

The reversal gets its own record: **ADR-011: offline is read-only**.

## Why

The queue bought offline writes at a high price in complexity: an IndexedDB
store, a drain hook with tempId remapping, six enqueue branches, and a third
write outcome (applied / queued / failed) that every reader of `useListItems`
had to reason about. Most of the read-only UX already existed — dashboard
CRUD, receipt scanning, and price logging were already blocked offline. The
queue's real remaining coverage was item-level writes, and the simplification
is judged worth that loss.

## Connectivity detection

`navigator.onLine` only reports clean disconnects. One bar of signal reports
online while every request times out — the common case in a supermarket. So
connectivity is judged from evidence, and the last signal wins:

- Browser `online` / `offline` events flip the state instantly.
- Every request through `apiFetch` reports its outcome. Any response, even an
  error status, proves the server is reachable. A `TypeError` (fetch failed)
  proves it is not.

The 5-second list poll thereby doubles as a heartbeat with zero poll-specific
code, and it rate-limits flapping: failure evidence arrives at most once per
tick. Hysteresis (require N successes before clearing) is deliberately
deferred until real use shows the simple version is too chatty.

The two raw `fetch` calls that bypass `apiFetch` (invite preview, waitlist
signup) do not report. They are rare, unauthenticated paths; the band is
governed by authenticated traffic.

## Components

### `frontend/src/lib/connectivity.ts` (new)

Module-level store: one boolean, `subscribe()`, synchronous `isOnline()`,
`reportRequestOutcome(reachedServer)`. Window event listeners registered at
module load. Not imported by `sw.ts` (it touches `window`, so it must never
be — it is not WebWorker-safe by design).

A module store, not React context, because the producers are not React:
`apiFetch` is plain TypeScript and the events fire outside the render tree.
Guards need a synchronous `isOnline()`, not a hook value captured in a stale
closure. React consumes it via `useOnline()` (`useSyncExternalStore`).

### `frontend/src/components/OfflineBand.tsx` (new)

Rendered once in `App.tsx`, above `Routes`, so it covers every screen. Phases:

`hidden → offline → reconnected → leaving → hidden`

- **offline**: grey band, "Sin conexión — solo lectura", slides in (300ms).
- **reconnected**: on recovery the band turns `--success` green and shows
  "De nuevo en línea" for 2 seconds, so the user sees the recovery rather
  than an absence.
- **leaving**: slides out (300ms), then unmounts.

The band is `position: fixed` (overlay, `z-index` 150 — under toasts at 200),
never in document flow: spotty connectivity must not shift the layout. It
pads for `env(safe-area-inset-top)`. Reduced motion keeps all phases but
strips the movement; unmounting is timer-driven, not `animationend`-driven,
so stripped animations cannot strand the band on screen.

### Write guards

Every mutation in `useListItems` starts with
`if (!isOnline()) { showToast('Sin conexión'); return }` — including
`savePrice` and `clearItemPrice`, which previously had no offline handling.
Controls look normal; the guard rejects the action with a toast. Per-control
`disabled={isOffline}` props on `SmartInputBar` and `LogPurchaseSheet` are
removed. The screen-level guards in `ListScreen` (rename, set default,
delete) and `DashboardScreen` (list CRUD, feedback) already work this way and
stay, now reading `useOnline()`. The receipt-scan CTA keeps its `disabled`
state: it is a large button whose disabled look communicates better than a
bounce.

A network error that slips past the guard (the request was in flight when
signal died) takes the same path as any other error: roll back to the
snapshot, show a toast. `apiFetch` has already flipped the band by then.

### What stays

- **`markWritten` / `reconcileItems`** — untouched. They guard online
  read-write races and have nothing to do with the queue.
- **`localStorage` list and dashboard caches** — they are what makes the list
  readable offline, and what makes opens fast online.
- **Reconnect catch-up** — nothing replaces the drain's re-read. The 5-second
  poll compares `updated_at` and re-fetches within one tick of reconnecting.

## Deletions

Code:

- `frontend/src/lib/offlineQueue.ts` + `offlineQueue.test.ts`
- `frontend/src/hooks/useQueueDrain.ts` + `useQueueDrain.test.ts`
- `frontend/src/hooks/useIsOffline.ts` + `useIsOffline.test.ts` (superseded
  by `useOnline`)
- the six `enqueue()` branches in `useListItems`
- the `pendingCount` banner in `ListScreen` and the offline banner in
  `DashboardScreen` (replaced by the one band)
- `isOffline` props on `SmartInputBar` and `LogPurchaseSheet`

Tests scattered outside the queue's own file (confirmed by audit):

- `useListItems.test.ts`: the "write queue on network error" describe —
  rewritten to assert rollback + toast, not enqueue (done in prototype)
- `SmartInputBar.test.tsx`, `LogPurchaseSheet.test.tsx`: `isOffline` prop
  tests — removed with the props (done in prototype)
- `DashboardScreen.test.tsx`: offline banner test — removed; the band is
  tested at its own level (done in prototype)
- `ListScreen.test.tsx`: audit remaining queue/offline references during
  implementation

Leftover state: one startup line, `indexedDB.deleteDatabase('cqs_offline')`,
so pre-upgrade queued writes do not sit stranded in users' browsers forever.

## Documentation updates

- **PRODUCT.md**: positioning bullet 4 (drop "offline write queue that
  replays on reconnect"), the "Connectivity is unreliable" assumption, and
  principle 3 ("Never lose a write") — all rewritten around the new promise.
- **AGENTS.md** (root): the offline-queue bullet in frontend conventions, the
  two-writes-outside-the-guard bullet (the offline half no longer applies),
  and the data-model/sync notes that mention the queue.
- **ADR-011**: new record; notes what the queue was, why it was removed, and
  that ADR-010's polling/push complement is unaffected.

## Testing

- `connectivity.test.ts`: event flips, request-evidence flips, a success
  overriding a stale `offline` event, subscribe/unsubscribe.
- `OfflineBand.test.tsx`: phase sequence with fake timers — appears when
  offline, green message on recovery, unmounts after exit; never mounts on a
  cold online start.
- `useListItems.test.ts`: guard tests (offline write → toast, no API call)
  plus the rewritten rollback tests.
- E2E: none. No fixture simulates offline today; out of scope.

## Out of scope

- Hysteresis / flap damping (deferred until proven necessary)
- Any offline write affordance (drafts, retry buttons)
- Backend changes — this is frontend-only
