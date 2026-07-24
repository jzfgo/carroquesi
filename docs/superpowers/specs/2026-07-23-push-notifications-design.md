# Push Notifications — Design Spec

**Date:** 2026-07-23
**Status:** Approved
**Linear:** JAV-9

## Overview

Notify list members out-of-app when someone adds an item or marks one purchased.
Delivered as Web Push via Firebase Cloud Messaging, gated behind the
`push_notifications` feature flag.

Push complements the 5s short-poll of [ADR-001](../../decisions/001-short-polling-for-list-sync.md);
it does not replace it. Polling keeps an open app fresh, push reaches a closed one.

Two ADRs record the tradeoffs:
[ADR-009](../../decisions/009-single-service-worker.md) (service worker strategy)
and [ADR-010](../../decisions/010-web-push-via-fcm.md) (transport and coalescing).

## Goals

- A member shopping with the app closed learns within seconds that someone added an item.
- A member learns that a co-shopper already bought something, avoiding duplicate purchases.
- Bursts of activity produce one notification per list, not one per write.

## Out of Scope

- Per-list muting, quiet hours, digest scheduling
- Notifications for invites, renames, deletions, or price edits
- Native apps; this is Web Push only

---

## 1. Reach and Platform Constraints

| Platform | Push available |
|---|---|
| Android Chrome | Yes, in-browser |
| Desktop Chrome / Firefox / Safari | Yes, in-browser |
| **iOS Safari** | **Only for a home-screen-installed PWA (16.4+)** |

Two consequences drive the design:

- **Permission is per-origin and permanent.** One grant covers every list the user
  will ever join. One denial forecloses all of them until the user changes OS settings.
- **iOS offers exactly one prompt.** `Notification.requestPermission()` must come from
  a user gesture, inside the installed app.

Where push cannot work (iOS, not standalone), the settings toggle is replaced by
install guidance reusing `InstallBanner` copy. Where the browser has no support at
all, the toggle is hidden.

---

## 2. Service Worker

`strategies` changes from `generateSW` to `injectManifest`; a single `src/sw.ts`
handles both precaching and push. Rationale and rejected alternatives:
[ADR-009](../../decisions/009-single-service-worker.md).

### Parity requirements

`src/sw.ts` must reproduce every behaviour the generated worker has today,
verified against a build of `main`:

| Behaviour | Required |
|---|---|
| `precacheAndRoute(self.__WB_MANIFEST)` | Yes — 10 entries |
| `cleanupOutdatedCaches()` | Yes |
| `self.skipWaiting()` | Yes (`registerType: 'autoUpdate'`) |
| `clientsClaim()` | Yes |
| `registerRoute(<BACKEND_URL>, NetworkOnly)` | Yes |
| `NavigationRoute` / SPA fallback | No — `navigateFallback` stays `null` |

**`globPatterns` must be set explicitly.** `generateSW` defaults to
`**/*.{js,css,html,ico,png,svg}`; `injectManifest` defaults to the narrower
`**/*.{js,css,html}`. Migrating without an override silently drops all five PWA
icons and `manifest.webmanifest` from the precache, with no build error and no
failing test.

The current precache manifest, which the migration must preserve in full:

```
index.html
registerSW.js
manifest.webmanifest
assets/index-<hash>.js
assets/index-<hash>.css
pwa-64x64.png
pwa-192x192.png
pwa-512x512.png
maskable-icon-512x512.png
monochrome.svg
```

Service worker types require `"lib": ["WebWorker"]`, which conflicts with `"DOM"`.
Use a dedicated `tsconfig.worker.json` per the vite-plugin-pwa guidance.

CLAUDE.md's PWA section currently states `sw.js` is Workbox-generated and must not
be edited manually. That must be updated, or it will point contributors at the
wrong file.

---

## 3. Data Model

### New table: `push_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | str | uuid pk |
| `user_id` | str | FK `users.id` |
| `token` | str | unique |
| `created_at` | datetime | naive UTC |
| `last_registered_at` | datetime | refreshed each time the device re-registers |

Named `last_registered_at`, not `last_seen_at`, to avoid collision with the
`list_members.last_seen_at` watermark below — the two mean entirely different things.

There is no notification-preference column. **Token presence is the on/off state**,
scoped per device, which matches user expectation and removes a field to keep in sync.

