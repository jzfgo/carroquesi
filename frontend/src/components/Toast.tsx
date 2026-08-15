import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import './Toast.css'

const AUTO_DISMISS_MS = 3000

interface Props {
  message: string
  /** Emphasised tail of the message, e.g. the name of the item just added. */
  strong?: string
  /** Single optional CTA, rendered between the text and the dismiss cross. */
  action?: { label: string; onClick: () => void }
  onDismiss: () => void
}

export function Toast({ message, strong, action, onDismiss }: Props) {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  const resetKey = strong ? `${message} ${strong}` : message
  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [resetKey])

  return (
    <div className="toast" role="alert">
      <div className="toast__progress">
        <div key={resetKey} className="toast__progress-fill" />
      </div>
      <div className="toast__body">
        <div className="toast__text">
          {message}
          {strong && (
            <>
              {' '}
              <strong>{strong}</strong>
            </>
          )}
        </div>
        {action && (
          <button className="toast__cta" onClick={action.onClick}>
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
