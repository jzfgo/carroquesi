import { ChevronLeft, ScanBarcode } from 'lucide-react'
import { formatRowAmount } from '../lib/formatPrice'
import { parseInput } from '../lib/parseInput'
import {
  lineTotal,
  quantityDisplay,
  type ReceiptLine,
} from '../lib/receiptReview'
import type { ItemRef } from './ReceiptScanSheet'

interface Props {
  line: ReceiptLine
  /** Items still free to link (already-linked ones are filtered out upstream). */
  candidateItems: ItemRef[]
  radioId: string | null
  createText: string
  onSelectRadio: (id: string | null) => void
  onChangeCreateText: (text: string) => void
  onRequestScan?: () => void
  onAssign: () => void
  onBack: () => void
  /** The back galón names the review it returns to; the targeted review has
   *  its own title. */
  backLabel?: string
}

function itemSubLabel(item: ItemRef): string {
  // An in-cart item's store isn't settled until the receipt closes the trip, so
  // it reads bare — only a still-pending item names the store it's tagged for.
  if (item.purchased) return 'en el carro'
  const store = item.stores[0]
  return store ? `pendiente · ${store}` : 'pendiente'
}

export function ReceiptLineResolveBody({
  line,
  candidateItems,
  radioId,
  createText,
  onSelectRadio,
  onChangeCreateText,
  onRequestScan,
  onAssign,
  onBack,
  backLabel = 'Revisar ticket',
}: Props) {
  const parsed = parseInput(createText)
  const previewName = parsed.name.trim()
  const canAssign = radioId != null || previewName.length > 0
  // The preview is "lo que se va a crear", so it only appears once the parser
  // has actually recognised structure — a #marca/+cant/quote sigil that shifts
  // the cleaned name off the raw text — not while the bar still holds the
  // prefilled OCR line verbatim.
  const showPreview =
    previewName.length > 0 &&
    (parsed.brand != null || previewName !== createText.trim())

  return (
    <>
      <div className="rss-resolve-head">
        <button type="button" className="rss-back" onClick={onBack}>
          <ChevronLeft size={22} /> {backLabel}
        </button>
      </div>

      <div className="rss-ticketline">
        <span className="rss-eyebrow">Línea del ticket</span>
        <div className="rss-ticketline__row">
          <span className="rss-ticketline__raw">{line.receipt_name}</span>
          <span className="rss-ticketline__num">
            {quantityDisplay(line)} · {formatRowAmount(lineTotal(line))}
          </span>
        </div>
      </div>

      <div className="rss-resolve-body">
        <div className="rss-pending">
          <span className="rss-eyebrow">
            Pendientes de asignar · {candidateItems.length}
          </span>
          {candidateItems.map((item) => (
            <button
              type="button"
              key={item.id}
              role="radio"
              aria-checked={radioId === item.id}
              className={`rss-pending__row ${radioId === item.id ? 'rss-pending__row--on' : ''}`}
              onClick={() => onSelectRadio(item.id)}
            >
              <span className="rss-radio" aria-hidden="true" />
              <span className="rss-pending__text">
                <span className="rss-pending__name">{item.name}</span>
                <span className="rss-pending__sub">{itemSubLabel(item)}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="rss-create">
          <span className="rss-eyebrow">Si no estaba en la lista</span>
          {showPreview && (
            <div className="rss-create__preview">
              <span className="rss-create__preview-name">{previewName}</span>
              {parsed.brand && (
                <span className="rss-create__preview-brand">
                  {parsed.brand}
                </span>
              )}
            </div>
          )}
          <div className="rss-create__bar">
            <input
              className="rss-create__input"
              type="text"
              value={createText}
              placeholder="Nombre del producto  #marca"
              onChange={(e) => onChangeCreateText(e.target.value)}
            />
            {onRequestScan && (
              <button
                type="button"
                className="rss-create__scan"
                onClick={onRequestScan}
                aria-label="Escanear código de barras"
              >
                <ScanBarcode size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rss-foot">
        <button
          type="button"
          className="rss-save"
          disabled={!canAssign}
          onClick={onAssign}
        >
          Asignar
        </button>
      </div>
    </>
  )
}
