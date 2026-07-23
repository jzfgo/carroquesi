# ADR-010: Web push via FCM, coalesced on the device against a server watermark

**Status:** Accepted
**Date:** 2026-07-23

## Context

Members of a shared list need to learn about changes while the app is closed.
[ADR-001](001-short-polling-for-list-sync.md) keeps an *open* app fresh with a 5s
poll and deliberately rejected persistent connections because Cloud Run scales to
zero. Neither polling nor a socket can reach a closed app, so out-of-app delivery is
a separate problem requiring a separate mechanism.

Two questions had to be answered: what transport, and how to avoid flooding users.
The second is the harder one. A weekly shop is a burst — a dozen items added in
under two minutes, then fifteen ticked off in the aisles. Sent naively that is
roughly twenty-six notifications for one grocery run, and the realistic user response
is to disable notifications permanently or uninstall the app.

### Transport candidates

| Approach | Notes |
|---|---|
| **FCM via `firebase-admin`** | Already a backend dependency for auth; handles token management and per-browser delivery |
| **Raw Web Push (VAPID + `pywebpush`)** | No vendor SDK; direct to each browser's push service |

### Coalescing candidates

| Approach | Notes |
|---|---|
| **Immediate send, collapse on device** | Notification `tag` replaces the tray entry; count supplied by the server |
| **Server-side windowed digest** | `pending_notifications` table flushed by Cloud Scheduler |
| **Immediate send, server-side cooldown** | Per-recipient `last_sent_at` suppresses sends inside a window |

## Decision

Send through FCM immediately on each qualifying write, synchronously inside the
request handler. Collapse on the device using a per-list notification `tag`. Supply
the notification's change count from a server-side **watermark**
(`list_members.last_seen_at`), with the count *derived* from `list_items` rather than
accumulated.

Notifications fire on item creation and on `purchased_at` transitioning `NULL → set`.
Nothing else.

## Rationale

**FCM is nearly free here.** `firebase-admin` is already a dependency for verifying
auth tokens, and `messagingSenderId` is already wired through the frontend config.
Raw Web Push would add a dependency and require hand-rolling per-browser endpoint
handling and retry semantics, in exchange for removing a vendor SDK we already ship.

**A delayed send cannot be trusted on this deployment.** The Cloud Run service runs
with no `--min-instances`, so it scales to zero and throttles CPU between requests.
FastAPI `BackgroundTasks` run *after* the response is delivered — exactly when CPU
allocation is withdrawn and the instance becomes eligible for reclamation. A
debounce timer there is not slow, it is non-deterministic: correct in local
development, silently dropping notifications in production. Any coalescing that
requires waiting must therefore live outside the process.

**Sending synchronously costs the user nothing.** `useListItems.ts` inserts items
optimistically with a temporary id and reconciles on response, so POST latency is not
user-visible. This removes the only motivation for deferring the send.

**A windowed digest trades away the feature's main value.** Cloud Scheduler's minimum
interval is one minute, imposing a ~60s floor on delivery. The primary scenario —
someone at home adding to the list while another member is in the shop — is worth
little at that latency. It also adds a GCP dependency with its own IAM configuration
and a poor local-development story.

**Device-side collapse is specified behaviour, not a trick.** Per the Notifications
API, a notification that replaces an existing one with the same `tag` does so without
sound or vibration. A burst therefore produces one alert followed by silent updates to
the same tray entry. The quiet path is the default; `renotify` is the opt-in to
re-alerting, so we depend on default behaviour rather than a flag with uneven support.

**But device-side collapse alone reports the wrong number.** If the recipient's phone
is offline during a burst, collapsing discards the queued messages and delivers only
the last. A worker counting its own tray would report "1 change" when six occurred —
wrong precisely when the user was away and the summary mattered most.

**Hence the watermark, with the count derived rather than accumulated.**
`list_members.last_seen_at` records when the member last actually looked at the list;
the count is computed at send time from `list_items`. This is self-correcting:
dropped pushes, retries, and duplicate sends cannot cause drift, because the watermark
does not move until the member opens the list. Miss five notifications and the sixth
still reports six.

**The watermark resets through an explicit endpoint.** `POST /lists/{id}/seen`, called
only when `document.visibilityState === 'visible'`, rather than as a side effect of
`GET /lists/{id}/items`. The poll already skips hidden tabs, so hanging the reset off
the GET would work today — but it would make notification correctness depend on a
one-line guard in an unrelated hook, where a future refactor could remove it with
every test still passing. It also keeps a write out of a GET, which matters because
the offline queue retries requests.

**A server-side cooldown was rejected as premature.** It solves burst suppression with
a migration and a set of concurrency edge cases, to achieve what tag-collapse plus a
derived count already deliver. It remains available as a later layer if real usage
shows it is needed; it composes on top of this design without rework.

## Consequences

- **Accepted:** One FCM call per qualifying write. At this app's scale that is
  negligible, but it does scale with write volume rather than with burst count.
- **Accepted:** Delivery is best-effort. Web Push has no read receipts; we can know
  what FCM accepted, never what the user saw.
- **Accepted:** The tray count resets if the user dismisses the notification without
  opening the list. This is judged correct behaviour — dismissal is an acknowledgement.
- **Accepted:** `list_items.purchased_by` is added so the count can exclude the
  recipient's own purchases. Existing rows backfill to `NULL`.
- **Gained:** No new infrastructure, no scheduler, no queue, no server-side timers —
  and therefore nothing that scale-to-zero can break.
- **Gained:** Lowest achievable delivery latency, which is what the primary scenario
  is worth.
- **Watch:** Reach is uneven and not under our control. iOS delivers push only to a
  home-screen-installed PWA, and permission is per-origin, granted once, denied
  permanently. Activation is therefore gated on demonstrated sharing intent rather
  than shown to every user — a denial forecloses every list the user will ever join.
- **Watch:** This does not supersede [ADR-001](001-short-polling-for-list-sync.md).
  Polling remains the mechanism for an open app; push reaches a closed one. If push
  were ever treated as a sync mechanism, users on iOS Safari without an installed PWA
  would silently receive nothing.
