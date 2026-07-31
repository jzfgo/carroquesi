import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './Toast.css'

/** The three system colours. Each names the kind of answer, not the message. */
export type ToastTone = 'verde' | 'tomate' | 'miel'

export interface ToastAction {
  label: string
  /**
   * The colour lives only in the draining bar, and the bar is the time this
   * action has left — so the tone belongs to the action rather than sitting
   * beside it as a second prop somebody has to keep in step.
   */
  tone: ToastTone
  onAct: () => void
}

const AUTO_DISMISS_MS = 3000
/** Three seconds is long enough to read and short for a decision. */
const ACTION_DISMISS_MS = 6000

interface Props {
  message: string
  /** Undo is just the action whose label is «Deshacer». */
  action?: ToastAction
  onDismiss: () => void
}

export function Toast({ message, action, onDismiss }: Props) {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  const windowMs = action ? ACTION_DISMISS_MS : AUTO_DISMISS_MS

  // Reaching for a control that vanishes under the finger is worse than having
  // no control, and someone tabbing to it is slower than someone tapping it.
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (held) return
    const timer = setTimeout(() => onDismissRef.current(), windowMs)
    return () => clearTimeout(timer)
  }, [message, windowMs, held])

  return (
    <div
      className={`toast toast--${action?.tone ?? 'verde'}`}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="toast__progress">
        <div
          key={message}
          className="toast__progress-fill"
          // One number, one place. The bar is the window, so it drains from
          // the same constant the timer counts — two encodings of one duration
          // drift apart, and no screenshot would show it.
          style={{ animationDuration: `${windowMs}ms` }}
        />
      </div>
      <div className="toast__body">
        {/* The message is the live region and nothing else is. role="alert" is
            assertive and cannot hold a control anyone can reliably reach, so
            the action and the close button are siblings outside it. */}
        <div className="toast__text" role="status">
          {message}
        </div>
        {action && (
          <button
            className="toast__cta"
            // Each notice carries the control that closes it, so taking the
            // action is what closes it. Leaving it up would also leave it on
            // top of whatever the action just opened.
            onClick={() => {
              action.onAct()
              onDismiss()
            }}
          >
            {action.label}
          </button>
        )}
        <button
          className="toast__dismiss"
          onClick={onDismiss}
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
