import { ChevronLeft, ScanBarcode } from 'lucide-react'
import { useState } from 'react'
import { formatRowAmount, parseAmount } from '../lib/formatPrice'
import { parseInput } from '../lib/parseInput'
import {
  lineTotal,
  quantityDisplay,
  type ReceiptLine,
} from '../lib/receiptReview'
import type { Suggestion } from '../types'
import type { ItemRef } from './ReceiptScanSheet'

interface Props {
  line: ReceiptLine
  /** Items still free to link (already-linked ones are filtered out upstream). */
  candidateItems: ItemRef[]
  radioId: string | null
  createText: string
  /** True once the user typed in the bar; a prefill never filters the list. */
  userEdited?: boolean
  /** Catalogue matches for the typed text, offered above the bar. */
  suggestions?: Suggestion[]
  onPickSuggestion?: (suggestion: Suggestion) => void
  onSelectRadio: (id: string | null) => void
  onChangeCreateText: (text: string) => void
  onRequestScan?: () => void
  onAssign: () => void
  onBack: () => void
  /** The line total the review is working with — the user's correction when
   *  one exists, else the read figure. */
  effectiveTotal: number
  /** Corrects the line's total («el papel no se discute» — this edits the
   *  interpretation, never the raw line above). Null clears the correction.
   *  Commits like the header store/date controls: on leaving the field. */
  onChangePrice: (value: number | null) => void
  /** The back galón names the review it returns to; the targeted review has
   *  its own title. */
  backLabel?: string
}

/** Case- and accent-insensitive "name contains the typed text". */
function matchesQuery(name: string, query: string): boolean {
  const fold = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  return fold(name).includes(fold(query))
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
  userEdited = false,
  suggestions = [],
  onPickSuggestion,
  onSelectRadio,
  onChangeCreateText,
  onRequestScan,
  onAssign,
  onBack,
  effectiveTotal,
  onChangePrice,
  backLabel = 'Revisar ticket',
}: Props) {
  // The amount draft, comma-decimal like every hand-typed price. Committed on
  // blur: an amount equal to the read figure clears the correction (typing
  // the paper's own number back is undoing, not overriding), an invalid one
  // reverts to what the review is working with.
  const [priceDraft, setPriceDraft] = useState(() =>
    effectiveTotal.toFixed(2).replace('.', ','),
  )
  function commitPrice() {
    const value = parseAmount(priceDraft)
    if (value == null) {
      setPriceDraft(effectiveTotal.toFixed(2).replace('.', ','))
      return
    }
    onChangePrice(value === lineTotal(line) ? null : value)
    setPriceDraft(value.toFixed(2).replace('.', ','))
  }
  // The main add bar keeps its sigils silent, but this bar arrives prefilled
  // with raw OCR text the user has to clean by hand — so it earns a short,
  // collapsed reminder of the syntax that helps. Only the sigils this path
  // uses: brand, quantity, quotes.
  const [helpOpen, setHelpOpen] = useState(false)
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
  // «Escribe y filtra»: typed text narrows the link list in place, so the
  // answer is one tap whether the product was on the list or not. Prefills
  // never filter — the raw OCR line would hide the items worth linking.
  const visibleItems =
    userEdited && previewName.length > 0
      ? candidateItems.filter((item) => matchesQuery(item.name, previewName))
      : candidateItems

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

      {/* The raw line above is the paper and stays as read; this corrects what
          the app understood — the amount that sums, saves, and prices. */}
      <div className="rss-resolve-price">
        <label className="rss-eyebrow" htmlFor="rss-resolve-price-input">
          Importe
        </label>
        <div className="rss-control-editor">
          <input
            id="rss-resolve-price-input"
            className="rss-control-editor__input rss-resolve-price__input"
            type="text"
            inputMode="decimal"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={commitPrice}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </div>
      </div>

      <div className="rss-resolve-body">
        <div className="rss-pending">
          <span className="rss-eyebrow">
            Pendientes de asignar · {visibleItems.length}
          </span>
          {visibleItems.map((item) => (
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
          {onPickSuggestion && suggestions.length > 0 && (
            <div className="rss-create__suggestions">
              {suggestions.slice(0, 5).map((suggestion) => (
                <button
                  type="button"
                  key={`${suggestion.name}#${suggestion.brand ?? ''}`}
                  className="rss-create__suggestion"
                  onClick={() => onPickSuggestion(suggestion)}
                >
                  {suggestion.name}
                  {suggestion.brand && (
                    <span className="rss-create__suggestion-brand">
                      {suggestion.brand}
                    </span>
                  )}
                </button>
              ))}
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
          <div className="rss-create__help">
            <button
              type="button"
              className="rss-create__help-link"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen((open) => !open)}
            >
              ¿Cómo escribir más rápido?
            </button>
          </div>
          {helpOpen && (
            <ul className="rss-create__legend">
              <li>
                <code>#marca</code>
                <span>añade la marca</span>
              </li>
              <li>
                <code>+cantidad</code>
                <span>añade la cantidad</span>
              </li>
              <li>
                <code>"comillas"</code>
                <span>para valores con espacios</span>
              </li>
            </ul>
          )}
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
