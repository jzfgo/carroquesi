import { Cloud, CloudOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useIsOffline } from '../hooks/useIsOffline'
import './OfflineBand.css'
import { AUTO_DISMISS_MS } from './Toast'

/**
 * What this device's connection is doing, said once for the whole app.
 *
 * It sits above the router, outside every screen's chrome, so there is exactly
 * one of these no matter what is on screen or what sheet is over it. That is
 * the point: the condition belongs to the device, not to the list, not to the
 * close sheet and not to the dashboard — each of which used to say it
 * separately, in its own words, and only while it happened to be visible.
 *
 * Being the one statement is what lets every refused write stay silent. A
 * guard that says nothing is only honest while this is on screen, so nothing
 * here may be conditional on a route, a scroll position or a sheet.
 */
export function OfflineBand() {
  const { isOffline } = useIsOffline()
  // A counter, not a boolean: a second `online` with no `offline` between
  // them (a wifi→cellular handover) has to restart the window rather than
  // inherit what is left of the first one's, and setting `true` over `true`
  // bails out of the render so the timer effect never re-runs.
  const [restoreCount, setRestoreCount] = useState(0)

  useEffect(() => {
    // The *event*, not the value. `online` fires on a transition, so opening
    // the app with a connection cannot be mistaken for having just regained
    // one — which is what «De nuevo en línea» claims. Reading the value here
    // instead would need the previous one remembered, and would congratulate
    // the app on every cold start.
    const onOnline = () => setRestoreCount((n) => n + 1)
    // Cleared on the way out, so a second reconnection starts its own window
    // rather than inheriting what was left of the first one's. Without this,
    // `setRestored(true)` on an already-true state bails out of the render and
    // the timer effect never re-runs.
    const onOffline = () => setRestoreCount(0)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (restoreCount === 0) return
    // The one transient state. The offline half reports a *condition* and
    // stays while it holds; this half reports a *change*, and a change is over
    // once it has been read. Same window as a bare toast, from the same
    // constant — the app should not hold two ideas about how long a sentence
    // takes to read.
    const timer = setTimeout(() => setRestoreCount(0), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [restoreCount])

  // The live condition wins over the announcement of a change to it: losing
  // the signal again mid-window must say so, not keep congratulating.
  const band = isOffline ? 'offline' : restoreCount > 0 ? 'restored' : 'hidden'
  if (band === 'hidden') return null

  const offline = band === 'offline'

  return (
    <div className={`offline-band offline-band--${band}`} role="status">
      {offline ? (
        <CloudOff size={14} strokeWidth={1.8} aria-hidden />
      ) : (
        <Cloud size={14} strokeWidth={1.8} aria-hidden />
      )}
      <span>{offline ? 'Sin conexión' : 'De nuevo en línea'}</span>
    </div>
  )
}
