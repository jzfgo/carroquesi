import { ScanBarcode } from 'lucide-react'
import { useState } from 'react'
import { foldText } from '../lib/foldText'
import {
  formatAmount,
  formatFigure,
  formatUnitPrice,
  parseAmount,
} from '../lib/formatPrice'
import { deriveUnit } from '../lib/itemCost'
import { parseInput } from '../lib/parseInput'
import {
  effectiveLineTotal,
  effectiveQuantity,
  effectiveQuantityDisplay,
  effectiveUnitPrice,
  type LineState,
  lineTotal,
  quantityDisplay,
  quantityString,
  type ReceiptLine,
  sameQuantityText,
  unitPriceToTotal,
} from '../lib/receiptReview'
import type { Suggestion } from '../types'
import { PrimaryButton, SheetBackButton } from './PurchaseSheetParts'
import { QuantityPriceRow } from './QuantityPriceRow'
import type { ItemRef } from './ReceiptScanSheet'
import { ScanLabelButton } from './WeightChip'

// A quantity must open with a number: «6», «0,346 kg». The factor parse
// cannot judge this, since it reads unknown text as one unit.
const LEADING_NUMBER = /^\d+(?:[.,]\d+)?/

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
  /** The line's review state, carrying any quantity or total correction. */
  state: LineState | undefined
  /** Corrects how much was bought («el papel no se discute»: this edits the
   *  interpretation, never the raw line above). Null clears the correction.
   *  Commits like the header store/date controls: on leaving the field. */
  onChangeQuantity: (quantity: string | null) => void
  /** Sets the typed unit price and the total it makes. A null total means
   *  the total matches the paper again. */
  onChangePrice: (price: number, total: number | null) => void
  /** «Escanear etiqueta»: always offered, for lines the chip rule misses. */
  onScanLabel?: () => void
  /** The back galón names the review it returns to; the targeted review has
   *  its own title. */
  backLabel?: string
  /** The review completes a settled purchase: the list holds that trip's own
   *  lines, labelled by their recorded price. */
  targeted?: boolean
}

/** Case- and accent-insensitive "name contains the typed text". */
function matchesQuery(name: string, query: string): boolean {
  return foldText(name).includes(foldText(query))
}

function itemSubLabel(item: ItemRef, targeted: boolean): string {
  // A trip line is told apart by what the record already says it cost: the
  // receipt line's partner usually prints the same figure.
  if (targeted) {
    if (item.price == null) return 'sin precio'
    return formatUnitPrice(item.price, item.price_per, true)
  }
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
  state,
  onChangeQuantity,
  onChangePrice,
  onScanLabel,
  backLabel = 'Revisar ticket',
  targeted = false,
}: Props) {
  // Both drafts start from what the review works with and follow it when it
  // changes: a new quantity re-derives the price, never the total. A field
  // commits on blur; matching the paper clears the correction (typing the
  // paper's own figure back is undoing, not overriding); invalid text
  // reverts.
  const qtyBase = effectiveQuantityDisplay(line, state)
  const priceBase = formatFigure(effectiveUnitPrice(line, state))
  const [qtyDraft, setQtyDraft] = useState(qtyBase)
  const [priceDraft, setPriceDraft] = useState(priceBase)
  const [seen, setSeen] = useState({ qty: qtyBase, price: priceBase })
  if (seen.qty !== qtyBase || seen.price !== priceBase) {
    setSeen({ qty: qtyBase, price: priceBase })
    setQtyDraft(qtyBase)
    setPriceDraft(priceBase)
  }

  function commitQuantity() {
    if (qtyDraft === qtyBase) return
    const text = qtyDraft.trim()
    const number = LEADING_NUMBER.exec(text)
    if (!number || parseFloat(number[0].replace(',', '.')) === 0) {
      setQtyDraft(qtyBase)
      return
    }
    // The same amount written another way is no change, and must not drop a
    // typed price.
    if (sameQuantityText(text, effectiveQuantity(line, state))) {
      setQtyDraft(qtyBase)
      return
    }
    if (sameQuantityText(text, quantityString(line))) {
      onChangeQuantity(null)
      setQtyDraft(quantityDisplay(line))
      return
    }
    onChangeQuantity(text)
  }

  function commitPrice() {
    // A field left untouched must not round its own figure into a correction.
    if (priceDraft === priceBase) return
    const price = parseAmount(priceDraft)
    const total =
      price == null
        ? null
        : unitPriceToTotal(price, effectiveQuantity(line, state))
    if (price == null || total == null) {
      setPriceDraft(priceBase)
      return
    }
    onChangePrice(price, total === lineTotal(line) ? null : total)
  }

  const total = effectiveLineTotal(line, state)
  const corrected = total !== lineTotal(line)
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
      <SheetBackButton label={backLabel} onClick={onBack} />

      <div className="rss-ticketline">
        <span className="psheet-label">Línea del ticket</span>
        <div className="rss-ticketline__row">
          <span className="rss-ticketline__raw">{line.receipt_name}</span>
          <span className="rss-ticketline__num">
            {quantityDisplay(line)} · {formatAmount(lineTotal(line))}
          </span>
        </div>
      </div>

      {/* The raw line above is the paper and stays as read; this corrects what
          the app understood — how much, and at what price. */}
      <div className="rss-qtyprice">
        <QuantityPriceRow
          id="rss-qty"
          quantity={qtyDraft}
          priceText={priceDraft}
          suffix={deriveUnit(qtyDraft).suffix}
          onQuantityChange={setQtyDraft}
          onPriceChange={setPriceDraft}
          onQuantityBlur={commitQuantity}
          onPriceBlur={commitPrice}
        >
          {onScanLabel && <ScanLabelButton onClick={onScanLabel} />}
          {corrected && (
            <div className="rss-corrected" role="status">
              <span className="rss-corrected__label">
                Importe corregido{' '}
                <span className="rss-corrected__paper">
                  · en el ticket{' '}
                  <span className="rss-corrected__num">
                    {formatAmount(lineTotal(line))}
                  </span>
                </span>
              </span>
              <span className="rss-corrected__value">
                {formatAmount(total)}
              </span>
            </div>
          )}
        </QuantityPriceRow>
      </div>

      <div className="rss-resolve-body">
        <div className="rss-pending">
          <span className="psheet-label">
            {targeted ? 'En esta compra' : 'Pendientes de asignar'} ·{' '}
            {visibleItems.length}
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
                <span className="rss-pending__sub">
                  {itemSubLabel(item, targeted)}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="rss-create">
          <span className="psheet-label">
            {targeted
              ? 'Si no estaba en esta compra'
              : 'Si no estaba en la lista'}
          </span>
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

      <div className="psheet-foot">
        <PrimaryButton disabled={!canAssign} onClick={onAssign}>
          Asignar
        </PrimaryButton>
      </div>
    </>
  )
}
