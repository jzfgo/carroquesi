import { useEffect, useState } from 'react'
import { isOnline } from '../lib/connectivity'
import { formatRowAmount } from '../lib/formatPrice'
import { formatQuantity } from '../lib/formatQuantity'
import { parseQuantityFactor } from '../lib/itemCost'
import { parseInput } from '../lib/parseInput'
import {
  effectiveLineTotal,
  effectivePricePer,
  effectiveQuantity,
  effectiveUnitPrice,
  isDiscountLine,
  isNamed,
  QUANTITY_EPSILON,
  resolutionItemId,
  resolutionName,
  withBrandSigil,
  type LineResolution,
  type LineState,
  type ReceiptLine,
} from '../lib/receiptReview'
import { storeOffer, withExtraStore } from '../lib/storeOffer'
import {
  labelAgrees,
  labelPricePerKg,
  labelQuantity,
  showsWeightChip,
} from '../lib/weighedLabel'
import type {
  BarcodeRead,
  NameMapping,
  NewPurchasedItem,
  PricePatch,
  ReceiptScanResult,
  Suggestion,
} from '../types'
import { LabelScanFlow, type UsedLabel } from './LabelScanFlow'
import { NewStoreStep } from './NewStoreStep'
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
  /** What the record says was bought. A targeted patch overwrites it, so a
   *  line that changes it is a correction even at the same price. */
  purchased_quantity: string | null
  /** A packaged product carries one; a weighed one usually does not. */
  ean: string | null
  /** The product was priced per kilo before, so its label may give a weight. */
  bought_by_weight: boolean
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
  getToken: () => Promise<string>
  showToast: (message: string) => void
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
  /** Catalogue lookup behind the resolve bar's suggestions (the canonical add
   *  bar's machinery, owned by the parent). Absent = no suggestions. */
  onFetchSuggestions?: (q: string) => Promise<Suggestion[]>
  /** The list's registered stores, offered by the store pill. */
  storeOptions?: string[]
  displayStore?: (raw: string) => string
}

const asTyped = (raw: string) => raw

/** Prices that print differently are different; below a céntimo they are not. */
const PRICE_EPSILON = 0.005

/** What the record says was bought, falling back to what was planned. */
function recordedQuantity(item: ItemRef): string | null {
  return item.purchased_quantity ?? item.quantity
}

/**
 * Whether a receipt line and a record agree on how much was bought. Both
 * sides go through the same factor parse, so «202g» and «0.202kg» agree. A
 * side that cannot be read agrees only with another that cannot.
 */
function sameQuantity(
  line: ReceiptLine,
  item: ItemRef,
  state?: LineState,
): boolean {
  const pricePer = effectivePricePer(line, state)
  const fromLine = parseQuantityFactor(effectiveQuantity(line, state), pricePer)
  const fromItem = parseQuantityFactor(recordedQuantity(item), pricePer)
  if (fromLine == null || fromItem == null) return fromLine === fromItem
  return Math.abs(fromLine - fromItem) < QUANTITY_EPSILON
}

/**
 * Whether a receipt line fills, corrects, or merely repeats the record. The
 * patch writes the quantity as well as the price, so a line that changes
 * either one is a correction.
 */
function targetChange(
  line: ReceiptLine,
  item: ItemRef | undefined,
  state?: LineState,
): 'fill' | 'correct' | 'equal' {
  if (!item || item.price == null) return 'fill'
  const samePrice =
    Math.abs(item.price - effectiveUnitPrice(line, state)) < PRICE_EPSILON
  const samePer = (item.price_per ?? null) === effectivePricePer(line, state)
  return samePrice && samePer && sameQuantity(line, item, state)
    ? 'equal'
    : 'correct'
}

/**
 * In a targeted review, the trip line an unmatched receipt line most likely
 * is. The matcher pairs by name, so a line it missed is often a product the
 * trip holds under another name. Only a full match counts as evidence: the
 * missed line may also be a product nobody ticked, and linking it to the
 * wrong line would overwrite a correct price or quantity and lose the new
 * spend. So the guess is the one line the paper repeats exactly (same unit
 * price, same quantity), or none.
 */
function likelyPartner(
  line: ReceiptLine,
  state: LineState | undefined,
  items: ItemRef[],
): string | null {
  const samePrice = items.filter(
    (item) => targetChange(line, item, state) === 'equal',
  )
  return samePrice.length === 1 ? samePrice[0].id : null
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
        !isDiscountLine(m) &&
        (target == null ||
          targetChange(
            m,
            candidateItems.find((it) => it.id === m.item_id),
          ) !== 'equal'),
      resolution: {
        kind: 'matched',
        itemId: m.item_id,
        itemName: m.item_name,
        brand: null,
      },
    })),
    ...result.unmatched.map((u): LineState => ({
      included: !isDiscountLine(u),
      resolution: { kind: 'unassigned' },
    })),
  ]
}

