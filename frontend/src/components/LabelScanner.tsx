import { formatAmount } from '../lib/formatPrice'
import { labelCode } from '../lib/weighedLabel'
import { CameraScanner } from './CameraScanner'

interface Props {
  /** The line the label is for: the user tapped it, so there is no picker. */
  lineName: string
  /** The line's amount, when a receipt already gives one. */
  lineTotal: number | null
  /** The code to decode, or null when the read cannot be a label. */
  onDetect: (code: string | null) => void
  onClose: () => void
}

/** The camera aimed at one weighed label, for one line. */
export function LabelScanner({
  lineName,
  lineTotal,
  onDetect,
  onClose,
}: Props) {
  return (
    <CameraScanner
      formats={['code_128', 'qr_code']}
      hint="Apunta al código de barras de la etiqueta"
      wide
      caption={
        <span className="barcode-scanner__target">
          <span className="barcode-scanner__target-eyebrow">Etiqueta para</span>
          <span className="barcode-scanner__target-line">
            <span className="barcode-scanner__target-name">{lineName}</span>
            {lineTotal != null && (
              <span className="barcode-scanner__target-total">
                {formatAmount(lineTotal)}
              </span>
            )}
          </span>
        </span>
      }
      onDetect={(raw) => onDetect(labelCode(raw))}
      onClose={onClose}
    />
  )
}
