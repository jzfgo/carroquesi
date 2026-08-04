import { Check, ChevronLeft, X } from 'lucide-react'
import { useState } from 'react'
import { formatRowAmount } from '../lib/formatPrice'
import { parseKgFactor, parseQuantityFactor } from '../lib/itemCost'
import './AdjustProductSheet.css'

/** One line of the close draft — the shape 10b holds and 10d edits. */
export interface DraftLine {
  /** The cart item this line stands for; null for a blank «Añadir producto». */
  item_id: string | null
  name: string
  brand: string | null
  quantity: string | null
  price: number | null
  price_per: 'KILOGRAM' | null
  /** Excluded lines («Quitar del carro») are dropped from the close. */
  included: boolean
  /**
   * The last confirmed price for this product at the selected store, if any —
   * the dashed opt-in suggestion. Cleared/ignored once the user prices by hand.
   */
  suggested: { price: number; price_per: 'KILOGRAM' | null } | null
}

interface Props {
  line: DraftLine
  /** Blank mode (from «Añadir producto») — «Quitar» just cancels the add. */
  isNew: boolean
  /** Commit the edited line back to 10b. */
  onDone: (line: DraftLine) => void
  /** Drop the line from the close (and, for an existing item, from the cart). */
  onRemove: () => void
  /** Back-galón — return to the 10b table without committing. */
  onBack: () => void
}

// The `/ud`·`/kg` suffix and price_per are DERIVED from what's typed in the
// quantity — a weight («500 ml», «1,12 kg») prices per kilo, anything else per
// unit. This is the whole point of 10d (rule 10a): no segmented toggle.
function deriveUnit(quantity: string | null): {
  pricePer: 'KILOGRAM' | null
  suffix: string
} {
  const isWeight = !!quantity && parseKgFactor(quantity) !== null
  return {
    pricePer: isWeight ? 'KILOGRAM' : null,
    suffix: isWeight ? '/kg' : '/ud',
  }
}

function parsePrice(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * The adjust-product editor (10d) — rendered as the *content* of a step inside
 * the close sheet, NOT its own `<Sheet>`. Moving between the 10b table and this
 * editor swaps what the one sheet holds; the sheet surface itself never
 * re-presents (the app-wide sheet↔sub-sheet rule). The parent owns the sheet
 * and routes its back gesture here via `onBack`.
 */
export function AdjustProductSheet({
  line,
  isNew,
  onDone,
  onRemove,
  onBack,
}: Props) {
  const [name, setName] = useState(line.name)
  const [brand, setBrand] = useState(line.brand ?? '')
  const [quantity, setQuantity] = useState(line.quantity ?? '')
  const [priceText, setPriceText] = useState(
    line.price != null ? formatRowAmount(line.price) : '',
  )
  // Once the user touches the price (types, confirms or rejects the suggestion)
  // the dashed opt-in yields to a plain field.
  const [priceTouched, setPriceTouched] = useState(line.price != null)

  const { pricePer, suffix } = deriveUnit(quantity)
  const price = parsePrice(priceText)
  const factor = parseQuantityFactor(quantity, pricePer)
  const lineTotal = price != null && factor != null ? price * factor : null

  const showSuggestion =
    line.suggested != null && !priceTouched && priceText === ''

  const commit = () => {
    onDone({
      ...line,
      name: name.trim(),
      brand: brand.trim() || null,
      quantity: quantity.trim() || null,
      price,
      price_per: price != null ? pricePer : null,
    })
  }

  const confirmSuggested = () => {
    if (!line.suggested) return
    setPriceText(formatRowAmount(line.suggested.price))
    setPriceTouched(true)
  }

  return (
    <div className="adjust-sheet__view">
      <button type="button" className="adjust-sheet__back" onClick={onBack}>
        <ChevronLeft size={22} strokeWidth={1.8} aria-hidden />
        Cerrar compra
      </button>

      <div className="adjust-sheet__body">
        <label className="adjust-field">
          <span className="adjust-field__label">Producto</span>
          <input
            className="adjust-field__box"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del producto"
            autoFocus
          />
        </label>

        <div className="adjust-field">
          <span className="adjust-field__label">Cantidad y precio</span>
          <div className="adjust-qtyprice">
            <input
              className="adjust-field__box adjust-qtyprice__qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="6"
              inputMode="text"
            />
            <span className="adjust-qtyprice__x" aria-hidden>
              ×
            </span>
            <div
              className={`adjust-field__box adjust-qtyprice__price${
                showSuggestion ? ' adjust-qtyprice__price--suggested' : ''
              }`}
            >
              <span className="adjust-qtyprice__euro">€</span>
              <input
                className="adjust-qtyprice__amount"
                value={priceText}
                onChange={(e) => {
                  setPriceText(e.target.value)
                  setPriceTouched(true)
                }}
                placeholder={
                  showSuggestion
                    ? formatRowAmount(line.suggested!.price)
                    : '0,00'
                }
                inputMode="decimal"
              />
              <span className="adjust-qtyprice__suffix">{suffix}</span>
            </div>
          </div>
          <p className="adjust-help">
            Escribe unidades (<code>6</code>) o peso (<code>500 ml</code>,{' '}
            <code>1,12 kg</code>). El precio se ajusta solo.
          </p>

          {showSuggestion ? (
            <div className="adjust-suggest">
              <span className="adjust-suggest__q">
                ¿Usar el último precio registrado en esta tienda?
              </span>
              <button
                type="button"
                className="adjust-suggest__disc adjust-suggest__disc--yes"
                onClick={confirmSuggested}
                aria-label="Usar el precio sugerido"
              >
                <Check size={15} strokeWidth={2.4} aria-hidden />
              </button>
              <button
                type="button"
                className="adjust-suggest__disc adjust-suggest__disc--no"
                onClick={() => setPriceTouched(true)}
                aria-label="No usar el precio sugerido"
              >
                <X size={15} strokeWidth={2.4} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="adjust-linetotal">
              <span className="adjust-linetotal__label">
                Línea de la compra
              </span>
              <span className="adjust-linetotal__value">
                {lineTotal != null ? `€ ${formatRowAmount(lineTotal)}` : '—'}
              </span>
            </div>
          )}
        </div>

        <label className="adjust-field">
          <span className="adjust-field__label">
            Marca <span className="adjust-field__opt">· opcional</span>
          </span>
          <input
            className="adjust-field__box"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="—"
          />
        </label>
      </div>

      <div className="adjust-sheet__footer">
        <button
          type="button"
          className="adjust-sheet__done"
          onClick={commit}
          disabled={name.trim() === ''}
        >
          Hecho
        </button>
        <button
          type="button"
          className="adjust-sheet__remove"
          onClick={onRemove}
        >
          {isNew ? 'Descartar' : 'Quitar del carro'}
        </button>
      </div>
    </div>
  )
}
