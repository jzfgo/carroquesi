import { Calendar, Check, Coins, Pencil, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { formatPrice } from '../lib/formatPrice'
import { parseQuantityFactor, purchasedDateLabel } from '../lib/itemCost'
import type {
  MatchedLine,
  NameMapping,
  PricePatch,
  ReceiptScanResult,
  UnmatchedLine,
} from '../types'
import './ReceiptScanSheet.css'

export interface ItemRef {
  id: string
  name: string
  purchased: boolean
  purchased_at: string | null
  brand: string | null
  stores: string[]
  quantity: string | null
}

type LineMode = 'ignore' | 'link' | 'create'

const CREATE_OPTION = '__create__'

interface LineState {
  included: boolean
  mode: LineMode
  itemId: string | null
  createText: string
  createEan: string | null
  quantity: string
  unitPrice: number
  pricePer: 'KILOGRAM' | null
}

interface Props {
  result: ReceiptScanResult
  purchasedItems: ItemRef[]
  store: string | null
  onConfirm: (patches: PricePatch[], mappings: NameMapping[]) => void
  onClose: () => void
}

function initialQuantity(line: MatchedLine | UnmatchedLine): string {
  if (line.price_type === 'KILOGRAM' && line.quantity != null) {
    return line.quantity < 1
      ? `${Math.round(line.quantity * 1000)}g`
      : `${line.quantity}kg`
  }
  if (line.price_type === 'MULTI' && line.quantity != null) {
    return String(Math.round(line.quantity))
  }
  return '1'
}

function initState(result: ReceiptScanResult): LineState[] {
  return [
    ...result.matched.map((m) => ({
      included: true,
      mode: 'link' as const,
      itemId: m.item_id,
      createText: '',
      createEan: null,
      quantity: initialQuantity(m),
      unitPrice: m.unit_price,
      pricePer: m.price_type === 'KILOGRAM' ? ('KILOGRAM' as const) : null,
    })),
    ...result.unmatched.map((u) => ({
      included: false,
      mode: 'ignore' as const,
      itemId: null,
      createText: '',
      createEan: null,
      quantity: initialQuantity(u),
      unitPrice: u.unit_price,
      pricePer: u.price_type === 'KILOGRAM' ? ('KILOGRAM' as const) : null,
    })),
  ]
}

function formatQtySummary(ls: LineState): string {
  const price = ls.unitPrice.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const unit = ls.pricePer === 'KILOGRAM' ? '€/kg' : '€/ud'
  const sep = ls.pricePer === 'KILOGRAM' ? ' × ' : '× '
  return `${ls.quantity}${sep}${price} ${unit}`
}

function computeLineTotal(ls: LineState): number {
  const factor = parseQuantityFactor(ls.quantity, ls.pricePer)
  return factor !== null ? ls.unitPrice * factor : ls.unitPrice
}

function groupItemsByDate(
  items: ItemRef[],
): { label: string; items: ItemRef[] }[] {
  const sorted = [...items].sort((a, b) => {
    if (!a.purchased_at) return 1
    if (!b.purchased_at) return -1
    return b.purchased_at.localeCompare(a.purchased_at)
  })
  const groups: { label: string; items: ItemRef[] }[] = []
  for (const item of sorted) {
    const label = purchasedDateLabel(item.purchased_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.items.push(item)
    } else {
      groups.push({ label, items: [item] })
    }
  }
  return groups
}

export default function ReceiptScanSheet({
  result,
  purchasedItems,
  store,
  onConfirm,
  onClose,
}: Props) {
  const allLines: (MatchedLine | UnmatchedLine)[] = [
    ...result.matched,
    ...result.unmatched,
  ]
  const [lineStates, setLineStates] = useState<LineState[]>(() =>
    initState(result),
  )
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  const checkedCount = lineStates.filter((ls) => ls.included).length
  const allChecked = checkedCount === lineStates.length

  function updateLine(index: number, patch: Partial<LineState>) {
    setLineStates((prev) =>
      prev.map((ls, i) => (i === index ? { ...ls, ...patch } : ls)),
    )
  }

  function toggleExpanded(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function toggleAll() {
    const include = !allChecked
    setLineStates((prev) => prev.map((ls) => ({ ...ls, included: include })))
  }

  // Prevent the same item from being linked to multiple rows
  const linkedItemIds = new Set(
    lineStates.map((ls) => ls.itemId).filter(Boolean) as string[],
  )
  function availableItems(currentIndex: number): ItemRef[] {
    return purchasedItems.filter(
      (item) =>
        !linkedItemIds.has(item.id) ||
        lineStates[currentIndex].itemId === item.id,
    )
  }

  // Footer totals
  const selectedTotal = lineStates
    .filter((ls) => ls.included)
    .reduce((sum, ls) => sum + computeLineTotal(ls), 0)
  const receiptTotal = result.receipt_total
  const diff = receiptTotal != null ? selectedTotal - receiptTotal : null

  function handleConfirm() {
    const patches: PricePatch[] = lineStates.flatMap((ls) => {
      if (!ls.included || !ls.itemId) return []
      return [
        {
          item_id: ls.itemId,
          price: ls.unitPrice,
          price_per: ls.pricePer,
          store,
          quantity: ls.quantity,
        },
      ]
    })

    const mappings: NameMapping[] = lineStates.flatMap((ls, i) => {
      if (!ls.included || !ls.itemId || !store) return []
      const item = purchasedItems.find((p) => p.id === ls.itemId)
      if (!item) return []
      return [
        {
          store,
          receipt_name: allLines[i].receipt_name.toLowerCase(),
          item_name: item.name,
          item_brand: null,
        },
      ]
    })

    onConfirm(patches, mappings)
  }

  const formattedDate = result.receipt_date
    ? new Date(result.receipt_date).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null

  return (
    <div className="sheet" ref={sheetRef}>
      <div className="sheet-handle" {...swipe} />

      <div className="sheet-header">
        <div className="sheet-title-row">
          <div className="sheet-title">
            Ticket escaneado
            {store && <span className="store-badge">{store}</span>}
          </div>
          <button
            className="sheet-close-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="sheet-meta">
          {formattedDate && (
            <span>
              <Calendar size={13} /> {formattedDate}
            </span>
          )}
          {receiptTotal != null && (
            <span>
              <Coins size={13} /> {formatPrice(receiptTotal)}
            </span>
          )}
        </div>
      </div>

      <div className="rss-toolbar">
        <span className="rss-toolbar-count">
          {checkedCount} de {lineStates.length} seleccionados
        </span>
        <button className="rss-toolbar-toggle" onClick={toggleAll}>
          {allChecked ? 'Deseleccionar todo' : 'Seleccionar todo'}
        </button>
      </div>

      <div className="sheet-body">
        {lineStates.map((ls, i) => {
          const line = allLines[i]
          const isExpanded = expanded.has(i)
          const itemGroups = groupItemsByDate(availableItems(i))
          const linkedItem = purchasedItems.find((p) => p.id === ls.itemId)

          return (
            <div
              key={i}
              className={`rss-row${ls.included ? ' checked' : ''}${isExpanded ? ' expanded' : ''}`}
            >
              <div className="rss-summary" onClick={() => toggleExpanded(i)}>
                <input
                  type="checkbox"
                  className="rss-check"
                  checked={ls.included}
                  onChange={(e) => {
                    e.stopPropagation()
                    updateLine(i, { included: e.target.checked })
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="rss-text">
                  <div className="rss-ocr">{line.receipt_name}</div>
                  <div className={`rss-item${ls.itemId ? '' : ' unlinked'}`}>
                    {linkedItem ? linkedItem.name : 'sin vincular'}
                  </div>
                  <div className="rss-qty-summary">{formatQtySummary(ls)}</div>
                </div>
                <div className="rss-right">
                  <div className="rss-total">
                    {formatPrice(computeLineTotal(ls))}
                  </div>
                  <div className="rss-edit-icon">
                    <Pencil size={14} />
                  </div>
                </div>
              </div>

              <div className="rss-form">
                <div className="rss-field">
                  <div className="rss-field-label">Vincular a</div>
                  <select
                    className="rss-link-select"
                    value={
                      ls.mode === 'create' ? CREATE_OPTION : (ls.itemId ?? '')
                    }
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === CREATE_OPTION) {
                        updateLine(i, {
                          mode: 'create',
                          itemId: null,
                          included: true,
                        })
                      } else if (v === '') {
                        updateLine(i, {
                          mode: 'ignore',
                          itemId: null,
                          included: false,
                        })
                      } else {
                        updateLine(i, {
                          mode: 'link',
                          itemId: v,
                          included: true,
                        })
                      }
                    }}
                  >
                    <option value="">— No vincular —</option>
                    <option value={CREATE_OPTION}>
                      ✚ Crear artículo nuevo
                    </option>
                    {itemGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="rss-field">
                  <div className="rss-field-label">Cantidad · Precio</div>
                  <div className="rss-qp-row">
                    <input
                      className="rss-qty-input"
                      type="text"
                      value={ls.quantity}
                      placeholder="ej. 500g"
                      onChange={(e) =>
                        updateLine(i, { quantity: e.target.value })
                      }
                    />
                    <span className="rss-sep">×</span>
                    <span className="rss-euro">€</span>
                    <input
                      className="rss-price-input"
                      type="number"
                      value={ls.unitPrice}
                      step="0.01"
                      min="0"
                      onChange={(e) =>
                        updateLine(i, {
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <div className="rss-unit-toggle">
                      <button
                        type="button"
                        className={`rss-unit-btn${ls.pricePer === null ? ' rss-unit-btn--active' : ''}`}
                        onClick={() => updateLine(i, { pricePer: null })}
                      >
                        /ud
                      </button>
                      <button
                        type="button"
                        className={`rss-unit-btn${ls.pricePer === 'KILOGRAM' ? ' rss-unit-btn--active' : ''}`}
                        onClick={() => updateLine(i, { pricePer: 'KILOGRAM' })}
                      >
                        /kg
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="sheet-footer">
        <div className="rss-footer-totals">
          <div>
            <span>Seleccionado </span>
            <span className="rss-footer-selected">
              {formatPrice(selectedTotal)}
            </span>
            {diff !== null &&
              checkedCount > 0 &&
              (Math.abs(diff) < 0.02 ? (
                <span className="rss-footer-match">
                  <Check size={12} /> coincide
                </span>
              ) : (
                <span className="rss-footer-diff">
                  ({diff > 0 ? '+' : '−'}
                  {formatPrice(Math.abs(diff)).replace(' ', '')})
                </span>
              ))}
          </div>
          {receiptTotal != null && (
            <span>Ticket {formatPrice(receiptTotal)}</span>
          )}
        </div>
        <button
          className="confirm-btn"
          disabled={checkedCount === 0}
          onClick={handleConfirm}
        >
          Guardar precios
          <span className="confirm-count">
            {checkedCount} {checkedCount === 1 ? 'elemento' : 'elementos'}
          </span>
        </button>
      </div>
    </div>
  )
}