export default function ReceiptScanSheet({
  getToken,
  showToast,
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
  onFetchSuggestions,
  storeOptions = [],
  displayStore = asTyped,
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
  // Stores added by hand through «+ otra», and the «Nueva tienda» step that
  // takes them: a content swap of this same sheet.
  const [extraStores, setExtraStores] = useState<string[]>([])
  const [addingStore, setAddingStore] = useState(false)
  const [resolvingIndex, setResolvingIndex] = useState<number | null>(null)
  const [resolveRadioId, setResolveRadioId] = useState<string | null>(null)
  const [resolveText, setResolveText] = useState('')
  const [resolveEan, setResolveEan] = useState<string | null>(null)
  // The bar opens prefilled (raw OCR text, a barcode's product, a pick), and
  // prefills never search or filter — only what the user actually typed does.
  const [resolveDirty, setResolveDirty] = useState(false)
  const [resolveSuggestions, setResolveSuggestions] = useState<Suggestion[]>([])
  // A weighed-label scan for one line: a third step of the same sheet. It
  // returns to the step it started from.
  const [labelScan, setLabelScan] = useState<{
    index: number
    from: 'review' | 'resolve'
  } | null>(null)

  // Apply a barcode scan handed down by the parent, tracked by identity so the
  // same row can be scanned twice without re-applying on unrelated re-renders
  // (React's "you might not need an effect").
  const [appliedScan, setAppliedScan] = useState<PendingScan>(null)
  if (pendingScan && pendingScan !== appliedScan) {
    setAppliedScan(pendingScan)
    const { index, product } = pendingScan
    setResolveRadioId(null)
    setResolveText(withBrandSigil(product.name, product.brand))
    setResolveEan(product.ean)
    setResolveDirty(false)
    setResolveSuggestions([])
    setResolvingIndex(index)
  }

  // Debounced catalogue lookup for the resolve bar, mirroring the canonical
  // add bar's rhythm: two typed characters and a 300ms pause.
  useEffect(() => {
    if (resolvingIndex == null || !resolveDirty || !onFetchSuggestions) return
    const q = parseInput(resolveText).name.trim()
    const timer = setTimeout(
      async () => {
        if (q.length < 2) {
          setResolveSuggestions([])
          return
        }
        try {
          setResolveSuggestions(await onFetchSuggestions(q))
        } catch {
          // suggestion errors are non-critical
        }
      },
      q.length < 2 ? 0 : 300,
    )
    return () => clearTimeout(timer)
  }, [resolveText, resolveDirty, resolvingIndex, onFetchSuggestions])

  const includedCount = lineStates.filter((ls) => ls.included).length
  // The review's title; its steps' back buttons name it.
  const reviewTitle = targeted
    ? 'Añadir ticket a esta compra'
    : 'Revisar ticket'
  const namedMissing = lineStates.some(
    (ls) => ls.included && !isNamed(ls.resolution),
  )

  const lineSum = allLines.reduce(
    (sum, line, i) => sum + effectiveLineTotal(line, lineStates[i]),
    0,
  )
  const savedSum = lineStates.reduce(
    (sum, ls, i) =>
      ls.included ? sum + effectiveLineTotal(allLines[i], ls) : sum,
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
    if (isDiscountLine(allLines[index])) return
    setLineStates((prev) =>
      prev.map((ls, i) =>
        i === index ? { ...ls, included: !ls.included } : ls,
      ),
    )
  }

  function setAll(included: boolean) {
    setLineStates((prev) =>
      prev.map((ls, i) => ({
        ...ls,
        included: included && !isDiscountLine(allLines[i]),
      })),
    )
  }

  function setLinePrice(index: number, price: number, total: number | null) {
    setLineStates((prev) =>
      prev.map((ls, i) =>
        i === index ? { ...ls, unitPrice: price, lineTotal: total } : ls,
      ),
    )
  }

  function setLineQuantity(index: number, value: string | null) {
    setLineStates((prev) =>
      prev.map((ls, i) =>
        // A quantity change keeps the total, so a typed price no longer holds.
        i === index ? { ...ls, quantity: value, unitPrice: null } : ls,
      ),
    )
  }

  // The product behind a line, as far as the review knows it: a linked or
  // matched item, a line being created, or nothing yet. An unnamed line has
  // no known EAN, so the quantity rule alone decides its chip.
  function lineProduct(ls: LineState): {
    ean: string | null
    boughtByWeight: boolean
  } {
    const r = ls.resolution
    if (r.kind === 'matched' || r.kind === 'linked') {
      const item = candidateItems.find((it) => it.id === r.itemId)
      return {
        ean: item?.ean ?? null,
        boughtByWeight: item?.bought_by_weight ?? false,
      }
    }
    if (r.kind === 'created') return { ean: r.ean, boughtByWeight: false }
    return { ean: null, boughtByWeight: false }
  }

  const weightChips = lineStates.map(
    (ls, i) =>
      ls.included &&
      !isDiscountLine(allLines[i]) &&
      showsWeightChip({
        store,
        quantity: effectiveQuantity(allLines[i], ls),
        ...lineProduct(ls),
      }),
  )

  function startLabelScan(index: number, from: 'review' | 'resolve') {
    // Offline is read-only: the action stays visible and refuses.
    if (!isOnline()) {
      showToast('Sin conexión')
      return
    }
    setLabelScan({ index, from })
  }

  function endLabelScan() {
    if (labelScan?.from === 'review') setResolvingIndex(null)
    setLabelScan(null)
  }

  // With a receipt the line keeps its amount (the paper's, or a total the
  // user corrected) and gains the label's weight. A label that agrees gives
  // its €/kg too; one used despite a mismatch is a weight only, and the
  // €/kg follows from that amount.
  function applyLabel(index: number, { code, label }: UsedLabel) {
    setLineStates((prev) =>
      prev.map((ls, i) =>
        i === index
          ? {
              ...ls,
              quantity: labelQuantity(label.weight_g!),
              unitPrice: labelAgrees(label, effectiveLineTotal(allLines[i], ls))
                ? labelPricePerKg(label)
                : null,
              label: { code, article: label.article },
            }
          : ls,
      ),
    )
    endLabelScan()
  }

  function labelUsedOn(code: string, index: number): string | null {
    const other = lineStates.findIndex(
      (ls, i) => i !== index && ls.included && ls.label?.code === code,
    )
    if (other < 0) return null
    return (
      resolutionName(lineStates[other].resolution) ??
      allLines[other].receipt_name
    )
  }

  function openResolve(index: number) {
    if (isDiscountLine(allLines[index])) return
    const r = lineStates[index].resolution
    if (r.kind === 'linked' || r.kind === 'matched') {
      setResolveRadioId(r.itemId)
      setResolveText('')
      setResolveEan(null)
    } else if (r.kind === 'created') {
      setResolveRadioId(null)
      setResolveText(withBrandSigil(r.name, r.brand))
      setResolveEan(r.ean)
    } else {
      // A targeted review completes a record, so an unmatched line is first
      // a trip line under another name. Creating one would count the product
      // twice, so a likely partner starts selected and «Asignar» links it.
      // Typing a name is how the user insists on a new line.
      const partner = targeted
        ? likelyPartner(
            allLines[index],
            lineStates[index],
            availableItems(index),
          )
        : null
      // An accepted guess repeats the record, so its patch changes nothing,
      // yet the line stays checked: saving it teaches the store's name for
      // this product, so the next scan matches it on its own.
      setResolveRadioId(partner)
      // Otherwise prefill the create bar with the raw line — the best name
      // we have until the user cleans it up.
      setResolveText(partner ? '' : allLines[index].receipt_name)
      setResolveEan(null)
    }
    setResolveDirty(false)
    setResolveSuggestions([])
    setResolvingIndex(index)
  }

  // A picked suggestion is a prefill, not typing: the bar takes the
  // catalogue's spelling and the strip retires until the user types again.
  function pickSuggestion(suggestion: Suggestion) {
    setResolveRadioId(null)
    setResolveText(withBrandSigil(suggestion.name, suggestion.brand))
    setResolveEan(null)
    setResolveDirty(false)
    setResolveSuggestions([])
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
      const quantity = effectiveQuantity(line, ls)
      const pricePer = effectivePricePer(line, ls)
      const r = ls.resolution
      if (r.kind === 'matched' || r.kind === 'linked') {
        patches.push({
          item_id: r.itemId,
          price: effectiveUnitPrice(line, ls),
          price_per: pricePer,
          store,
          quantity,
          article: ls.label?.article ?? null,
        })
      } else if (r.kind === 'created') {
        newItems.push({
          name: r.name,
          brand: r.brand,
          ean: r.ean,
          price: effectiveUnitPrice(line, ls),
          price_per: pricePer,
          store,
          quantity,
          article: ls.label?.article ?? null,
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
          if (targetChange(line, item, lineStates[i]) === 'equal') {
            return 'sin cambios'
          }
          // A correction names what it replaces: the price when that moves,
          // else the quantity, which the patch overwrites too.
          const samePrice =
            Math.abs(item.price - effectiveUnitPrice(line, lineStates[i])) <
              PRICE_EPSILON &&
            (item.price_per ?? null) === effectivePricePer(line, lineStates[i])
          if (!samePrice) return `era € ${formatRowAmount(item.price)}`
          const recorded = recordedQuantity(item)
          if (recorded != null) return `era ${formatQuantity(recorded)}`
          // No quantity on the record: a unit line counts as one, and a
          // weighed line had no weight for the paper to correct.
          return item.price_per === 'KILOGRAM' ? 'completa el peso' : 'era 1 UD'
        }
        if (r.kind === 'created') return 'línea nueva en esta compra'
        return null
      })
    : undefined

  return (
    <Sheet
      className="rss"
      label={
        labelScan
          ? 'Etiqueta de peso'
          : addingStore
            ? 'Nueva tienda'
            : resolving
              ? 'Resolver una línea'
              : targeted
                ? 'Añadir ticket a esta compra'
                : 'Revisar ticket'
      }
      onClose={onClose}
      // On a sub-view, Escape / scrim / swipe go back a step — the back galón
      // is the exit, not a dismissal of the whole sheet.
      onDismiss={
        labelScan
          ? endLabelScan
          : addingStore
            ? () => setAddingStore(false)
            : resolving
              ? () => setResolvingIndex(null)
              : undefined
      }
    >
      {labelScan ? (
        <LabelScanFlow
          getToken={getToken}
          store={store}
          lineName={
            resolutionName(lineStates[labelScan.index].resolution) ??
            allLines[labelScan.index].receipt_name
          }
          lineTotal={effectiveLineTotal(
            allLines[labelScan.index],
            lineStates[labelScan.index],
          )}
          usedOn={(code) => labelUsedOn(code, labelScan.index)}
          showToast={showToast}
          onUse={(used) => applyLabel(labelScan.index, used)}
          onManual={() => {
            const { index, from } = labelScan
            setLabelScan(null)
            if (from === 'review') openResolve(index)
          }}
          onCancel={endLabelScan}
        />
      ) : addingStore ? (
        <NewStoreStep
          backLabel={reviewTitle}
          onBack={() => setAddingStore(false)}
          onConfirm={(added) => {
            setExtraStores((xs) => withExtraStore(xs, added))
            setStore(added)
            setAddingStore(false)
          }}
        />
      ) : resolving ? (
        <ReceiptLineResolveBody
          line={allLines[resolvingIndex]}
          candidateItems={availableItems(resolvingIndex)}
          backLabel={reviewTitle}
          targeted={targeted}
          radioId={resolveRadioId}
          createText={resolveText}
          userEdited={resolveDirty}
          suggestions={resolveSuggestions}
          onPickSuggestion={onFetchSuggestions ? pickSuggestion : undefined}
          onSelectRadio={(id) => {
            setResolveRadioId(id)
          }}
          onChangeCreateText={(text) => {
            setResolveRadioId(null)
            setResolveText(text)
            setResolveDirty(true)
          }}
          onRequestScan={
            onRequestScan ? () => onRequestScan(resolvingIndex) : undefined
          }
          onAssign={assign}
          onBack={() => setResolvingIndex(null)}
          state={lineStates[resolvingIndex]}
          onChangeQuantity={(value) => setLineQuantity(resolvingIndex, value)}
          onChangePrice={(price, total) =>
            setLinePrice(resolvingIndex, price, total)
          }
          onScanLabel={() => startLabelScan(resolvingIndex, 'resolve')}
        />
      ) : (
        <ReceiptReviewBody
          lines={allLines}
          lineStates={lineStates}
          store={store}
          receiptDate={receiptDate}
          targeted={targeted}
          dateLocked={targeted}
          storeLocked={target?.store != null}
          changeNotes={changeNotes}
          priorTotal={target?.total ?? null}
          imageUrl={imageUrl}
          isPdf={isPdf}
          pdfPages={pdfPages}
          storeOptions={storeOffer(
            [
              initialStore,
              ...candidateItems.flatMap((item) => item.stores),
              ...storeOptions,
              ...extraStores,
            ],
            displayStore,
          )}
          lineSum={lineSum}
          savedSum={savedSum}
          receiptTotal={receiptTotal}
          cuadreDiff={cuadreDiff}
          includedCount={includedCount}
          canSave={canSave}
          onToggleInclude={toggleInclude}
          onSetAll={setAll}
          onOpenResolve={openResolve}
          weightChips={weightChips}
          onScanLabel={(index) => startLabelScan(index, 'review')}
          onChangeDate={setReceiptDate}
          onChangeStore={setStore}
          onAddStore={() => setAddingStore(true)}
          onReReadReceipt={onReReadReceipt}
          onConfirm={handleConfirm}
        />
      )}
    </Sheet>
  )
}
