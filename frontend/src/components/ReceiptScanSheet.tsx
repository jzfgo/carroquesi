import { useState } from 'react'
import { formatRowAmount } from '../lib/formatPrice'
import { parseInput } from '../lib/parseInput'
import {
  formatReceiptDate,
  isNamed,
  linePricePer,
  lineTotal,
  quantityString,
  resolutionItemId,
  resolutionName,
  type LineResolution,
  type LineState,
  type ReceiptLine,
} from '../lib/receiptReview'
import type {
  BarcodeRead,
  NameMapping,
  NewPurchasedItem,
  PricePatch,
  ReceiptScanResult,
} from '../types'
import { ReceiptLineResolveBody } from './ReceiptLineResolveBody'
import { ReceiptReviewBody } from './ReceiptReviewBody'
import './ReceiptScanSheet.css'
import { Sheet } from './Sheet'

/** A subset of the list's items, offered as link targets in the resolve sheet. */
export interface ItemRef {
  id: string
  name: string
  purchased: boolean
  purchased_at: string | null
  brand: string | null
  stores: string[]
  quantity: string | null
  /** Current price on the line, so a targeted review can tell a fill from a
   *  correction from a no-op. */
  price: number | null
  price_per: 'KILOGRAM' | null
}

export type ReceiptConfirmMeta = {
  receiptDate: string | null
  store: string | null
}

/**
 * The settled purchase a scan completes (25b targeted attach). Carried from
 * the tapped card's header into the review, where it locks the record's own
 * store and date and turns the line list into fill/correct offers.
 */
export type ReceiptScanTarget = {
  purchaseId: string
  store: string | null
  /** yyyy-mm-dd of the day the trip covered, for the locked date pill. */
  date: string | null
  total: number | null
}

type PendingScan = { index: number; product: BarcodeRead } | null

interface Props {
  result: ReceiptScanResult
  candidateItems: ItemRef[]
  /** The store read from the ticket (or list), seeding the editable control. */
  store: string | null
  /** Set when the scan completes a settled purchase instead of closing a trip. */
  target?: ReceiptScanTarget | null
  /** In-memory object URL of the captured file, for the header thumbnail. */
  imageUrl?: string | null
  /** The source was a PDF: the thumb is a badge and the lightbox pages. */
  isPdf?: boolean
  /** Page count printed on the PDF badge; null when it could not be read. */
  pdfPages?: number | null
  /** Resolves to whether the submit succeeded; false (or a throw) re-enables save. */
  onConfirm: (
    patches: PricePatch[],
    mappings: NameMapping[],
    newItems: NewPurchasedItem[],
    meta: ReceiptConfirmMeta,
  ) => Promise<boolean>
  onClose: () => void
  /** "Volver a leer el ticket" — reopen the source picker for a fresh read. */
  onReReadReceipt: () => void
  pendingScan?: PendingScan
  onRequestScan?: (index: number) => void
}

/** Prices that print differently are different; below a céntimo they are not. */
const PRICE_EPSILON = 0.005

/** Whether a receipt line fills, corrects, or merely repeats the current price. */
function targetChange(
  line: ReceiptLine,
  item: ItemRef | undefined,
): 'fill' | 'correct' | 'equal' {
  if (!item || item.price == null) return 'fill'
  const samePrice = Math.abs(item.price - line.unit_price) < PRICE_EPSILON
  const samePer = (item.price_per ?? null) === linePricePer(line)
  return samePrice && samePer ? 'equal' : 'correct'
}

function initStates(
  result: ReceiptScanResult,
  target: ReceiptScanTarget | null,
  candidateItems: ItemRef[],
): LineState[] {
  return [
    ...result.matched.map((m): LineState => ({
      // In a targeted review a line that repeats the recorded price writes
      // nothing, so it starts unchecked and the save counts stay honest.
      included:
        target == null ||
        targetChange(
          m,
          candidateItems.find((it) => it.id === m.item_id),
        ) !== 'equal',
      resolution: {
        kind: 'matched',
        itemId: m.item_id,
        itemName: m.item_name,
        brand: null,
      },
    })),
    ...result.unmatched.map((): LineState => ({
      included: true,
      resolution: { kind: 'unassigned' },
    })),
  ]
}

