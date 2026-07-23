/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'
import { buildNotification, type PushPayload } from './lib/pushCopy'

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

// Data-only messages: FCM wraps the payload, so read `data` when present.
// The three guards below return without displaying anything, which is a
// deliberate exception to the "always show something" rule noted further down —
// worth stating, because it reads like a bug otherwise. We are the only sender,
// and every payload we send carries these fields, so reaching a guard means the
// message is not ours or is malformed, and there is nothing truthful to show.
// The accepted risk is that Safari may eventually drop a subscription that
// repeatedly receives a push and displays nothing. If device testing ever shows
// that happening, the fix is a generic fallback notification here rather than a
// silent return — not removing the guards.
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return
  let payload: PushPayload
  try {
    const raw = event.data.json() as { data?: PushPayload } & PushPayload
    payload = (raw.data ?? raw) as PushPayload
  } catch {
    return
  }
  if (!payload.list_id) return

  const note = buildNotification(payload)
  // Safari forbids silent push: a well-formed push must display something.
  event.waitUntil(
    self.registration.showNotification(note.title, {
      body: note.body,
      // Same tag replaces the existing entry without sound or vibration, so a
      // burst produces one alert and then silent updates. renotify is left
      // unset deliberately: quiet replacement is the spec default.
      tag: note.tag,
      icon: '/pwa-192x192.png',
      badge: '/monochrome.svg',
      data: { url: note.url },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url =
    (event.notification.data as { url?: string } | undefined)?.url ?? '/'

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const existing = all[0] as WindowClient | undefined
      if (existing) {
        await existing.focus()
        // postMessage, not client.navigate(): navigate() forces a full reload,
        // while the app can route in place with React Router.
        existing.postMessage({ type: 'NAVIGATE', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})

// registerType: 'autoUpdate' expects the worker to activate immediately.
self.skipWaiting()
clientsClaim()
