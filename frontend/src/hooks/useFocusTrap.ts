import { useEffect } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab focus inside the element while it is mounted.
 * Focuses the element on mount (give it tabIndex={-1}) and returns focus
 * to the previously focused element on unmount.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const previous = document.activeElement
    el.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !el) return
      const items = el.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      // A content swap can unmount the focused element; focus then falls to
      // <body> and Tab would walk the page behind the trap. Pull it back in.
      if (!(active instanceof HTMLElement) || !el.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [ref])
}
