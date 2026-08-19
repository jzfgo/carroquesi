import { useRef } from 'react'

/**
 * Collects the touched element and its ancestors up to and including the
 * sheet panel. Whichever of them is scrolled down owns the gesture: a
 * downward drag there is a scroll, not a dismiss.
 */
function ancestorChain(
  target: EventTarget | null,
  boundary: HTMLElement,
): HTMLElement[] {
  const chain: HTMLElement[] = []
  let el = target instanceof HTMLElement ? target : null
  while (el) {
    chain.push(el)
    if (el === boundary) break
    el = el.parentElement
  }
  return chain
}

/**
 * Attaches swipe-down-to-dismiss touch handling to a sheet element.
 * Spread the returned handlers onto the surface a drag may start from —
 * the whole sheet panel. The sheet element (sheetRef) translates as the
 * user drags and snaps back or closes.
 *
 * A drag over scrollable content captures the sheet only while that
 * content sits at its top; otherwise the finger keeps scrolling, and the
 * drag re-anchors so a dismiss can still begin the moment the content
 * reaches its top mid-gesture.
 */
export function useSwipeToDismiss(
  sheetRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  threshold = 80,
) {
  const startY = useRef<number | null>(null)
  const dragging = useRef(false)
  const scrollers = useRef<HTMLElement[]>([])

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY
    dragging.current = false
    scrollers.current = sheetRef.current
      ? ancestorChain(e.target, sheetRef.current)
      : []
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || !sheetRef.current) return
    const dy = e.touches[0].clientY - startY.current
    if (!dragging.current) {
      if (dy <= 0) return
      if (scrollers.current.some((el) => el.scrollTop > 0)) {
        // The finger is scrolling inner content. Re-anchor so a dismiss
        // measures from wherever the content reaches its top, not from the
        // original touch point.
        startY.current = e.touches[0].clientY
        return
      }
      dragging.current = true
      sheetRef.current.style.transition = 'none'
    }
    sheetRef.current.style.transform = `translateY(${Math.max(dy, 0)}px)`
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startY.current === null || !sheetRef.current) return
    const dy = e.changedTouches[0].clientY - startY.current
    const wasDragging = dragging.current
    startY.current = null
    dragging.current = false
    if (!wasDragging) return
    if (dy > threshold) {
      sheetRef.current.style.transition = ''
      onClose()
    } else {
      // Ride back up instead of snapping — the same spring the sheet enters on.
      sheetRef.current.style.transition =
        'transform var(--dur-slow) var(--ease-spring)'
      sheetRef.current.style.transform = ''
    }
  }

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  }
}
