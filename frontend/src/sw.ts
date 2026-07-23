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
// request URLs. That module can't be imported here: it is typechecked against
// the DOM lib, the worker against WebWorker.
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

// All backend calls go to the network. Offline behaviour is handled in-app by
// the IndexedDB write queue and localStorage read cache, not by the worker.
registerRoute(new RegExp(`^${escapeRegex(BACKEND_URL)}/`), new NetworkOnly())

// registerType: 'autoUpdate' expects the worker to activate immediately.
self.skipWaiting()
clientsClaim()
