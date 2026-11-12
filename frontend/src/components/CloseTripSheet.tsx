import { Check, Plus, Receipt } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  closePurchase,
  getPriceHistory,
  getPurchaseItems,
  updateItem,
} from '../lib/api'
import { isOnline } from '../lib/connectivity'
import { formatUnitPrice } from '../lib/formatPrice'
import { parseQuantityFactor } from '../lib/itemCost'
import { todayInputValue } from '../lib/receiptDate'
import { storeKey } from '../lib/storeKey'
import { storeOffer, withExtraStore } from '../lib/storeOffer'
import {
  labelPricePerKg,
  labelQuantity,
  reductionFields,
  showsWeightChip,
} from '../lib/weighedLabel'
import type { ListItem, PurchaseLine } from '../types'
import { AdjustProductSheet, type DraftLine } from './AdjustProductSheet'
import './CloseTripSheet.css'
import { LabelScanFlow, type UsedLabel } from './LabelScanFlow'
import { NewStoreStep } from './NewStoreStep'
import {
  DatePill,
  MissingToSaveNotice,
  PurchaseAmount,
  PurchaseHelp,
  PurchaseRow,
  PurchaseSheetHead,
  PurchaseTable,
  PurchaseTableHead,
  PurchaseTotal,
  SavePurchaseButton,
  SecondaryButton,
  StorePill,
} from './PurchaseSheetParts'
import { Sheet } from './Sheet'
import { WeightChip } from './WeightChip'

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
  showToast: (message: string) => void
  /** After a successful close — the parent refreshes the list + stack. */
  onDone: () => void
  /** «Escanear el ticket en su lugar» — hand off to the receipt flow. */
  onScanReceipt?: () => void
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
    ean: item.ean,
    bought_by_weight: item.bought_by_weight,
    label: null,
  }
}