export default function ReceiptScanSheet({
  result,
  candidateItems,
  store: initialStore,
  target = null,
  imageUrl,
  isPdf = false,
  pdfPages = null,
  onConfirm,
  onClose,
  onReReadReceipt,
  pendingScan,
  onRequestScan,
}: Props) {
  const allLines: ReceiptLine[] = [...result.matched, ...result.unmatched]
  const targeted = target != null

  const [lineStates, setLineStates] = useState<LineState[]>(() =>
    initStates(result, target, candidateItems),
  )
  const [submitted, setSubmitted] = useState(false)
  // A targeted review speaks for a written record: its day and store are the
  // record's own, not the parse's, and stay locked below.
  const [receiptDate, setReceiptDate] = useState<string | null>(
    target?.date ?? result.receipt_date ?? null,
  )
  const [store, setStore] = useState<string | null>(
    target?.store ?? initialStore ?? null,
  )

  // The resolve sheet (13b) is a sub-view, not a second Sheet: `resolvingIndex`
  // swaps the body inside the same panel. Its draft (radio pick XOR create text)
  // lives here so a barcode scan — which round-trips through the parent — can
  // land in the create bar.
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null)
  const [resolveRadioId, setResolveRadioId] = useState<string | null>(null)
  const [resolveText, setResolveText] = useState('')
  const [resolveEan, setResolveEan] = useState<string | null>(null)

  // Apply a barcode scan handed down by the parent, tracked by identity so the
  // same row can be scanned twice without re-applying on unrelated re-renders
  // (React's "you might not need an effect").
  const [appliedScan, setAppliedScan] = useState<PendingScan>(null)
  if (pendingScan && pendingScan !== appliedScan) {
    setAppliedScan(pendingScan)
    const { index, product } = pendingScan
    setResolveRadioId(null)
    setResolveText(
      product.brand ? `${product.name} #${product.brand}` : product.name,
    )
    setResolveEan(product.ean)
    setResolvingIndex(index)
  }

  const includedCount = lineStates.filter((ls) => ls.included).length
  const unnamedCount = lineStates.filter((ls) => !isNamed(ls.resolution)).length
  const namedMissing = lineStates.some(
    (ls) => ls.included && !isNamed(ls.resolution),
  )

  const lineSum = allLines.reduce((sum, line) => sum + lineTotal(line), 0)
  const savedSum = lineStates.reduce(
    (sum, ls, i) => (ls.included ? sum + lineTotal(allLines[i]) : sum),
    0,
  )
  const receiptTotal = result.receipt_total ?? null
  // Positive → the lines overshoot the paper (sobran); negative → they fall
  // short (faltan). Never auto-adjusted; the paper is the arbiter.
  const cuadreDiff = receiptTotal != null ? lineSum - receiptTotal : null

  const canSave =
    includedCount > 0 &&
    receiptDate != null &&
    store != null &&
    !namedMissing &&
    !submitted

  // A given item may be linked to at most one row; hide it from the others.
  const linkedItemIds = new Set(
    lineStates.map((ls) => resolutionItemId(ls.resolution)).filter(Boolean),
  )
  function availableItems(currentIndex: number): ItemRef[] {
    const current = resolutionItemId(lineStates[currentIndex]?.resolution)
    return candidateItems.filter(
      (item) => !linkedItemIds.has(item.id) || item.id === current,
    )
  }

  function setResolution(index: number, resolution: LineResolution) {
    setLineStates((prev) =>
      prev.map((ls, i) => (i === index ? { ...ls, resolution } : ls)),
    )
  }

  function toggleInclude(index: number) {
    setLineStates((prev) =>
      prev.map((ls, i) =>
        i === index ? { ...ls, included: !ls.included } : ls,
      ),
    )
  }

  function setAll(included: boolean) {
    setLineStates((prev) => prev.map((ls) => ({ ...ls, included })))
  }

  function openResolve(index: number) {
    const r = lineStates[index].resolution
    if (r.kind === 'linked' || r.kind === 'matched') {
      setResolveRadioId(r.itemId)
      setResolveText('')
      setResolveEan(null)
    } else if (r.kind === 'created') {
      setResolveRadioId(null)
      setResolveText(r.brand ? `${r.name} #${r.brand}` : r.name)
      setResolveEan(r.ean)
    } else {
      setResolveRadioId(null)
      // Prefill the create bar with the raw line — the best name we have until
      // the user cleans it up.
      setResolveText(allLines[index].receipt_name)
      setResolveEan(null)
    }
    setResolvingIndex(index)
  }

  function assign() {
    if (resolvingIndex == null) return
    if (resolveRadioId) {
      const item = candidateItems.find((it) => it.id === resolveRadioId)
      if (item) {
        setResolution(resolvingIndex, {
          kind: 'linked',
          itemId: item.id,
          itemName: item.name,
          brand: item.brand,
        })
      }
    } else {
      const parsed = parseInput(resolveText)
      const name = parsed.name.trim()
      if (!name) return
      setResolution(resolvingIndex, {
        kind: 'created',
        name,
        brand: parsed.brand,
        ean: parsed.ean ?? resolveEan,
      })
    }
    setResolvingIndex(null)
  }

  async function handleConfirm() {
    if (!canSave) return
    setSubmitted(true)

    const patches: PricePatch[] = []
    const newItems: NewPurchasedItem[] = []
    const mappings: NameMapping[] = []

    lineStates.forEach((ls, i) => {
      if (!ls.included) return
      const line = allLines[i]
      const quantity = quantityString(line)
      const pricePer = linePricePer(line)
      const r = ls.resolution
      if (r.kind === 'matched' || r.kind === 'linked') {
        patches.push({
          item_id: r.itemId,
          price: line.unit_price,
          price_per: pricePer,
          store,
          quantity,
        })
      } else if (r.kind === 'created') {
        newItems.push({
          name: r.name,
          brand: r.brand,
          ean: r.ean,
          price: line.unit_price,
          price_per: pricePer,
          store,
          quantity,
        })
      }
      const itemName = resolutionName(r)
      // Raw receipt text on the wire; the backend derives the lookup keys. Store
      // is required to save, so the mapping always has one.
      if (itemName && store) {
        mappings.push({
          store,
          receipt_name: line.receipt_name,
          item_name: itemName,
          item_brand: null,
        })
      }
    })

    try {
      const ok = await onConfirm(patches, mappings, newItems, {
        receiptDate,
        store,
      })
      if (!ok) setSubmitted(false)
    } catch {
      setSubmitted(false)
    }
  }

  const resolving = resolvingIndex != null

  // What each saved line does to the record, told next to the product name:
  // fill a hole, correct a figure (with the old one), or repeat it (no-op).
  const changeNotes = targeted
    ? allLines.map((line, i) => {
        const r = lineStates[i].resolution
        if (r.kind === 'matched' || r.kind === 'linked') {
          const item = candidateItems.find((it) => it.id === r.itemId)
          if (!item || item.price == null) return 'completa el precio'
          return targetChange(line, item) === 'equal'
            ? 'sin cambios'
            : `era € ${formatRowAmount(item.price)}`
        }
        if (r.kind === 'created') return 'línea nueva en esta compra'
        return null
      })
    : undefined

  return (
    <Sheet
      className="rss"
      label={
        resolving
          ? 'Resolver una línea'
          : targeted
            ? 'Añadir ticket a esta compra'
            : 'Revisar ticket'
      }
      onClose={onClose}
      // On the resolve sub-view, Escape / scrim / swipe go back to the list —
      // the back galón is the exit, not a dismissal of the whole sheet.
      onDismiss={resolving ? () => setResolvingIndex(null) : undefined}
    >
      {resolving ? (
        <ReceiptLineResolveBody
          line={allLines[resolvingIndex]}
          candidateItems={availableItems(resolvingIndex)}
          backLabel={targeted ? 'Añadir ticket a esta compra' : undefined}
          radioId={resolveRadioId}
          createText={resolveText}
          onSelectRadio={(id) => {
            setResolveRadioId(id)
          }}
          onChangeCreateText={(text) => {
            setResolveRadioId(null)
            setResolveText(text)
          }}
          onRequestScan={
            onRequestScan ? () => onRequestScan(resolvingIndex) : undefined
          }
          onAssign={assign}
          onBack={() => setResolvingIndex(null)}
        />
      ) : (
        <ReceiptReviewBody
          lines={allLines}
          lineStates={lineStates}
          store={store}
          receiptDate={receiptDate}
          receiptDateLabel={formatReceiptDate(receiptDate)}
          targeted={targeted}
          dateLocked={targeted}
          storeLocked={target?.store != null}
          changeNotes={changeNotes}
          priorTotal={target?.total ?? null}
          imageUrl={imageUrl}
          isPdf={isPdf}
          pdfPages={pdfPages}
          knownStores={knownStores(candidateItems, initialStore)}
          lineSum={lineSum}
          savedSum={savedSum}
          receiptTotal={receiptTotal}
          cuadreDiff={cuadreDiff}
          includedCount={includedCount}
          unnamedCount={unnamedCount}
          canSave={canSave}
          onToggleInclude={toggleInclude}
          onSetAll={setAll}
          onOpenResolve={openResolve}
          onChangeDate={setReceiptDate}
          onChangeStore={setStore}
          onReReadReceipt={onReReadReceipt}
          onConfirm={handleConfirm}
        />
      )}
    </Sheet>
  )
}

/** Distinct store names already known to the list, for the store control's list. */
function knownStores(
  candidateItems: ItemRef[],
  initialStore: string | null,
): string[] {
  const set = new Set<string>()
  if (initialStore) set.add(initialStore)
  for (const item of candidateItems) {
    for (const s of item.stores) if (s) set.add(s)
  }
  return [...set]
}
