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
    <div className="pt">
      <div className="pt__progress">
        <div className="pt__progress-fill" />
      </div>
      <div className="pt__body">
        <div className="pt__text">
          {message}
        </div>
        <button className="pt__dismiss" onClick={onDismiss} aria-label="Cerrar">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
