import { X } from 'lucide-react'
import { useEffect } from 'react'
import './Toast.css'

const AUTO_DISMISS_MS = 3000

interface Props {
  message: string
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="toast">
      <div className="toast__progress">
        <div className="toast__progress-fill" />
      </div>
      <div className="toast__body">
        <div className="toast__text">
          {message}
        </div>
        <button className="toast__dismiss" onClick={onDismiss} aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
