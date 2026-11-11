import { useState } from 'react'
import './AdjustProductSheet.css'
import { PrimaryButton, SheetBackButton } from './PurchaseSheetParts'

/**
 * The «Nueva tienda» step behind the store pill's «+ otra»: a content swap
 * of the same sheet, never a second sheet.
 */
export function NewStoreStep({
  backLabel,
  onBack,
  onConfirm,
}: {
  /** The sheet the step returns to. */
  backLabel: string
  onBack: () => void
  onConfirm: (store: string) => void
}) {
  const [text, setText] = useState('')
  const confirm = () => {
    const store = text.trim()
    if (store) onConfirm(store)
  }
  return (
    <div className="adjust-sheet__view">
      <SheetBackButton label={backLabel} onClick={onBack} />
      <div className="adjust-sheet__body">
        <label className="adjust-field">
          <span className="psheet-label adjust-field__label">Tienda</span>
          <input
            className="adjust-field__box"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm()
            }}
            placeholder="Nombre de la tienda"
            autoFocus
          />
        </label>
      </div>
      <div className="adjust-sheet__footer">
        <PrimaryButton onClick={confirm} disabled={text.trim() === ''}>
          Usar esta tienda
        </PrimaryButton>
      </div>
    </div>
  )
}
