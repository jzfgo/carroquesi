import { X } from 'lucide-react'
import { useEffect } from 'react'
import './PurchaseToast.css'

const AUTO_DISMISS_MS = 6000

interface Props {
  itemName: string
  onDismiss: () => void
}

export default function PurchaseToast({ itemName, onDismiss }: Props) {
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
        <div className="pt__text">Compraste <strong>{itemName}</strong></div>
        <button className="pt__dismiss" onClick={onDismiss} aria-label="Cerrar"><X size={16} /></button>
      </div>
    </div>
  )
}
