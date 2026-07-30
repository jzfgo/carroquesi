import { useId, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import type { CloseLine } from '../lib/closeLines'
import { parseKgFactor } from '../lib/itemCost'
import './AdjustItemSheet.css'

interface Props {
  line: CloseLine
  onDone: (line: CloseLine) => void
  onClose: () => void
}

/**
 * Reads an amount typed in either notation.
 *
 * A Spanish keypad offers a comma, and a household may still write a
 * thousands dot, so both reach this field. Whichever separator comes last is
 * the decimal one and the rest are grouping marks. Returns null for an empty
 * field, and NaN for anything unreadable, which the caller refuses.
 *
 * Local on purpose. The sibling price field sidesteps all of this with a
 * number input, whose value the browser always hands over in dot notation.
 * Move this to the shared library the day a second field needs it.
 */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const last = Math.max(trimmed.lastIndexOf(','), trimmed.lastIndexOf('.'))
  if (last === -1) return Number(trimmed)
  const whole = trimmed.slice(0, last).replace(/[.,]/g, '')
  return Number(`${whole}.${trimmed.slice(last + 1)}`)
}

/**
 * The second level of a row, and the blank form for something that was never
 * on the list.
 *
 * The unit is not asked for. Typing a weight makes the price per kilo, typing
 * a count makes it per unit, and the suffix beside the field says which —
 * text, not a control, so nobody has to declare what they already wrote.
 */
export function AdjustItemSheet({ line, onDone, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)
  const id = useId()

  const [name, setName] = useState(line.name)
  const [brand, setBrand] = useState(line.brand ?? '')
  const [quantity, setQuantity] = useState(line.quantity ?? '')
  const seededPrice = line.price == null ? '' : String(line.price)
  const [priceStr, setPriceStr] = useState(seededPrice)

  const price = parseAmount(priceStr)
  // Deriving the unit from the quantity is the rule for a row being *priced* —
  // type a weight and the price is per kilo. It is not a rule about a row
  // nobody repriced. An item already priced per unit that happens to say
  // "500 g" would be re-declared per kilo just by opening this sheet and
  // pressing Hecho, halving what it contributes and rewriting the item's
  // stored unit. So the derivation waits for the price itself to move.
  //
  // The quantity deliberately does not trigger it. Correcting "500 g" to
  // "600 g" restates how much came home, not what a unit of it cost.
  //
  // What that costs: an item priced per kilo whose quantity is corrected to a
  // count keeps its per-kilo unit, so the weight can no longer be read and the
  // row drops out of the sheet's total. That case is *visible* — it lands in
  // `partial` and the total prints `≥` — where the silent halving was not.
  // Preferring the loud failure is the same choice the rest of this sheet
  // makes.
  //
  // Compared as an amount, not as the string it was typed as: 2,50 and 2.50
  // and 2.5 are the same price, and re-typing one of them is not a repricing.
  const repriced = price !== line.price
  const pricePer: 'KILOGRAM' | null = repriced
    ? parseKgFactor(quantity) !== null && price !== null
      ? 'KILOGRAM'
      : null
    : line.pricePer
  // What the suffix says is what Hecho will save, so the two cannot disagree.
  const perKg = pricePer === 'KILOGRAM'
  // A price is optional here, so an empty field is fine. Zero is allowed: a
  // shop does give things away. A negative amount is not — the backend
  // refuses the whole close over one, and the household would lose the entire
  // sheet at the door over a stray minus.
  const priceOk = price === null || (Number.isFinite(price) && price >= 0)
  const valid = name.trim() !== '' && priceOk

  function handleDone() {
    if (!valid) return
    onDone({
      ...line,
      name: name.trim(),
      brand: brand.trim() === '' ? null : brand.trim(),
      quantity: quantity.trim() === '' ? null : quantity.trim(),
      price,
      // The unit only travels with an amount to apply it to. A weight left
      // unpriced is an ordinary row, and the backend rejects the sheet if one
      // arrives carrying a unit on its own.
      pricePer: price === null ? null : pricePer,
    })
  }

  return (
    <div className="ais" ref={sheetRef}>
      <div className="ais__handle" {...swipe} />
      <div className="ais__title">
        {line.itemId ? 'Ajustar producto' : 'Añadir producto'}
      </div>

      <div className="ais__field">
        <label className="ais__label" htmlFor={`${id}-name`}>
          Producto
        </label>
        <input
          id={`${id}-name`}
          className="ais__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={!line.itemId}
        />
      </div>

      <div className="ais__field" role="group" aria-labelledby={`${id}-group`}>
        <span className="ais__label" id={`${id}-group`}>
          Cantidad y precio
        </span>
        <div className="ais__row">
          <label className="sr-only" htmlFor={`${id}-qty`}>
            Cantidad
          </label>
          <input
            id={`${id}-qty`}
            className="ais__qty"
            placeholder="6 · 1,12 kg"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-describedby={`${id}-hint`}
          />
          <span className="ais__x" aria-hidden="true">
            ×
          </span>
          <span className="ais__euro" aria-hidden="true">
            €
          </span>
          <label className="sr-only" htmlFor={`${id}-price`}>
            Precio
          </label>
          <input
            id={`${id}-price`}
            className="ais__price"
            inputMode="decimal"
            placeholder="0,00"
            value={priceStr}
            onChange={(e) => setPriceStr(e.target.value)}
            aria-describedby={`${id}-per ${id}-hint`}
            autoFocus={!!line.itemId}
          />
          {/* Described by the price field, so the unit is announced on focus
              rather than being left to a reader sweeping the row. */}
          <span className="ais__per" id={`${id}-per`}>
            {perKg ? '€/kg' : '€/ud'}
          </span>
        </div>
        <span className="ais__hint" id={`${id}-hint`}>
          Escribe unidades (6) o peso (500 ml, 1,12 kg). El precio se ajusta
          solo.
        </span>
      </div>

      <div className="ais__field ais__field--last">
        <label className="ais__label" htmlFor={`${id}-brand`}>
          Marca · opcional
        </label>
        <input
          id={`${id}-brand`}
          className="ais__input"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
        />
      </div>

      <button
        className="ais__done"
        onClick={handleDone}
        disabled={!valid}
        type="button"
      >
        Hecho
      </button>
      <button className="ais__cancel" onClick={onClose} type="button">
        Cancelar
      </button>
    </div>
  )
}
