import { useEffect, useState } from 'react'

/**
 * The instantaneous read, for a guard at the moment of a tap.
 *
 * `useIsOffline` is one render behind at worst — a control can be pressed
 * between the `offline` event and React re-rendering it as disabled — so a
 * handler that guards on the hook's state is not actually a second line of
 * defence. This is. Same question, same authority, read at the instant it is
 * asked rather than at the last paint.
 *
 * Note what neither of them can tell you: `navigator.onLine` is `true` on a
 * captive portal and in an aisle where the wifi is associated with no route,
 * so a write can still be attempted and still fail. That write is lost, by
 * decision — see the offline-queue removal spec.
 */
export function isOfflineNow(): boolean {
  return !navigator.onLine
}

export function useIsOffline() {
  const [isOffline, setIsOffline] = useState(isOfflineNow())

  useEffect(() => {
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return { isOffline }
}
