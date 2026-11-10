import type { KeyboardEvent, ReactNode } from 'react'
import './QuantityPriceRow.css'

interface Props {
  /** Ties the visible label to the quantity input. */
  id: string
  quantity: string
  priceText: string
  /** '/kg' or '/ud', from the unit the quantity draft derives. */
  suffix: string
  onQuantityChange: (text: string) => void
  onPriceChange: (text: string) => void
  onQuantityBlur?: () => void
  onPriceBlur?: () => void
  pricePlaceholder?: string
  /** The dashed opt-in look of a price that is only a suggestion. */
  suggested?: boolean
  /** What sits under the help text: a suggestion, a line total, a correction. */
  children?: ReactNode
}

// Enter commits a field the way leaving it does.
function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur()
}

/**
 * The «Cantidad y precio» row: a quantity times a price per unit or per
 * kilo. The adjust-product editor and the receipt line detail share it, so
 * both read and type a line the same way. The caller owns the state.
 */
export function QuantityPriceRow({
  id,
  quantity,
  priceText,
  suffix,
  onQuantityChange,
  onPriceChange,
  onQuantityBlur,
  onPriceBlur,
  pricePlaceholder = '0,00',
  suggested = false,
  children,
}: Props) {
  return (
    <div className="qtyprice-field">
      <label className="qtyprice-field__label" htmlFor={id}>
        Cantidad y precio
      </label>
      <div className="qtyprice">
        <input
          id={id}
          className="qtyprice__box qtyprice__qty"
          value={quantity}
          onChange={(e) => onQuantityChange(e.target.value)}
          onBlur={onQuantityBlur}
          onKeyDown={blurOnEnter}
          placeholder="6"
          inputMode="text"
        />
        <span className="qtyprice__x" aria-hidden>
          ×
        </span>
        <div
          className={`qtyprice__box qtyprice__price${
            suggested ? ' qtyprice__price--suggested' : ''
          }`}
        >
          <span className="qtyprice__euro">€</span>
          <input
            className="qtyprice__amount"
            aria-label="Precio"
            value={priceText}
            onChange={(e) => onPriceChange(e.target.value)}
            onBlur={onPriceBlur}
            onKeyDown={blurOnEnter}
            placeholder={pricePlaceholder}
            inputMode="decimal"
          />
          <span className="qtyprice__suffix">{suffix}</span>
        </div>
      </div>
      <p className="qtyprice-help">
        Escribe unidades (<code>6</code>) o peso (<code>500 ml</code>,{' '}
        <code>1,12 kg</code>). El precio se ajusta solo.
      </p>
      {children}
    </div>
  )
}
