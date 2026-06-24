import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import './Toast.css'

const AUTO_DISMISS_MS = 3000

interface Props {
  message: string
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: Props) {
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const timer = setTimeout(() => onDismissRef.current(), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <div className="toast" role="alert">
      <div className="toast__progress">
        <div className="toast__progress-fill" />
      </div>
      <div className="toast__body">
        <div className="toast__text">{message}</div>
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
