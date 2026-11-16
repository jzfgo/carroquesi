import { Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { formatFigure } from '../lib/formatPrice'
import { type PackFormat, unitPrice } from '../lib/itemCost'
import {
  formatContent,
  packFromFields,
  packWeightText,
  readPackCount,
  readPackWeight,
} from '../lib/packFormat'
import './PackFormatField.css'

interface Props {
  /** The stored format the fields start from. */
  initial: PackFormat | null
  /** The price of one unit bought, for the shelf-label preview. */
  price: number | null
  /** How many packs the line bought, for the total. */
  units: number | null
  /**
   * The format the fields give: null removes it, undefined means a field
   * cannot be read yet, and the caller keeps «Hecho» disabled.
   */
  onChange: (pack: PackFormat | null | undefined) => void
  /** With no format, start folded into one «Añadir formato» row (10d). */
  foldWhenEmpty?: boolean
}

const BASIS_CAPTION = { kg: 'kg', l: 'L', ud: 'ud', unit: 'ud' } as const

/** All the content the line bought: «18 L», «108 g», «12 ud». */
function totalText(pack: PackFormat, units: number): string {
  const count = pack.count * units
  if (pack.content == null || pack.unit == null) {
    return `${formatFigure(count).replace(/,00$/, '')} ud`
  }
  const total = count * pack.content
  // A small total reads better in its own unit than as «0,108 kg».
  const big = { g: 'kg', ml: 'l', cl: 'l', dl: 'l' } as const
  const toBig = { g: 0.001, ml: 0.001, cl: 0.01, dl: 0.1 } as const
  if (pack.unit in big) {
    const unit = pack.unit as keyof typeof big
    const inBig = total * toBig[unit]
    if (inBig >= 1) return formatContent(inBig, big[unit])
  }
  return formatContent(total, pack.unit)
}

/**
 * The «Formato» block (10d, 13b, 22a): «Unidades» × «Peso». The weight is
 * typed with its unit and read as typed, like «Cantidad y precio»; a figure
 * with no unit is refused. Under the fields, the shelf-label price and the
 * total show at once, so a typo is easy to spot.
 */
export function PackFormatField({
  initial,
  price,
  units,
  onChange,
  foldWhenEmpty = false,
}: Props) {
  const id = useId()
  const [open, setOpen] = useState(!foldWhenEmpty || initial != null)
  const [countText, setCountText] = useState(
    initial && initial.count > 1 ? String(initial.count) : '',
  )
  const [weightText, setWeightText] = useState(packWeightText(initial))

  if (!open) {
    return (
      <button
        type="button"
        className="pack-field__add"
        onClick={() => setOpen(true)}
      >
        <span className="pack-field__add-text">
          <span>Añadir formato</span>
          <span className="pack-field__add-sub">
            Para comparar por kilo o por litro
          </span>
        </span>
        <Plus size={14} strokeWidth={2.2} aria-hidden />
      </button>
    )
  }

  const pack = packFromFields(countText, weightText)
  const badCount = readPackCount(countText) == null
  const badWeight = readPackWeight(weightText).kind === 'invalid'
  const shelf =
    pack && price != null ? unitPrice(price, null, null, pack) : null

  function update(count: string, weight: string) {
    setCountText(count)
    setWeightText(weight)
    onChange(packFromFields(count, weight))
  }

  return (
    <div className="pack-field">
      <span className="pack-field__label">
        Formato <span className="pack-field__opt">· opcional</span>
      </span>
      <div className="pack-field__row">
        <label className="pack-field__cell pack-field__cell--count">
          <span className="pack-field__cap">Unidades</span>
          <input
            className="pack-field__box"
            aria-label="Unidades por envase"
            aria-invalid={badCount || undefined}
            value={countText}
            onChange={(e) => update(e.target.value, weightText)}
            placeholder="1"
            inputMode="numeric"
          />
        </label>
        <span className="pack-field__x" aria-hidden>
          ×
        </span>
        <label className="pack-field__cell">
          <span className="pack-field__cap">
            Peso <span className="pack-field__opt">· opcional</span>
          </span>
          <input
            className="pack-field__box pack-field__box--weight"
            aria-label="Peso de cada unidad"
            aria-invalid={badWeight || undefined}
            aria-describedby={`${id}-help`}
            value={weightText}
            onChange={(e) => update(countText, e.target.value)}
            placeholder="ej. 500 ml"
          />
        </label>
      </div>
      {badWeight ? (
        <p id={`${id}-help`} className="pack-field__error" role="alert">
          Añade la unidad: <code>1,5 L</code>, <code>108 g</code>
        </p>
      ) : badCount ? (
        <p id={`${id}-help`} className="pack-field__error" role="alert">
          Las unidades son un número entero, de 1 a 1000
        </p>
      ) : (
        <p id={`${id}-help`} className="pack-field__help">
          Escribe el peso de cada unidad (<code>1,5 L</code>, <code>108 g</code>
          , <code>33 cl</code>).
        </p>
      )}
      {pack && (
        <div className="pack-field__figures">
          {shelf && (
            <span className="pack-field__figure">
              <span className="pack-field__cap-caps">
                Precio / {BASIS_CAPTION[shelf.basis]}
              </span>
              <span className="pack-field__fig">
                {formatFigure(shelf.value)} €
              </span>
            </span>
          )}
          <span className="pack-field__figure">
            <span className="pack-field__cap-caps">En total</span>
            <span className="pack-field__fig">
              {totalText(pack, units ?? 1)}
            </span>
          </span>
        </div>
      )}
      {pack && pack.content == null && (
        <p className="pack-field__help">
          Sin peso, el precio es por unidad del envase.
        </p>
      )}
    </div>
  )
}
