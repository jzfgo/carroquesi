import { Calendar, Check, Coins, Pencil, ScanBarcode, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { formatPrice } from '../lib/formatPrice'
import { parseQuantityFactor, purchasedDateLabel } from '../lib/itemCost'
import { parseInput } from '../lib/parseInput'
import type {
  BarcodeRead,
  MatchedLine,
  NameMapping,
  NewPurchasedItem,
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

type PendingScan = { index: number; product: BarcodeRead } | null

interface Props {
  result: ReceiptScanResult
  purchasedItems: ItemRef[]
  store: string | null
  onConfirm: (
    patches: PricePatch[],
    mappings: NameMapping[],
    newItems: NewPurchasedItem[],
  ) => Promise<boolean>
  onClose: () => void
  pendingScan?: PendingScan
  onRequestScan?: (index: number) => void
}

/** Name a create row will produce, after sigils are stripped. */
function createdName(ls: LineState): string {
  return parseInput(ls.createText).name.trim()
}

function isInvalidCreate(ls: LineState): boolean {
  return ls.included && ls.mode === 'create' && createdName(ls) === ''
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

/**
 * Unpurchased items must be split out before date grouping —
 * `purchasedDateLabel(null)` returns "Fecha desconocida", which is wrong for an
 * item that simply hasn't been bought yet.
 */
function groupItems(items: ItemRef[]): { label: string; items: ItemRef[] }[] {
  const unpurchased = items.filter((i) => !i.purchased)
  const purchased = items.filter((i) => i.purchased)
  return [
    ...(unpurchased.length
      ? [{ label: 'Sin comprar', items: unpurchased }]
      : []),
    ...groupItemsByDate(purchased),
  ]
}

export default function ReceiptScanSheet({
  result,
  purchasedItems,
  store,
  onConfirm,
  onClose,
  pendingScan,
  onRequestScan,
}: Props) {
  const allLines: (MatchedLine | UnmatchedLine)[] = [
    ...result.matched,
    ...result.unmatched,
  ]
  const [lineStates, setLineStates] = useState<LineState[]>(() =>
    initState(result),
  )
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [submitted, setSubmitted] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  // Adjusts state in response to a prop change, per React's "you might not
  // need an effect" guidance — a scan result is an event the parent hands
  // down, not an external system to synchronize with. Tracking the last
  // applied scan by identity lets the same row be scanned again (the parent
  // always hands down a fresh object) without re-applying on every render.
  const [appliedScan, setAppliedScan] = useState<PendingScan>(null)
  if (pendingScan && pendingScan !== appliedScan) {
    setAppliedScan(pendingScan)
    const { index, product } = pendingScan
    const text = product.brand
      ? `${product.name} #${product.brand}`
      : product.name
    setLineStates((prev) =>
      prev.map((ls, i) =>
        i === index
          ? {
              ...ls,
              mode: 'create' as const,
              itemId: null,
              included: true,
              createText: text,
              createEan: product.ean,
            }
          : ls,
      ),
    )
    setExpanded((prev) => new Set(prev).add(index))
  }

  const checkedCount = lineStates.filter((ls) => ls.included).length
  const allChecked = checkedCount === lineStates.length
  const hasInvalidCreate = lineStates.some(isInvalidCreate)

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

  async function handleConfirm() {
    if (submitted) return
    setSubmitted(true)

    const patches: PricePatch[] = lineStates.flatMap((ls) => {
      if (!ls.included || ls.mode !== 'link' || !ls.itemId) return []
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

    const newItems: NewPurchasedItem[] = lineStates.flatMap((ls) => {
      if (!ls.included || ls.mode !== 'create') return []
      const parsed = parseInput(ls.createText)
      const name = parsed.name.trim()
      if (!name) return []
      return [
        {
          name,
          brand: parsed.brand,
          // +qty and @store are parsed out of the name but discarded: the row's
          // quantity field and the receipt header already own those values.
          ean: parsed.ean ?? ls.createEan,
          price: ls.unitPrice,
          price_per: ls.pricePer,
          store,
          quantity: ls.quantity,
        },
      ]
    })

    const mappings: NameMapping[] = lineStates.flatMap((ls, i) => {
      if (!ls.included || !store) return []
      let itemName: string | null = null
      if (ls.mode === 'link' && ls.itemId) {
        itemName = purchasedItems.find((p) => p.id === ls.itemId)?.name ?? null
      } else if (ls.mode === 'create') {
        itemName = createdName(ls) || null
      }
      if (!itemName) return []
      return [
        {
          store,
          receipt_name: allLines[i].receipt_name.toLowerCase(),
          item_name: itemName,
          item_brand: null,
        },
      ]
    })

    // onConfirm resolves to whether the submit succeeded. On success the
    // parent unmounts this sheet; on failure (or an unexpected throw) we
    // re-enable the button so a flaky-connection user can retry without
    // losing their edits and re-scanning.
    try {
      const ok = await onConfirm(patches, mappings, newItems)
      if (!ok) setSubmitted(false)
    } catch {
      setSubmitted(false)
    }
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
          const itemGroups = groupItems(availableItems(i))
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
                    {ls.mode === 'create'
                      ? `✚ ${createdName(ls) || 'artículo nuevo'}`
                      : linkedItem
                        ? linkedItem.name
                        : 'sin vincular'}
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

                {ls.mode === 'create' && (
                  <div className="rss-field">
                    <div className="rss-field-label">Artículo nuevo</div>
                    <div className="rss-create-row">
                      <input
                        className="rss-create-input"
                        type="text"
                        value={ls.createText}
                        placeholder="ej. Leche semi #Hacendado"
                        aria-describedby={
                          [
                            `rss-create-hint-${i}`,
                            isInvalidCreate(ls)
                              ? `rss-create-error-${i}`
                              : null,
                            ls.unitPrice <= 0
                              ? `rss-create-warning-${i}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                        onChange={(e) =>
                          updateLine(i, { createText: e.target.value })
                        }
                      />
                      {onRequestScan && (
                        <button
                          type="button"
                          className="rss-scan-btn"
                          onClick={() => onRequestScan(i)}
                          aria-label="Escanear código de barras"
                        >
                          <ScanBarcode size={16} />
                        </button>
                      )}
                    </div>
                    <div
                      className="rss-create-hint"
                      id={`rss-create-hint-${i}`}
                    >
                      #marca · usa comillas si hay espacios
                    </div>
                    {isInvalidCreate(ls) && (
                      <div
                        className="rss-create-error"
                        id={`rss-create-error-${i}`}
                        role="alert"
                      >
                        Escribe un nombre
                      </div>
                    )}
                    {ls.unitPrice <= 0 && (
                      <div
                        className="rss-create-warning"
                        id={`rss-create-warning-${i}`}
                      >
                        Precio no positivo — ¿es un descuento?
                      </div>
                    )}
                  </div>
                )}

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
          disabled={checkedCount === 0 || hasInvalidCreate || submitted}
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
