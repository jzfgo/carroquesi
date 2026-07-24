import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Routes the app when the service worker reports a notification tap.
 *
 * The worker posts {type:'NAVIGATE', url} rather than calling client.navigate(),
 * which would force a full page reload and lose in-memory state.
 *
 * Mounted app-wide, not on the list screen: a tap can arrive while the user is
 * on the dashboard, an invite page, or a different list, and the listener has to
 * exist wherever they happen to be. Scoping it to ListScreen would silently drop
 * every tap made from anywhere else.
 */
export function usePushNavigation() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!navigator.serviceWorker) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined
      if (data?.type === 'NAVIGATE' && data.url) navigate(data.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () =>
      navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}
