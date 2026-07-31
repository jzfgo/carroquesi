import { useCallback, useRef, useState } from 'react'
import type { ToastAction } from '../components/Toast'

export interface ToastState {
  /**
   * Which showing this is, not what it says. `Toast` keys its window on the
   * message, so two notices carrying the same words — a flapping connection
   * failing the same way twice — would look like one notice that never left:
   * the second would inherit whatever was left of the first one's seconds and
   * a bar already half drained. Used as the element's `key`, so each showing
   * is a new one and starts its own window.
   */
  id: number
  message: string
  action?: ToastAction
}

export type ShowToast = (message: string, action?: ToastAction) => void

/**
 * The toast's state, in one place.
 *
 * Three screens owned a copy of it, and one of them also owned a second
 * dismiss timer beside the one inside `Toast`. That was harmless while every
 * notice lasted three seconds and stopped being harmless the moment a notice
 * carrying an action started lasting longer: the outer timer cut the window
 * short. The countdown belongs to the component that draws the bar.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const shown = useRef(0)

  const showToast = useCallback<ShowToast>(
    (message, action) => setToast({ id: ++shown.current, message, action }),
    [],
  )
  const dismissToast = useCallback(() => setToast(null), [])

  return { toast, showToast, dismissToast }
}