### New column: `list_members.last_seen_at`

`datetime | null`. The watermark for "changes since this member last looked".
`NULL` is resolved with `COALESCE(last_seen_at, list_members.created_at)`, so a new
member's count starts when they joined — no backfill migration, no NULL branch in code.

### New column: `list_items.purchased_by`

`str | null`, FK `users.id`. Set alongside `purchased_at` on the `NULL → set`
transition. Lets the unseen count exclude the recipient's own purchases exactly,
and is useful history in its own right. Existing rows backfill to `NULL`, which is
honest — the information was never recorded — and they all predate any watermark.

---

## 4. API

New router `backend/app/routers/notifications.py`, schemas in
`backend/app/schemas/notifications.py`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/notifications/tokens` | Upsert this device's token; refresh `last_registered_at` |
| `DELETE` | `/notifications/tokens` | Unregister this device's token — the "off" switch |
| `POST` | `/lists/{list_id}/seen` | Reset the caller's watermark for this list |

`POST /lists/{list_id}/seen` is a deliberate, explicit endpoint rather than a side
effect of `GET /lists/{id}/items`. Hanging the watermark off the GET would make
notification correctness depend on the `visibilityState === 'hidden'` guard in
`useListItems.ts` — an implicit cross-module invariant that a future refactor could
remove with every test still green. It also keeps a write out of a GET, which
matters because the offline queue retries requests.

---

## 5. Send Path

`backend/app/services/push.py`:

```python
def notify_list_change(session, lst, actor, event, item_name) -> None
```

Called **synchronously inside the request handler**. This is safe and preferable:

- Cloud Run runs with no `--min-instances`, so it scales to zero and throttles CPU
  between requests. FastAPI `BackgroundTasks` execute after the response is sent —
  precisely when CPU is withdrawn — making deferred sends non-deterministic in
  production while working perfectly in local development.
- `useListItems.ts` adds items optimistically with a `tmp-` placeholder, so POST
  latency is not user-visible.

Recipients are all `list_members` **except the actor, excluded by `user_id`** so the
actor's other devices stay quiet.

**Delivery is one multicast per recipient *user*, not one for the whole list.**
`unseen_count` is computed per recipient from that member's own watermark — Bob may be
three changes behind while Carol is five — and `send_each_for_multicast` transmits a
single identical payload to every token it is given. Recipients therefore cannot share
one call. The send groups tokens by `user_id`, computes that user's count once, and
issues one multicast per user; a user's own devices legitimately share a count and a
call. Token lists are batched at 500 per call.

The entire send is wrapped in try/except with a **total timeout budget across all
recipients**, not a per-call timeout. A push failure must never fail a grocery-list
write, and N recipients must not mean N sequential round-trips holding a threadpool
worker — a five-member list would otherwise add roughly a second to every item add.
Sends run concurrently within that budget.

### Triggers

| Event | Notifies |
|---|---|
| `add_item` | Yes |
| `update_item`, `purchased_at` `NULL → set` | Yes |
| `update_item`, un-purchasing | No — correcting a mistake shouldn't buzz phones |
| Rename, quantity, brand, store, price edits | No |
| `delete_item` | No |
| `apply_receipt_prices` | No — writes `purchased_quantity` and prices only, never `purchased_at` |

Siri-added items flow through `POST /lists/{id}/items` via `MemberOrDefaultDep`, so
they trigger notifications with no extra work.

### Unseen count

```sql
SELECT count(*) FROM list_items
WHERE list_id = :list
  AND ( (created_at   > :watermark AND added_by     != :recipient)
     OR (purchased_at > :watermark AND purchased_by != :recipient) )
```

Derived, never accumulated. Dropped pushes, retries, and duplicate sends cannot cause
drift — miss five notifications and the sixth still reports the true total, because
the watermark never moved. It counts only the two events we notify on, so a receipt
scan touching a dozen `updated_at` values does not inflate it.

---

## 6. Payload and Copy

Messages are **data-only**. An FCM `notification` block is auto-displayed by the SDK,
which would bypass our handler and make merged copy impossible. Data-only hands
display to `src/sw.ts`, which always calls `showNotification` — satisfying Safari's
prohibition on silent push.

```json
{ "list_id": "...", "list_name": "🏠 Casa", "actor_name": "Ana",
  "event": "added", "item_name": "leche", "unseen_count": 3 }