// A line closes as reduced only from a reduced label read on it.
function reductionOf(l: DraftLine) {
  return l.label
    ? reductionFields(l.label, l.price, l.price_per)
    : { reduced: false, price_before: null }
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
  showToast,
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
  const [date, setDate] = useState(initialDate ?? todayInputValue())
  // The 10d editor, on a line or a blank add. `draft` holds its unsaved
  // fields across a label scan; nothing reaches `lines` before «Listo».
  const [editing, setEditing] = useState<
    (({ index: number } | { add: true }) & { draft?: DraftLine }) | null
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
        reduced: boolean
      }[]
    >
  >({})
  // A weighed-label scan for one line, from its 10b row or its 10d editor:
  // another step of this same sheet, which returns where it started.
  const [labelScan, setLabelScan] = useState<
    | { from: 'table'; index: number }
    | { from: 'adjust'; draft: DraftLine }
    | null
  >(null)
  // Remounts the 10d editor after a scan, so it shows the label's figures.
  const [editorKey, setEditorKey] = useState(0)
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
  const stores = useMemo(
    () =>
      storeOffer(
        [
          ...(cartItems ?? []).flatMap((i) => [...i.stores, i.price_store]),
          ...storeOptions,
          ...extraStores,
        ],
        displayStore,
      ),
    [cartItems, storeOptions, extraStores, displayStore],
  )

  // The active store: the picked or hand-added one, or the first offer as a
  // default. A store-less list with nothing to offer leaves this empty, which
  // keeps «Guardar compra» disabled until «+ otra» supplies one.
  const selectedStore = store || stores[0] || ''

  // Confirm a hand-typed store from the «Nueva tienda» step: keep it in the
  // offer and select it, then return to the table.
  const confirmNewStore = (v: string) => {
    setExtraStores((xs) => withExtraStore(xs, v))
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
  // the most recent priced (non-sin-precio) entry at that store. A reduced
  // price was a one-off, so it is never suggested again.
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
          !e.reduced &&
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

  const editorDraft: DraftLine | null = editing?.draft
    ? editing.draft
    : editing && 'index' in editing
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
            ean: null,
            bought_by_weight: false,
            label: null,
          }
        : null

  function startLabelScan(index: number) {
    // Offline is read-only: the action stays visible and refuses.
    if (!isOnline()) {
      showToast('Sin conexión')
      return
    }
    setLabelScan({ from: 'table', index })
  }

  // From 10d the scan works on the editor's unsaved draft, which returns to
  // the editor; a blank add stays an add until «Listo».
  function scanFromEditor(draft: DraftLine) {
    if (!isOnline()) {
      showToast('Sin conexión')
      return
    }
    setLabelScan({ from: 'adjust', draft })
  }

  // Back to where the scan started; 10d gets `draft` (remounted to show it).
  function endLabelScan(draft?: DraftLine) {
    if (labelScan?.from === 'adjust' && editing) {
      setEditing({ ...editing, draft: draft ?? labelScan.draft })
      setEditorKey((k) => k + 1)
    }
    setLabelScan(null)
  }

  // Without a receipt, the label sets the amount: its weight and its €/kg.
  function withLabel(
    l: DraftLine,
    { code, label, priceBefore }: UsedLabel,
  ): DraftLine {
    return {
      ...l,
      quantity: labelQuantity(label.weight_g!),
      price: labelPricePerKg(label),
      price_per: 'KILOGRAM',
      label: {
        code,
        article: label.article,
        reduced: label.reduced === true,
        priceBefore,
      },
    }
  }

  function applyLabel(used: UsedLabel) {
    if (labelScan?.from === 'adjust') {
      endLabelScan(withLabel(labelScan.draft, used))
      return
    }
    const index = labelScan!.index
    setLines((prev) =>
      prev.map((l, i) => (i === index ? withLabel(l, used) : l)),
    )
    endLabelScan()
  }

  // The line being scanned is not «another line»; a blank add has no index.
  const scanIndex =
    labelScan?.from === 'table'
      ? labelScan.index
      : editing && 'index' in editing
        ? editing.index
        : -1

  function labelUsedOn(code: string): string | null {
    const other = lines.find(
      (l, i) => i !== scanIndex && l.included && l.label?.code === code,
    )
    return other ? other.name || 'Producto nuevo' : null
  }

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
          article: l.label?.article ?? null,
          ...reductionOf(l),
        })),
        new_items: included
          .filter((l) => !l.item_id)
          .map((l) => ({
            name: l.name,
            brand: l.brand,
            quantity: l.quantity,
            price: l.price,
            price_per: l.price_per,
            article: l.label?.article ?? null,
            ...reductionOf(l),
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
  const step: 'label' | 'adjust' | 'store' | 'table' = labelScan
    ? 'label'
    : editorDraft
      ? 'adjust'
      : storeSubsheet
        ? 'store'
        : 'table'
  return (
    <Sheet
      className={`close-sheet${step !== 'table' ? ' close-sheet--editing' : ''}`}
      onClose={onClose}
      onDismiss={
        step === 'label'
          ? () => endLabelScan()
          : step === 'adjust'
            ? () => setEditing(null)
            : step === 'store'
              ? () => setStoreSubsheet(false)
              : undefined
      }
      label={
        step === 'label'
          ? 'Etiqueta de peso'
          : step === 'adjust'
            ? 'Ajustar producto'
            : step === 'store'
              ? 'Nueva tienda'
              : 'Cerrar compra'
      }
    >
      {step === 'label' ? (
        <LabelScanFlow
          getToken={getToken}
          store={selectedStore || null}
          lineName={
            (labelScan!.from === 'adjust'
              ? labelScan!.draft.name
              : lines[labelScan!.index].name) || 'Producto nuevo'
          }
          lineTotal={null}
          usedOn={labelUsedOn}
          showToast={showToast}
          onUse={applyLabel}
          onManual={() => {
            if (labelScan!.from === 'table') {
              setEditing({ index: labelScan!.index })
            }
            endLabelScan()
          }}
          onCancel={() => endLabelScan()}
        />
      ) : step === 'adjust' ? (
        <AdjustProductSheet
          key={editorKey}
          line={editorDraft!}
          onScanLabel={scanFromEditor}
          isNew={!!editing && 'add' in editing}
          onDone={applyEdit}
          onRemove={removeEditing}
          onBack={() => setEditing(null)}
        />
      ) : step === 'store' ? (
        <NewStoreStep
          backLabel="Cerrar compra"
          onBack={() => setStoreSubsheet(false)}
          onConfirm={confirmNewStore}
        />
      ) : (
        <div className="close-sheet__view">
          <PurchaseSheetHead title="Cerrar compra">
            <StorePill
              options={stores}
              value={selectedStore}
              onSelect={setStore}
              onAddNew={() => setStoreSubsheet(true)}
            />
            {/* A cleared picker keeps the day it had: a close needs one. */}
            <DatePill value={date} onChange={(day) => day && setDate(day)} />
          </PurchaseSheetHead>

          <PurchaseTable className="close-sheet__table">
            <PurchaseTableHead count={included.length} />

            {withSuggestions.map((line, index) => {
              if (!line.included) return null
              const t = lineTotal(line)
              const chip = showsWeightChip({
                store: selectedStore,
                quantity: line.quantity,
                ean: line.ean,
                boughtByWeight: line.bought_by_weight,
              })
              return (
                <PurchaseRow
                  key={line.item_id ?? `new-${index}`}
                  onOpen={() => setEditing({ index })}
                  openVerb="Ajustar"
                  product={
                    <>
                      <span className="close-row__name">{line.name}</span>
                      {line.label && line.price != null && (
                        <span className="close-row__sub">
                          {formatUnitPrice(line.price, 'KILOGRAM')} · de la
                          etiqueta
                        </span>
                      )}
                      {!line.item_id && (
                        <span className="close-row__sub">
                          no estaba en la lista
                        </span>
                      )}
                    </>
                  }
                  // With the chip, the chip takes the quantity's place.
                  qty={chip ? '' : (line.quantity ?? '')}
                  amount={
                    <PurchaseAmount
                      value={t?.value ?? null}
                      suggested={t != null && !t.confirmed}
                    />
                  }
                  chip={
                    chip && (
                      <WeightChip
                        lineName={line.name}
                        onClick={() => startLabelScan(index)}
                      />
                    )
                  }
                />
              )
            })}

            {suggestedCount > 0 && (
              <button
                type="button"
                className="close-action"
                onClick={confirmAllSuggested}
              >
                <span className="close-action__label">
                  Confirmar{' '}
                  {suggestedCount === 1
                    ? 'el precio sugerido'
                    : `los ${suggestedCount} precios sugeridos`}
                </span>
                <span className="close-action__disc close-action__disc--fill">
                  <Check size={15} strokeWidth={2.6} aria-hidden />
                </span>
              </button>
            )}

            <button
              type="button"
              className="close-action"
              onClick={() => setEditing({ add: true })}
            >
              <span className="close-action__label">Añadir producto</span>
              <span className="close-action__disc close-action__disc--ghost">
                <Plus size={15} aria-hidden />
              </span>
            </button>

            <PurchaseTotal value={total} />
            <PurchaseHelp>
              Toca una línea para ajustarla. Lo que dejes sin precio se guarda
              como comprado, sin inventar el importe. Los importes en
              discontinuo son precios de la última compra: no cuentan hasta que
              los confirmas.
            </PurchaseHelp>
          </PurchaseTable>

          <div className="psheet-foot">
            {/* The date always has a value here: it starts as the trip's day. */}
            <MissingToSaveNotice
              store={selectedStore === ''}
              date={false}
              unnamedLines={0}
              // A close settles cart items: hand-added lines alone close
              // nothing.
              nothingToSave={included.some((l) => l.item_id) ? null : 'cart'}
            />
            <SavePurchaseButton
              sum={total}
              saving={saving}
              onClick={save}
              disabled={
                saving ||
                selectedStore === '' ||
                included.filter((l) => l.item_id).length === 0
              }
            />
            <SecondaryButton onClick={() => onScanReceipt?.()}>
              <Receipt size={16} aria-hidden /> Escanear el ticket en su lugar
            </SecondaryButton>
          </div>
        </div>
      )}
    </Sheet>
  )
}
