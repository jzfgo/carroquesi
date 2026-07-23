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

## Rationale

**A `public/` worker is invisible to every quality gate in this repo.**
`eslint.config.js` scopes linting to `**/*.{ts,tsx}` and `tsconfig.app.json` includes
only `src`. A service worker in `public/` would be neither linted nor typechecked —
untested code handling notification display, in a file nothing in CI looks at.

**It would also duplicate Firebase.** Files in `public/` are copied verbatim and
cannot import from `node_modules`, so the worker would have to `importScripts()` the
Firebase *compat* build from the gstatic CDN at a hardcoded version. That is a second
copy of Firebase, drifting away from the `firebase` version in `package.json`, updated
by nobody. `injectManifest` lets the worker import `firebase/messaging/sw` from
`node_modules`, version-locked and bundled.

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

**A hand-rolled `push` listener was rejected** as the worst of both worlds: it avoids
the SDK but depends on the undocumented internal shape of FCM's payload envelope.

## Consequences

- **Accepted:** We now own service worker source and its update semantics; behaviour
  that was previously guaranteed by Workbox config is now our responsibility.
- **Accepted:** A dedicated `tsconfig.worker.json` is required, because service worker
  types need `"lib": ["WebWorker"]`, which conflicts with `"DOM"`.
- **Accepted:** The migration touches shipped offline behaviour, so offline paths need
  re-verification rather than assumption.
- **Gained:** One worker, in `src/`, linted and typechecked; Firebase from
  `node_modules`; no CDN compat build; no reload-loop exposure.
- **Watch — the silent failure mode.** `generateSW` defaults `globPatterns` to
  `**/*.{js,css,html,ico,png,svg}`; `injectManifest` defaults to `**/*.{js,css,html}`.
  Migrating without an explicit override drops every PWA icon and
  `manifest.webmanifest` from the precache — with a successful build, passing tests,
  and no error anywhere. Any future change to worker configuration should diff the
  generated precache manifest, not just check that the build succeeds.
