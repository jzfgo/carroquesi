import { useRef, useState } from 'react'

/**
 * Horizontal swipe-to-dismiss for a single list row (handoff 20b). Unlike
 * `useSwipeToDismiss` — a vertical *sheet* dismiss shared by the bottom sheets —
 * this one lives inside a vertical scroll list, so it must decide, on the first
 * real move, whether the finger is scrolling the list or swiping the row away
 * and never both. That one-time decision is the axis lock.
 *
 * Spread `handlers` onto the row and `style` onto the same element. `dismissing`
 * is true once a past-threshold release has committed, so the caller can mark
 * the row `aria-hidden` while it slides out.
 */
export function useSwipeToDismissRow(onDismiss: () => void) {
  // Idle stays out of the transition path so a resting row carries no inline
  // transform at all; dragging suppresses the CSS transition for 1:1 finger
  // tracking; dismissing hands the slide-out back to the CSS transition.
  const [phase, setPhase] = useState<'idle' | 'dragging' | 'dismissing'>('idle')
  // deltaX lives in a ref so a `pointerup` can read the just-dragged distance
  // synchronously — three pointer events in one tick would otherwise see the
  // stale render value. State mirrors it purely to drive the transform.
  const [deltaX, setDeltaXState] = useState(0)
  const deltaXRef = useRef(0)
  const setDeltaX = (v: number) => {
    deltaXRef.current = v
    setDeltaXState(v)
  }

  const startX = useRef(0)
  const startY = useRef(0)
  // null = not yet decided; the first move past the deadzone locks it.
  const axis = useRef<null | 'horizontal' | 'vertical'>(null)
  // Row width feeds the release threshold (read in the pointerup handler, hence
  // a ref) and the drag opacity (read in render, hence mirrored to state).
  const widthRef = useRef(0)
  const [width, setWidth] = useState(0)
  const activePointer = useRef<number | null>(null)
  // Set the moment a horizontal drag begins; read by the click guard so a
  // finished swipe never lands as an accept tap on the same row.
  const moved = useRef(false)

  const reset = () => {
    axis.current = null
    activePointer.current = null
    setDeltaX(0)
    setPhase('idle')
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase === 'dismissing') return
    activePointer.current = e.pointerId
    startX.current = e.clientX
    startY.current = e.clientY
    axis.current = null
    moved.current = false
    // offsetWidth is 0 in jsdom; fall back so the threshold stays meaningful.
    const w = e.currentTarget.getBoundingClientRect?.().width || 0
    widthRef.current = w
    setWidth(w)
    setDeltaX(0)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current

    if (axis.current === null) {
      // Wait past a small deadzone before committing to a direction, so a
      // straight-down scroll never registers as a stray horizontal nudge.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
      if (axis.current === 'horizontal') {
        moved.current = true
        setPhase('dragging')
        // Own the gesture: keep the browser from turning it into a scroll.
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
    }

    if (axis.current === 'horizontal') setDeltaX(dx)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    if (axis.current !== 'horizontal') {
      reset()
      return
    }
    // 40% of the row, capped at 96px so a wide row still commits at a
    // comfortable throw; the jsdom-safe fallback keeps the test's 96 stable.
    const threshold =
      widthRef.current > 0 ? Math.min(widthRef.current * 0.4, 96) : 96
    if (Math.abs(deltaXRef.current) >= threshold) {
      activePointer.current = null
      setPhase('dismissing')
    } else {
      reset()
    }
  }

  // The slide-out finished (or was skipped under reduced motion, where the CSS
  // transition is 0ms and this fires on the next tick): commit the dismissal.
  const onTransitionEnd = () => {
    if (phase === 'dismissing') onDismiss()
  }

  // A swipe that just released still produces a synthetic click on the row;
  // swallow it in the capture phase so it never reaches the accept buttons.
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current) {
      e.stopPropagation()
      e.preventDefault()
      moved.current = false
    }
  }

  const opacity =
    phase === 'dragging' && width > 0
      ? Math.max(0, 1 - Math.abs(deltaX) / width)
      : undefined

  const style: React.CSSProperties =
    phase === 'dragging'
      ? {
          transform: `translateX(${deltaX}px)`,
          opacity,
          transition: 'none',
          touchAction: 'pan-y',
        }
      : phase === 'dismissing'
        ? {
            transform: `translateX(${deltaX < 0 ? '-' : ''}100%)`,
            opacity: 0,
          }
        : { touchAction: 'pan-y' }

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
      onTransitionEnd,
      onClickCapture,
    },
    style,
    dismissing: phase === 'dismissing',
  }
}
