import {
  Calendar,
  Check,
  ChevronLeft,
  Pencil,
  Plus,
  Receipt,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  closePurchase,
  getPriceHistory,
  getPurchaseItems,
  updateItem,
} from '../lib/api'
import { formatRowAmount } from '../lib/formatPrice'
import { parseQuantityFactor } from '../lib/itemCost'
import { storeKey } from '../lib/storeKey'
import type { ListItem, PurchaseLine } from '../types'
import { AdjustProductSheet, type DraftLine } from './AdjustProductSheet'
import './CloseTripSheet.css'
import { Sheet } from './Sheet'
import { StoreSelect } from './StoreSelect'

interface Props {
  listId: string
  getToken: () => Promise<string>
  /** Present for a torn-off proto-trip; absent closes the open cart. */
  purchaseId?: string
  /** Default for the date control (YYYY-MM-DD). A proto passes the day it
   *  covered so its close files there; the open cart leaves it as today. */
  initialDate?: string
  /** The open cart's lines, when closing it (not fetched). */
  cartItems?: ListItem[]
  /** The list's registered stores, offered even when the cart has none — so
   *  a store-less cart can still pick one. */
  storeOptions?: string[]
  displayStore: (raw: string) => string
  onClose: () => void
  /** After a successful close — the parent refreshes the list + stack. */
  onDone: () => void
  /** «Escanear el ticket en su lugar» — hand off to the receipt flow. */
  onScanReceipt?: () => void
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function toDraft(item: ListItem): DraftLine {
  return {
    item_id: item.id,
    name: item.name,
    brand: item.brand,
    quantity: item.purchased_quantity ?? item.quantity,
    price: item.price,
    price_per: (item.price_per as 'KILOGRAM' | null) ?? null,
    included: true,
    suggested: null,
  }
}

// The line's money: its confirmed total (price × quantity factor), the projected
// total from a pending suggestion, or nothing.
function lineTotal(
  line: DraftLine,
): { value: number; confirmed: boolean } | null {
  if (line.price != null) {
    const f = parseQuantityFactor(line.quantity, line.price_per)
    return f != null ? { value: line.price * f, confirmed: true } : null
  }
  if (line.suggested != null) {
    const f = parseQuantityFactor(line.quantity, line.suggested.price_per)
    return f != null
      ? { value: line.suggested.price * f, confirmed: false }
      : null
  }
  return null
}

export function CloseTripSheet({
  listId,
  getToken,
  purchaseId,
  initialDate,
  cartItems,
  storeOptions = [],
  displayStore,
  onClose,
  onDone,
  onScanReceipt,
}: Props) {
  const [lines, setLines] = useState<DraftLine[]>(() =>
    cartItems ? cartItems.map(toDraft) : [],
  )
  const [store, setStore] = useState('')
  // Stores added by hand through the «+ otra» sub-view — offered beside the
  // cart's and the registry's, and selected on confirm.
  const [extraStores, setExtraStores] = useState<string[]>([])
  // The «Nueva tienda» step: a content swap of this same sheet (never a second
  // sheet), plus its field.
  const [storeSubsheet, setStoreSubsheet] = useState(false)
  const [newStoreText, setNewStoreText] = useState('')
  const [date, setDate] = useState(initialDate ?? today())
  const [editing, setEditing] = useState<
    { index: number } | { add: true } | null
  >(null)
  const [saving, setSaving] = useState(false)
  // Item id → its price history, fetched once so store changes only re-filter.
  const [histories, setHistories] = useState<
    Record<
      string,
      {
        amount: number | null
        price_per: 'KILOGRAM' | null
        store: string | null
        is_sin_precio: boolean
      }[]
    >
  >({})
  // Track which items should return to the pending list on save («Quitar»).
  const [dropped, setDropped] = useState<string[]>([])

  // A proto-trip's lines are fetched; the open cart's arrive as props.
  useEffect(() => {
    if (!purchaseId) return
    let cancelled = false
    getPurchaseItems(getToken, listId, purchaseId).then((items) => {
      if (!cancelled) setLines(items.map(toDraft))
    })
    return () => {
      cancelled = true
    }
  }, [purchaseId, getToken, listId])

  // The stores offered — those the cart's lines mention, plus the list's
  // registered stores, so a store-less cart still has choices. «+ otra»
  // covers anything not listed.
  const stores = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const raws = [
      ...(cartItems ?? []).flatMap((i) => [...i.stores, i.price_store]),
      ...storeOptions,
      ...extraStores,
    ]
    for (const raw of raws) {
      if (!raw) continue
      const k = storeKey(raw)
      if (!seen.has(k)) {
        seen.add(k)
        out.push(displayStore(raw))
      }
    }
    return out
  }, [cartItems, storeOptions, extraStores, displayStore])

  // The active store: the picked or hand-added one, or the first offer as a
  // default. A store-less list with nothing to offer leaves this empty, which
  // keeps «Guardar compra» disabled until «+ otra» supplies one.
  const selectedStore = store || stores[0] || ''

  // Confirm a hand-typed store from the «Nueva tienda» sub-view: keep it in
  // the offer and select it, then return to the table.
  const confirmNewStore = () => {
    const v = newStoreText.trim()
    if (!v) return
    setExtraStores((xs) =>
      xs.some((x) => storeKey(x) === storeKey(v)) ? xs : [...xs, v],
    )
    setStore(v)
    setStoreSubsheet(false)
  }

  // Fetch each line's price history once, to seed the dashed suggestions.
  useEffect(() => {
    let cancelled = false
    for (const line of lines) {
      if (!line.item_id || histories[line.item_id]) continue
      getPriceHistory(getToken, listId, line.item_id, 'this_list')
        .then((r) => {
          if (!cancelled)
            setHistories((h) => ({ ...h, [line.item_id!]: r.entries }))
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [lines, getToken, listId, histories])

  // Recompute each line's suggestion for the selected store from its history:
  // the most recent priced (non-sin-precio) entry at that store.
  const withSuggestions = useMemo(() => {
    if (selectedStore === '') return lines
    const key = storeKey(selectedStore)
    return lines.map((line) => {
      if (!line.item_id || line.price != null) return line
      const entries = histories[line.item_id]
      if (!entries) return { ...line, suggested: null }
      const hit = entries.find(
        (e) =>
          !e.is_sin_precio &&
          e.amount != null &&
          e.store &&
          storeKey(e.store) === key,
      )
      return {
        ...line,
        suggested: hit
          ? { price: hit.amount!, price_per: hit.price_per }
          : null,
      }
    })
  }, [lines, histories, selectedStore])

  const included = withSuggestions.filter((l) => l.included)
  const total = included.reduce((sum, l) => {
    const t = lineTotal(l)
    return sum + (t && t.confirmed ? t.value : 0)
  }, 0)
  const suggestedCount = included.filter(
    (l) => l.price == null && l.suggested != null,
  ).length

  const confirmAllSuggested = () => {
    setLines((prev) =>
      prev.map((line, i) => {
        const s = withSuggestions[i].suggested
        return line.price == null && s != null
          ? { ...line, price: s.price, price_per: s.price_per }
          : line
      }),
    )
  }

  const applyEdit = (edited: DraftLine) => {
    if (editing && 'index' in editing) {
      setLines((prev) => prev.map((l, i) => (i === editing.index ? edited : l)))
    } else {
      setLines((prev) => [...prev, edited])
    }
    setEditing(null)
  }

  const removeEditing = () => {
    if (editing && 'index' in editing) {
      const line = lines[editing.index]
      if (line.item_id) setDropped((d) => [...d, line.item_id!])
      setLines((prev) => prev.filter((_, i) => i !== editing.index))
    }
    // An «add» in progress or a new line just vanishes.
    setEditing(null)
  }

  const editorDraft: DraftLine | null =
    editing && 'index' in editing
      ? withSuggestions[editing.index]
      : editing && 'add' in editing
        ? {
            item_id: null,
            name: '',
            brand: null,
            quantity: null,
            price: null,
            price_per: null,
            included: true,
            suggested: null,
          }
        : null

  const save = async () => {
    setSaving(true)
    try {
      const claimed = included.filter((l) => l.item_id)
      const body = {
        store: selectedStore,
        date,
        ...(purchaseId ? { purchase_id: purchaseId } : {}),
        lines: claimed.map((l): PurchaseLine => ({
          item_id: l.item_id!,
          price: l.price,
          price_per: l.price_per,
          quantity: l.quantity,
          name: l.name,
          brand: l.brand,
        })),
        new_items: included
          .filter((l) => !l.item_id)
          .map((l) => ({
            name: l.name,
            brand: l.brand,
            quantity: l.quantity,
            price: l.price,
            price_per: l.price_per,
          })),
      }
      await closePurchase(getToken, listId, body)
      // «Quitar del carro» lines return to the pending list.
      for (const id of dropped) {
        await updateItem(getToken, listId, id, { purchased: false }).catch(
          () => {},
        )
      }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  // ONE sheet, whose contents swap between the 10b table, the 10d line editor,
  // and the «Nueva tienda» step. A step never re-presents the sheet — the
  // surface stays, only what it holds changes (the app-wide sheet↔sub-sheet
  // rule). A dismiss gesture on any step goes back to the table, not away.
  const step: 'adjust' | 'store' | 'table' = editorDraft
    ? 'adjust'
    : storeSubsheet
      ? 'store'
      : 'table'
  return (
    <Sheet
      className={`close-sheet${step !== 'table' ? ' close-sheet--editing' : ''}`}
      onClose={onClose}
      onDismiss={
        step === 'adjust'
          ? () => setEditing(null)
          : step === 'store'
            ? () => setStoreSubsheet(false)
            : undefined
      }
      label={
        step === 'adjust'
          ? 'Ajustar producto'
          : step === 'store'
            ? 'Nueva tienda'
            : 'Cerrar compra'
      }
    >
      {step === 'adjust' ? (
        <AdjustProductSheet
          line={editorDraft!}
          isNew={!!editing && 'add' in editing}
          onDone={applyEdit}
          onRemove={removeEditing}
          onBack={() => setEditing(null)}
        />
      ) : step === 'store' ? (
        <div className="adjust-sheet__view">
          <button
            type="button"
            className="adjust-sheet__back"
            onClick={() => setStoreSubsheet(false)}
          >
            <ChevronLeft size={22} strokeWidth={1.8} aria-hidden />
            Cerrar compra
          </button>
          <div className="adjust-sheet__body">
            <label className="adjust-field">
              <span className="adjust-field__label">Tienda</span>
              <input
                className="adjust-field__box"
                value={newStoreText}
                onChange={(e) => setNewStoreText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmNewStore()
                }}
                placeholder="Nombre de la tienda"
                autoFocus
              />
            </label>
          </div>
          <div className="adjust-sheet__footer">
            <button
              type="button"
              className="adjust-sheet__done"
              onClick={confirmNewStore}
              disabled={newStoreText.trim() === ''}
            >
              Usar esta tienda
            </button>
          </div>
        </div>
      ) : (
        <div className="close-sheet__view">
          <div className="close-sheet__head">
            <h2 className="close-sheet__title">Cerrar compra</h2>
            <p className="close-sheet__subtitle">
              {included.length}{' '}
              {included.length === 1 ? 'producto pasa' : 'productos pasan'} a
              comprados
            </p>
          </div>

          <div className="close-sheet__controls">
            {/* The «+ otra» entry opens the «Nueva tienda» step, like the
                dashed chip it replaced. */}
            <StoreSelect
              className="close-sheet__store"
              options={stores}
              value={selectedStore}
              onSelect={setStore}
              onAddNew={() => {
                setNewStoreText('')
                setStoreSubsheet(true)
              }}
            />
            <label className="close-date">
              <Calendar size={13} aria-hidden />
              <input
                type="date"
                className="close-date__input"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>

          <div className="close-sheet__table">
            <div className="close-row close-row--head">
              <span>Producto</span>
              <span>Cant.</span>
              <span className="close-row__amount">Importe</span>
              <span />
            </div>

            {withSuggestions.map((line, index) =>
              line.included ? (
                <div className="close-row" key={line.item_id ?? `new-${index}`}>
                  <span className="close-row__name">
                    {line.name}
                    {!line.item_id && (
                      <span className="close-row__sub">
                        no estaba en la lista
                      </span>
                    )}
                  </span>
                  <span className="close-row__qty">{line.quantity ?? ''}</span>
                  <span className="close-row__amount">
                    {(() => {
                      const t = lineTotal(line)
                      if (t && t.confirmed)
                        return (
                          <span className="close-amount">
                            {formatRowAmount(t.value)}
                          </span>
                        )
                      if (t && !t.confirmed)
                        return (
                          <span className="close-amount close-amount--suggested">
                            {formatRowAmount(t.value)}
                            {/* The dashed border says "suggested, not yet
                                real"; say it for screen readers too. */}
                            <span className="sr-only"> (precio sugerido)</span>
                          </span>
                        )
                      return (
                        <span className="close-amount close-amount--none">
                          sin precio
                        </span>
                      )
                    })()}
                  </span>
                  <button
                    type="button"
                    className="close-row__pencil"
                    onClick={() => setEditing({ index })}
                    aria-label={`Ajustar ${line.name}`}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                </div>
              ) : null,
            )}

            {suggestedCount > 0 && (
              <button
                type="button"
                className="close-row close-row--action"
                onClick={confirmAllSuggested}
              >
                <span className="close-row__action-label">
                  Confirmar{' '}
                  {suggestedCount === 1
                    ? 'el precio sugerido'
                    : `los ${suggestedCount} precios sugeridos`}
                </span>
                <span className="close-row__action-disc close-row__action-disc--fill">
                  <Check size={15} strokeWidth={2.6} aria-hidden />
                </span>
              </button>
            )}

            <button
              type="button"
              className="close-row close-row--action"
              onClick={() => setEditing({ add: true })}
            >
              <span className="close-row__action-label">Añadir producto</span>
              <span className="close-row__action-disc close-row__action-disc--ghost">
                <Plus size={15} aria-hidden />
              </span>
            </button>

            <div className="close-row close-row--total">
              <span className="close-total__label">
                Total de lo que has puesto
              </span>
              <span className="close-total__value">
                € {formatRowAmount(total)}
              </span>
            </div>

            <p className="close-sheet__help">
              El lapicero de cada línea abre el ajuste. Lo que dejes sin precio
              se guarda como comprado, sin inventar el importe. Los importes en
              discontinuo son precios heredados de la última compra.
            </p>
          </div>

          <div className="close-sheet__footer">
            <button
              type="button"
              className="close-sheet__save"
              onClick={save}
              disabled={
                saving ||
                selectedStore === '' ||
                included.filter((l) => l.item_id).length === 0
              }
            >
              {saving ? 'Guardando…' : 'Guardar compra'}
            </button>
            <button
              type="button"
              className="close-sheet__scan"
              onClick={() => onScanReceipt?.()}
            >
              <Receipt size={16} aria-hidden /> Escanear el ticket en su lugar
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
