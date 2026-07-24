import { useEffect } from 'react'
import { markListSeen } from '../lib/api'

/**
 * Resets the server-side unseen watermark, and clears this list's notifications
 * from the tray, whenever the list is actually on screen.
 *
 * Gated on visibilityState explicitly rather than relying on the poll's own
 * hidden-tab guard in useListItems: keeping the condition here makes it testable
 * and immune to refactors of the poll. Marking a backgrounded tab as "seen"
 * would defeat the entire feature.
 */
export function useListSeen(listId: string, getToken: () => Promise<string>) {
  useEffect(() => {
    const markSeen = () => {
      if (document.visibilityState !== 'visible') return
      void markListSeen(getToken, listId).catch(() => undefined)
      void navigator.serviceWorker?.ready
        .then((reg) => reg.getNotifications({ tag: `list-${listId}` }))
        .then((notes) => notes.forEach((n) => n.close()))
        .catch(() => undefined)
    }

    markSeen()
    document.addEventListener('visibilitychange', markSeen)
    return () => document.removeEventListener('visibilitychange', markSeen)
  }, [listId, getToken])
}
