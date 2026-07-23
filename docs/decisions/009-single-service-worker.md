# ADR-009: A single service worker, built from source via injectManifest

**Status:** Accepted
**Date:** 2026-07-23

## Context

The PWA used `vite-plugin-pwa` with `strategies: 'generateSW'`: Workbox generated
`dist/sw.js` from config, and the source tree contained no service worker at all.
That was sufficient while the worker only precached assets and forced backend calls
to `NetworkOnly`.

Web push (see [ADR-010](010-web-push-via-fcm.md)) requires code in a service worker —
to receive background messages, compose notification copy, and handle clicks. With
`generateSW` there is nowhere in the source tree to put it, which forced a choice.

| Approach | Notes |
|---|---|
| **Second worker in `public/`** | Keep `generateSW`; add `firebase-messaging-sw.js` as a static file under FCM's own scope |
| **Single worker via `injectManifest`** | Own `src/sw.ts`; Workbox injects the precache manifest into our source |
| **Raw `push` listener, no FCM SDK in the worker** | Parse the FCM envelope from `event.data.json()` by hand |

## Decision

Switch to `strategies: 'injectManifest'` and maintain a single `src/sw.ts` that
handles precaching, backend routing, and push.

The worker handles push with a **plain `push` event listener and no Firebase SDK at
all**. The FCM SDK is used only in the page, to obtain and register the token.

## Rationale

**A `public/` worker is invisible to every quality gate in this repo.**
`eslint.config.js` scopes linting to `**/*.{ts,tsx}` and `tsconfig.app.json` includes
only `src`. A service worker in `public/` would be neither linted nor typechecked —
untested code handling notification display, in a file nothing in CI looks at.

**It would also duplicate Firebase.** Files in `public/` are copied verbatim and
cannot import from `node_modules`, so the worker would have to `importScripts()` the
Firebase *compat* build from the gstatic CDN at a hardcoded version. That is a second
copy of Firebase, drifting away from the `firebase` version in `package.json`, updated
by nobody. `injectManifest` removes the problem at the root: the worker is bundled from
source, so it can import from `node_modules` — and, as it turns out, needs to import
nothing from Firebase at all.

**Two workers carry a known failure mode with this exact configuration.**
vite-plugin-pwa [issue #777](https://github.com/vite-pwa/vite-plugin-pwa/issues/777)
documents an app reload loop when a second service worker is registered alongside the
plugin's own — triggered by `registerType: 'autoUpdate'`, which this project uses.

**Discovery matters more than it looks.** With `generateSW`, the natural place to look
for worker behaviour is a build artifact that carries a "do not edit" warning. A single
`src/sw.ts` sits where a contributor would expect it.

**The config being replaced is small.** Reproducing it is roughly fifteen lines:
precache the injected manifest, `cleanupOutdatedCaches()`, `skipWaiting()`,
`clientsClaim()`, and one `NetworkOnly` route.

**No Firebase SDK belongs in the worker.** `getToken({ serviceWorkerRegistration })`
creates a `PushSubscription` on that registration, and FCM then delivers over the
standard Web Push protocol — so a data-only message arrives as an ordinary `push`
event whether or not the SDK is present. `onBackgroundMessage` is a convenience wrapper
over exactly that event, not a privileged channel.

Importing `firebase/messaging/sw` into the worker was considered and rejected: it adds
bundle weight and a version coupling to buy an event listener we can write in four
lines. The one real cost of going without is parsing FCM's payload envelope, handled
defensively with `raw.data ?? raw` so both the wrapped and bare shapes work. The SDK
remains the right tool in the *page*, where it manages token lifecycle and rotation.

## Consequences

- **Accepted:** We now own service worker source and its update semantics; behaviour
  that was previously guaranteed by Workbox config is now our responsibility.
- **Accepted:** A dedicated `tsconfig.worker.json` is required, because service worker
  types need `"lib": ["WebWorker"]`, which conflicts with `"DOM"`.
- **Accepted:** The migration touches shipped offline behaviour, so offline paths need
  re-verification rather than assumption.
- **Gained:** One worker, in `src/`, linted and typechecked; Firebase from
  `node_modules`; no CDN compat build; no reload-loop exposure.
- **Watch — diff the precache manifest, and do not "fix" it with `globPatterns`.**
  The PWA icons and `manifest.webmanifest` do *not* come from `globPatterns`. The
  plugin injects them as `additionalManifestEntries`, derived from `manifest.icons`
  and gated on `includeManifestIcons` (default `true`) — and it does this identically
  for both strategies. The icons therefore survive the migration on their own.

  This was verified empirically rather than assumed, after an earlier draft of this
  ADR claimed the opposite. Under `generateSW` with no override, the precache holds
  exactly 10 entries (612 KiB) and *excludes* `assets/mascot-*.png` — which a
  `**/*.png` default would have caught. Adding the "safety" override
  `globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']` takes the precache to
  23 entries (2103 KiB), pulling in `og-image.png`, `favicon.ico`, `maskable.png`,
  `transparent.png`, `apple-touch-icon-180x180.png` and the 228 KB mascot. That is a
  3.4× payload regression dressed as a precaution.

  So: leave `globPatterns` unset, and treat the before/after precache diff as the gate
  for any future worker configuration change. Checking that the build succeeds proves
  nothing here — every variant above builds cleanly.
