import { useEffect } from 'react'
import './PurchaseToast.css'

const AUTO_DISMISS_MS = 6000

interface Props {
  itemName: string
  onAddPrice: () => void
  onDismiss: () => void
}

export default function PurchaseToast({ itemName, onAddPrice, onDismiss }: Props) {
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
        <button className="pt__cta" onClick={onAddPrice}>Añadir precio</button>
        <button className="pt__dismiss" onClick={onDismiss}>✕</button>
      </div>
    </div>
  )
}
