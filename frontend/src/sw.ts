/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | PrecacheEntry)[]
}

// Kept in sync with src/lib/environment.ts, which the app itself uses to build
// request URLs. Duplicated rather than imported: environment.ts happens to be
// DOM-free today, but it is the natural home for a future DOM-dependent
// constant, and importing it here would pin the whole module to the WebWorker
// lib forever. One duplicated string is the cheaper constraint.
const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'
).replace(/\/$/, '')

// An unescaped URL inside a RegExp turns dots into wildcards.
function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Injected by vite-plugin-pwa at build time.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Carried over from the generateSW config for parity, but note it is INERT: a
// request matching no route already falls through to the network, and
// registerRoute defaults to GET, so backend writes were never covered anyway.
// Deleting it would change nothing today. It is kept as the anchor that keeps
// that true — if a catch handler or offline fallback is ever added, an
// unmatched backend call would otherwise start being swallowed by it.
// Offline behaviour is handled in-app by the IndexedDB write queue and
// localStorage read cache, not by the worker.
registerRoute(new RegExp(`^${escapeRegex(BACKEND_URL)}/`), new NetworkOnly())

// registerType: 'autoUpdate' expects the worker to activate immediately.
self.skipWaiting()
clientsClaim()
