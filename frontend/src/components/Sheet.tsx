import { useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import './Sheet.css'

export interface SheetHandle {
  /** Plays the exit animation, then calls onClose. */
  close: () => void
}

interface Props {
  /** Called once the exit finishes; the parent unmounts the sheet here. */
  onClose: () => void
  /**
   * Overrides what a dismiss gesture (Escape, scrim tap, swipe) does. The
   * sheet stays open and this runs instead of closing — a sub-state sheet
   * passes its "go back" here. Omit to close the sheet.
   */
  onDismiss?: () => void
  /** Accessible name for the dialog. */
  label?: string
  /** id of the element that labels the dialog, as an alternative to label. */
  labelledBy?: string
  /** Extra class for the panel, e.g. the sheet's root class name. */
  className?: string
  ref?: React.Ref<SheetHandle>
  children: React.ReactNode
}

/**
 * Margin added to the measured exit duration before force-closing: a missed
 * transitionend must never wedge a sheet open.
 */
const EXIT_MARGIN_MS = 80

/**
 * Body scroll lock, counted across sheets. Sheets overlap: the exit animation
 * makes closing asynchronous, so a replacement sheet mounts while the old one
 * is still leaving. A per-sheet save-and-restore would capture 'hidden' as the
 * value to put back and leave the body locked after every such handoff. The
 * counter touches the body only on the 0→1 and 1→0 transitions, so unmount
 * order cannot matter.
 */
let scrollLocks = 0
let overflowBeforeLock = ''

function acquireScrollLock() {
  if (scrollLocks === 0) {
    overflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLocks += 1
}

function releaseScrollLock() {
  scrollLocks -= 1
  if (scrollLocks === 0) {
    document.body.style.overflow = overflowBeforeLock
  }
}

/**
 * The exit duration comes from the computed style of the closing panel, so
 * one mechanism serves every environment: normal browsers report --dur-slow,
 * reduced-motion users (whose media query zeroes the transition) and
 * stylesheet-less test DOMs both measure zero and close instantly.
 */
function exitDurationMs(el: HTMLElement): number {
  return getComputedStyle(el)
    .transitionDuration.split(',')
    .reduce((max, part) => {
      const value = parseFloat(part)
      if (Number.isNaN(value)) return max
      return Math.max(max, part.trim().endsWith('ms') ? value : value * 1000)
    }, 0)
}

/**
 * Bottom sheet primitive: portal, scrim, grabber handle, swipe/Escape/scrim
 * dismissal, focus trap, body scroll lock, and the open/close slide.
 *
 * The parent controls presence by mounting and unmounting. The sheet owns
 * the exit: a dismiss plays the slide-down first and only then calls
 * onClose, which is where the parent unmounts it.
 */
export function Sheet({
  onClose,
  onDismiss,
  label,
  labelledBy,
  className,
  ref,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)
  const closedRef = useRef(false)
  const exitTimerRef = useRef<number | null>(null)
  const callbacksRef = useRef({ onClose, onDismiss })
  useEffect(() => {
    callbacksRef.current = { onClose, onDismiss }
  })

  const finishClose = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    callbacksRef.current.onClose()
  }, [])

  const beginClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    const el = panelRef.current
    if (!el) {
      finishClose()
      return
    }
    // Clear swipe-drag leftovers so the exit class drives the transform.
    el.style.transform = ''
    el.style.transition = ''
    el.classList.add('modal-sheet--closing')
    scrimRef.current?.classList.add('modal-sheet-scrim--closing')
    const duration = exitDurationMs(el)
    if (duration <= 0) {
      finishClose()
      return
    }
    el.addEventListener('transitionend', (e) => {
      if (e.target === el) finishClose()
    })
    exitTimerRef.current = window.setTimeout(
      finishClose,
      duration + EXIT_MARGIN_MS,
    )
  }, [finishClose])

  const dismiss = useCallback(() => {
    if (closingRef.current) return
    const { onDismiss: override } = callbacksRef.current
    if (override) override()
    else beginClose()
  }, [beginClose])

  useImperativeHandle(ref, () => ({ close: beginClose }), [beginClose])

  const swipe = useSwipeToDismiss(panelRef, dismiss)
  useFocusTrap(panelRef)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dismiss])

  useEffect(() => {
    acquireScrollLock()
    return releaseScrollLock
  }, [])

  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
      }
    },
    [],
  )

  return createPortal(
    <>
      <div className="modal-sheet-scrim" onClick={dismiss} ref={scrimRef} />
      <div
        className={`modal-sheet${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={panelRef}
        {...swipe}
      >
        <div className="modal-sheet__grip">
          <div className="modal-sheet__handle" />
        </div>
        {children}
      </div>
    </>,
    document.body,
  )
}