```

Copy is Spanish, matching the existing UI. **Title is always the list name** — with
several shared lists, "which list" is the first thing the user needs.

| `unseen_count` | Title | Body |
|---|---|---|
| 1 | 🏠 Casa | Ana añadió leche |
| 2 | 🏠 Casa | Ana añadió leche y 1 cambio más |
| 3+ | 🏠 Casa | 6 cambios en tu lista |

`event: "purchased"` uses `compró` in place of `añadió`.

### Coalescing

`tag: "list-{list_id}"`. Per the Notifications API, a notification replacing one with
the same tag does so **without sound or vibration**. So a burst produces one alert and
then silent updates to the same tray entry. `renotify` is never set — the quiet
behaviour is the spec default, which avoids depending on a flag with uneven support.

Notifications from different lists stay separate, each with its own tag, title, count,
and tap target. Merging them would lose which list changed and break routing.

### Tap handling

`data.url = "/lists/{list_id}"`. In `notificationclick`:

1. `event.notification.close()`
2. `clients.matchAll({ type: 'window', includeUncontrolled: true })`
3. Window exists → `client.focus()`, then `postMessage({ type: 'NAVIGATE', url })`.
   The app listens and calls React Router's `navigate()`, giving an in-app transition
   rather than the full reload `client.navigate()` would cause.
4. No window → `clients.openWindow(url)`

### Clearing

When a list becomes visible, the app fires `POST /lists/{id}/seen` and clears that
list's tray entries:

```ts
const notes = await registration.getNotifications({ tag: `list-${id}` })
notes.forEach((n) => n.close())
```

One "I am looking at this now" action resets the watermark and clears the tray
together. Arriving via a notification tap therefore clears the notification that
brought you.

---

## 7. Activation

`Notification.requestPermission()` is only called from a user gesture, after priming.
Because a denial is origin-wide and permanent, we never ask a user who has shown no
interest in collaborating — a solo shopper who declines has foreclosed notifications
for every list they later join.

**Priming triggers** — a one-time dismissible card, shown when the flag is on, push is
supported in this context, and `Notification.permission === 'default'`:

- the user **creates an invite** — owner side; the list is still solo, but intent is
  proven and the value is concrete. This subscribes the owner *before* the second
  member's first item, closing the gap a member-count gate would leave.
- the user **accepts an invite** — invitee side, who never passes through the invite flow
- a list **gains a member** — backstop for anyone who dismissed earlier

Dismissal persists, following the existing `frontend/src/lib/dismissedSuggestions.ts`
idiom. The settings toggle exists permanently and independently.

**Mobile path:** the list screen has a sticky Smart Input bar pinned to the bottom.
The priming card belongs in the scroll flow near the top of the list, not floating,
and must respect `env(safe-area-inset-*)`.

On grant: `getToken({ vapidKey, serviceWorkerRegistration })` → `POST /notifications/tokens`.

**App Check checkpoint:** `firebase.ts` initialises App Check with reCAPTCHA v3 in
production. FCM `getToken` requires a valid App Check token, so registration failures
in production that do not reproduce locally should be investigated there first.
`VITE_FIREBASE_VAPID_KEY` is exposed through `frontend/src/lib/environment.ts`, per
the project convention of never reading `import.meta.env` directly.

---

## 8. Feature Flag

`FlagDef("push_notifications", default=True)` in
`backend/app/services/feature_flags.py`, plus a constant in
`frontend/src/lib/featureFlags.ts` and seed data in `scripts/seed.py`.

Note what `default=True` makes this: **a kill switch, not a rollout gate.**
`is_enabled` supports only per-user overrides via `user_features`, so disabling it for
everyone requires a deploy rather than a database change. Acceptable for a
UI-only blast radius, but it is the inverse of how `ai_receipt_scanning` behaves.

---

## 9. Failure Space

### Multiple users and devices

- Actor excluded **by `user_id`, never by token** — otherwise your laptop buzzes about
  what you just typed on your phone.
- One user with N devices: all tokens receive the same payload in one multicast;
  `unseen_count` is per-user, so every device agrees.
- **Never multicast across users.** Counts differ per recipient, and a shared call
  would broadcast one user's count to everyone.
- `send_each_for_multicast` caps at 500 tokens per call; batch beyond that.

### State changing between calls

- **Token rotation** — FCM rotates tokens silently. Call `getToken` on every app start
  and upsert; the unique constraint makes it idempotent. Stale tokens are pruned when
  FCM reports `UNREGISTERED` / `404` / `410`.
- **Permission revoked after grant** — check `Notification.permission` on load; if it
  is `denied` while a token is held, delete the token.
- **Membership changes mid-send** — recipients are read after the write in the same
  session. A member removed microseconds later may get one stray notification.
  Accepted; not worth a lock.
- **Naive UTC** — the codebase stores `datetime.now(UTC).replace(tzinfo=None)`. The
  watermark must follow that convention exactly or comparisons silently misbehave.

### Zero and many

- **Solo list, or no recipient holds a token** → return before touching FCM. No API
  call, no latency. Explicitly tested.
- **Offline-queue replay** is this app's signature burst: an hour offline with eight
  queued adds replays as eight rapid POSTs. Tag-collapse absorbs the tray; the derived
  count stays accurate.
- **Rapid purchase toggling** — only `NULL → set` notifies, so un-purchasing is silent.
  Toggling twice sends twice; collapse absorbs it.
- **Many lists** — a user in several shared lists sees one tray entry per list.

### Platform and lifecycle

- FCM failure never fails a write; explicit timeout prevents threadpool starvation.
- Tests never touch the network: the send service is injectable and no-ops when
  Firebase credentials are absent, keeping the SQLite suite and `DEV_AUTH_BYPASS` offline.
- **iOS grants exactly one prompt, ever.** Priming precedes the request; a cold call
  would burn the single attempt on users who were not ready.

### Privacy

- **Delete the device token on sign-out.** Otherwise a shared or handed-down phone
  keeps receiving a previous user's grocery lists.

---

## 10. Testing

### Device spike — before anything else is built

The entire copy-and-coalescing scheme rests on one unverified platform assumption:
that a **data-only** FCM message reliably wakes the service worker's `push` listener on
an **installed iOS PWA**, letting us compose the copy client-side. The pattern is
Safari-compliant on paper, but iOS Web Push is the least
reliable target in this design, and if the assumption is wrong the fallback is
`notification`-payload messages — which lose service-worker composition entirely and
invalidate §6.

So this is validated **first**, with a throwaway spike: send one data-only push to a
real installed iOS PWA and confirm the `push` listener fires and `showNotification`
renders. Not after the token table, endpoints, and triggers exist.

The worker carries **no Firebase SDK** — `getToken({ serviceWorkerRegistration })`
subscribes our own worker to standard Web Push, so data messages arrive as plain
`push` events. See [ADR-009](../../decisions/009-single-service-worker.md).

Deferring this to the §11 rollout step would repeat a known failure pattern: building
the whole pipeline against local behaviour, then discovering at the end that the one
environment that matters behaves differently.

**Backend** (SQLite in-memory, no network):

- actor excluded from recipients
- solo list sends nothing; list where no recipient holds a token sends nothing
- unseen count across both event types, and excluding the recipient's own actions
- `COALESCE` watermark for a member who has never opened the list
- stale token pruned on `UNREGISTERED`
- FCM raising still returns 201 from `POST /lists/{id}/items`
- `POST /lists/{id}/seen` resets only the caller's watermark

**Frontend** (vitest):

- permission states `default` / `granted` / `denied`
- priming card gating: invite created, invite accepted, member joined, dismissed
- iOS standalone vs. in-Safari branch
- `seen` fires only when `visibilityState === 'visible'`
- token deleted on sign-out

**Service worker:**

- copy selection at counts 1 / 2 / 6, for both `added` and `purchased`
- tag replacement collapses to a single tray entry
- `notificationclick` focuses an existing client vs. opening a new window

**Migration guard:**

- before/after diff of the precache manifest asserting all 10 entries survive,
  icons included

## 11. Rollout

1. Merge behind the flag.
2. Verify on a **real installed iOS PWA** and a **real Android device**.
3. Close JAV-9.

Step 2 is not optional. The platform differences are the entire risk surface of this
feature, and a passing local suite is not evidence about either device.
