import { Check, CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { getLabel } from '../lib/api'
import { isOnline } from '../lib/connectivity'
import { formatAmount } from '../lib/formatPrice'
import { labelAgrees, labelPricePerKg, labelTotal } from '../lib/weighedLabel'
import type { LabelRead } from '../types'
import './LabelScanFlow.css'
import { LabelScanner } from './LabelScanner'

/** A label someone chose to use on a line: its code, to spot it twice, and
 * what it says. */
export interface UsedLabel {
  code: string
  label: LabelRead
}

interface Props {
  getToken: () => Promise<string>
  /** The trip's store. A known chain's refusal is final. */
  store: string | null
  lineName: string
  /** The receipt's amount for the line; null without a receipt, where the
   *  label sets the amount. */
  lineTotal: number | null
  /** The product on another line that already carries this code, or null. */
  usedOn: (code: string) => string | null
  showToast: (message: string) => void
  onUse: (used: UsedLabel) => void
  /** «Escribir a mano»: type the weight and price instead. */
  onManual: () => void
  /** The camera was closed without a read. */
  onCancel: () => void
}

type Step =
  | { kind: 'scanning' }
  | { kind: 'reading' }
  | { kind: 'read'; used: UsedLabel }
  | { kind: 'error' }

const OFFLINE_TOAST = 'Sin conexión'

/**
 * Scanning one weighed label for the line the user tapped: the camera, then
 * what the label says against the line. The content of a step in the
 * caller's sheet, never a sheet of its own. A label that does not match, or
 * that is already on another line, warns once and the user decides: two
 * articles that weigh and cost the same give the same code.
 */
export function LabelScanFlow({
  getToken,
  store,
  lineName,
  lineTotal,
  usedOn,
  showToast,
  onUse,
  onManual,
  onCancel,
}: Props) {
  const [step, setStep] = useState<Step>({ kind: 'scanning' })

  async function decode(code: string | null) {
    if (code == null) {
      setStep({ kind: 'error' })
      return
    }
    if (!isOnline()) {
      showToast(OFFLINE_TOAST)
      onCancel()
      return
    }
    setStep({ kind: 'reading' })
    try {
      const label = await getLabel(getToken, code, store)
      // This flow records a weight. A label that gives none (a price-only
      // label) cannot fill the line, so it fails like any refusal.
      setStep(
        label?.weight_g != null && label.price_per_kg_cents != null
          ? { kind: 'read', used: { code, label } }
          : { kind: 'error' },
      )
    } catch (err) {
      if (err instanceof TypeError) {
        showToast(OFFLINE_TOAST)
        onCancel()
      } else {
        setStep({ kind: 'error' })
      }
    }
  }

  const rescan = () => setStep({ kind: 'scanning' })

  if (step.kind === 'scanning') {
    return (
      <LabelScanner
        lineName={lineName}
        lineTotal={lineTotal}
        onDetect={(code) => void decode(code)}
        onClose={onCancel}
      />
    )
  }

  if (step.kind === 'reading') {
    return <div className="label-read" aria-busy="true" />
  }

  if (step.kind === 'error') {
    return (
      <div className="label-read">
        <div className="label-read__head">
          <h2 className="label-read__title">No reconozco esta etiqueta</h2>
        </div>
        <p className="label-read__text">
          Puede que el código esté arrugado, mojado o tapado por otra pegatina.
          Si no, escribe el peso y el precio tú.
        </p>
        <div className="label-read__actions">
          <button
            type="button"
            className="label-read__primary"
            onClick={rescan}
          >
            Reintentar
          </button>
          <button
            type="button"
            className="label-read__secondary"
            onClick={onManual}
          >
            Escribir a mano
          </button>
        </div>
      </div>
    )
  }

  const { used } = step
  const { label } = used
  const mismatch = lineTotal != null && !labelAgrees(label, lineTotal)
  const repeatedOn = usedOn(used.code)
  const warn = mismatch || repeatedOn != null
  const use = () => onUse(used)

  return (
    <div className="label-read">
      <div className="label-read__head">
        <h2 className="label-read__title">
          {warn ? 'Revisa la etiqueta' : 'Etiqueta leída'}
        </h2>
        <p className="label-read__sub">
          {lineName}
          {lineTotal != null && (
            <>
              {' '}
              · línea del ticket{' '}
              <span className="label-read__num">{formatAmount(lineTotal)}</span>
            </>
          )}
        </p>
      </div>

      <div className="label-read__body">
        <div className="label-figs">
          <div className="label-figs__cell">
            <span className="label-figs__cap">Peso</span>
            <span className="label-figs__fig">
              {(label.weight_g! / 1000).toFixed(3).replace('.', ',')}
              <small>kg</small>
            </span>
          </div>
          <div className="label-figs__cell">
            <span className="label-figs__cap">Precio / kg</span>
            <span className="label-figs__fig">
              {formatAmount(labelPricePerKg(label))}
            </span>
          </div>
          <div className="label-figs__cell">
            <span className="label-figs__cap">Total</span>
            <span className="label-figs__fig">
              {formatAmount(labelTotal(label))}
            </span>
          </div>
        </div>

        {warn ? (
          <div className="label-read__warn">
            <CircleAlert size={18} aria-hidden />
            <span>
              {mismatch && (
                <span>
                  La etiqueta dice{' '}
                  <span className="label-read__num label-read__num--strong">
                    {formatAmount(labelTotal(label))}
                  </span>{' '}
                  y esta línea{' '}
                  <span className="label-read__num label-read__num--strong">
                    {formatAmount(lineTotal!)}
                  </span>
                  . Puede que sea otro artículo.
                </span>
              )}
              {mismatch && repeatedOn != null && ' '}
              {repeatedOn != null && (
                <span>
                  Esta etiqueta ya está en otra línea de {repeatedOn}. Puede ser
                  la misma etiqueta dos veces, o dos artículos que pesan y
                  cuestan lo mismo.
                </span>
              )}
            </span>
          </div>
        ) : (
          lineTotal != null && (
            <>
              <div className="label-read__ok">
                <span className="label-read__disc" aria-hidden>
                  <Check size={12} strokeWidth={3} />
                </span>
                Cuadra con el ticket
              </div>
              <p className="label-read__small">
                La línea guarda el peso y el precio por kilo. El importe sigue
                siendo el del ticket.
              </p>
            </>
          )
        )}
      </div>

      <div className="label-read__actions">
        {warn ? (
          <>
            <button
              type="button"
              className="label-read__primary"
              onClick={rescan}
            >
              Volver a escanear
            </button>
            <button
              type="button"
              className="label-read__secondary"
              onClick={use}
            >
              Usarla de todas formas
            </button>
          </>
        ) : (
          <>
            <button type="button" className="label-read__primary" onClick={use}>
              Usar en esta línea
            </button>
            <button
              type="button"
              className="label-read__secondary"
              onClick={rescan}
            >
              Volver a escanear
            </button>
          </>
        )}
      </div>
      {/* Without a receipt the label sets the amount, so the note about
          keeping the receipt's would be wrong. */}
      {warn && lineTotal != null && (
        <p className="label-read__small label-read__small--foot">
          Usarla guarda el peso y el €/kg. El importe sigue siendo el del
          ticket.
        </p>
      )}
    </div>
  )
}
