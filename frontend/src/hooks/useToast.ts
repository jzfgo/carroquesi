import { useCallback, useState } from 'react'
import type { ToastAction } from '../components/Toast'

export interface ToastState {
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

  const showToast = useCallback<ShowToast>(
    (message, action) => setToast({ message, action }),
    [],
  )
  const dismissToast = useCallback(() => setToast(null), [])

  return { toast, showToast, dismissToast }
}
