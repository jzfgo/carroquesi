import { Camera, ChevronRight, Image, Receipt } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'
import { useBoard } from '../hooks/useBoard'
import { useIsOffline } from '../hooks/useIsOffline'
import { filterItems } from '../hooks/useItemFilter'
import { useListItems } from '../hooks/useListItems'
import { useListSeen } from '../hooks/useListSeen'
import { useOwnBrandInference } from '../hooks/useOwnBrandInference'
import { usePurchases } from '../hooks/usePurchases'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { useQueueDrain } from '../hooks/useQueueDrain'
import { useTearOff } from '../hooks/useTearOff'
import {
  ApiError,
  closePurchase,
  deleteList,
  getBarcode,
  getDueSuggestions,
  getSuggestions,
  setDefaultList,
  submitParsedReceipt,
  updateList,
} from '../lib/api'
import {
  buildLines,
  productUnsettled,
  receiptToLines,
  type CloseLine,
} from '../lib/closeLines'
import { isDismissed, writeDismissal } from '../lib/dismissedSuggestions'
import { FLAGS } from '../lib/featureFlags'
import { computeCostSummary } from '../lib/itemCost'
import { itemState } from '../lib/itemState'
import { getLastPriceStore, setLastPriceStore } from '../lib/lastPriceStore'
import { isNetworkError } from '../lib/networkError'
import { enqueue } from '../lib/offlineQueue'
import { parseInput } from '../lib/parseInput'
import { canReceivePush, enablePush, permissionState } from '../lib/push'
import { parseReceiptWithAi } from '../lib/receiptAi'
import type {
  BarcodeRead,
  DueSuggestion,
  EditingTag,
  PurchaseClosePayload,
  PurchaseNameMapping,
  Suggestion,
  TagField,
} from '../types'
import { AdjustItemSheet } from './AdjustItemSheet'
import { BarcodeScanner } from './BarcodeScanner'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import { CloseTripSheet, type CloseReceipt } from './CloseTripSheet'
import { DueSuggestionsSheet } from './DueSuggestionsSheet'
import { FilterBar } from './FilterBar'
import { ItemDetailSheet } from './ItemDetailSheet'
import { ItemList } from './ItemList'
import { ListActionSheet } from './ListActionSheet'
import { ListHeader } from './ListHeader'
import './ListScreen.css'
import LogPurchaseSheet from './LogPurchaseSheet'
import { NotificationPrimingCard } from './NotificationPrimingCard'
import { ProgressBar } from './ProgressBar'
import { ResolveLineSheet } from './ResolveLineSheet'
import { SmartInputBar } from './SmartInputBar'
import { StoreEditSheet } from './StoreEditSheet'
import { TagEditSheet } from './TagEditSheet'
import { Toast } from './Toast'

interface Props {
  listId: string
  listName: string
  listEmoji?: string | null
  listOwnerId: string
  isDefault?: boolean
  onRename?: (newName: string) => void
  onEmojiChanged?: (emoji: string | null) => void
  onSetDefault?: (isDefault: boolean) => void
  onBack?: () => void
}

/**
 * The instant the paper printed, written the way every stored instant is:
 * naive UTC.
 *
 * A scan answers with the printed moment and the offset that places it, which
 * is what the match window needs on the wire. Below the API nothing carries an
 * offset, so it is converted once, here, where the two meet. Null when the
 * scan read no date — the sheet then asks for one.
 */
function printedInstant(receiptDate: string | null): string | null {
  if (!receiptDate) return null
  const at = new Date(receiptDate)
  return Number.isNaN(at.getTime()) ? null : at.toISOString().slice(0, 19)
}

/**
 * The rows of a close sheet no printed line has taken yet.
 *
 * These are what a line the matcher could not place may be answered with, and
 * the row that answer takes over is one of them. One rule, because the two
 * have to agree: an answer picked from a row that is not here would leave the
 * product on the ticket twice.
 */
function freeRows(lines: CloseLine[]): CloseLine[] {
  return lines.filter((l) => l.itemId != null && l.receiptLine == null)
}

type EanLookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; product: BarcodeRead }
  | { status: 'error'; message: string }

export function ListScreen({
  listId,
  listName,
  listEmoji = null,
  listOwnerId,
  isDefault = false,
  onRename,
  onEmojiChanged,
  onSetDefault,
  onBack,
}: Props) {
  const { getToken, user } = useAuth()
  const [localListName, setLocalListName] = useState(listName)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets optimistic local title when polling confirms external rename
    setLocalListName(listName)
  }, [listName])
  const [localEmoji, setLocalEmoji] = useState(listEmoji)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets optimistic local emoji when polling confirms an external change
    setLocalEmoji(listEmoji)
  }, [listEmoji])
  const [localIsDefault, setLocalIsDefault] = useState(isDefault)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: syncs optimistic default flag when the route's list data refreshes
    setLocalIsDefault(isDefault)
  }, [isDefault])
  const { isEnabled } = useFeatureFlags()
  const { isIOS, isInstalled } = usePWAInstall()
  // Resets the push unseen watermark and clears this list's tray notifications
  // whenever the list is actually on screen.
  useListSeen(listId, getToken)
  const { isOffline } = useIsOffline()
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState<EditingTag | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'chips' | 'search'>('chips')
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scannedProduct, setScannedProduct] = useState<BarcodeRead | null>(null)
  const [dueSuggestions, setDueSuggestions] = useState<DueSuggestion[]>([])
  const [dueSuggestionsOpen, setDueSuggestionsOpen] = useState(false)
  const [logPriceFor, setLogPriceFor] = useState<{
    itemId: string
    initialAmount: number | null
    initialPricePer: 'KILOGRAM' | null
    initialStore: string | null
    suggestedStore: string | null
  } | null>(null)

  const handleDueSuggestionsClose = useCallback(
    () => setDueSuggestionsOpen(false),
    [],
  )

  const handleRename = useCallback(
    async (listId: string, newName: string) => {
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
      const previous = localListName
      setLocalListName(newName)
      setMenuOpen(false)
      try {
        await updateList(getToken, listId, { name: newName })
        onRename?.(newName)
      } catch {
        setLocalListName(previous)
        setToast('No se pudo renombrar la lista')
      }
    },
    [getToken, isOffline, localListName, onRename],
  )

  const handleEmojiChange = useCallback(
    async (emoji: string | null) => {
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
      const previous = localEmoji
      setLocalEmoji(emoji)
      try {
        await updateList(getToken, listId, { emoji })
        // Same upward notification the rename and the default flag make: the
        // route holds the list it handed us, and leaving its copy stale here
        // and nowhere else is the kind of asymmetry that reads as deliberate
        // and is not.
        onEmojiChanged?.(emoji)
      } catch {
        setLocalEmoji(previous)
        setToast('No se pudo cambiar el emoji')
      }
    },
    [getToken, isOffline, listId, localEmoji, onEmojiChanged],
  )

  const handleSetDefault = useCallback(async () => {
    if (isOffline) {
      setToast('No disponible sin conexión')
      return
    }
    setLocalIsDefault(true)
    setMenuOpen(false)
    try {
      await setDefaultList(getToken, listId)
      onSetDefault?.(true)
    } catch {
      setLocalIsDefault(false)
      setToast('No se pudo marcar como predeterminada')
    }
  }, [getToken, isOffline, listId, onSetDefault])

  const handleDelete = useCallback(
    async (listId: string) => {
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
      try {
        await deleteList(getToken, listId)
        setMenuOpen(false)
        onBack?.()
      } catch {
        setToast('No se pudo eliminar la lista')
      }
    },
    [getToken, onBack, isOffline],
  )

  const [eanLookup, setEanLookup] = useState<EanLookupState>({
    status: 'idle',
  })
  const eanRequestIdRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [receiptUploading, setReceiptUploading] = useState(false)
  const [receiptSourcePickerOpen, setReceiptSourcePickerOpen] = useState(false)
  const currentUserId = user!.id
  const [board] = useBoard(currentUserId, listId)
  const isOwner = listOwnerId === currentUserId

  const parsed = useMemo(() => parseInput(inputValue), [inputValue])
  const {
    visibleChip,
    storeToAdd,
    dismiss: dismissInferredStore,
  } = useOwnBrandInference(parsed.brand, parsed.stores)
  const {
    status,
    items,
    members,
    togglePurchased,
    addItem,
    updateTag,
    updateStores,
    renameItem,
    removeItem,
    savePrice,
    clearItemPrice,
    retry,
  } = useListItems(listId, getToken, setToast)

  // Wakes the screen at each trip's tear-off instant. Without this, the cart
  // does not visibly empty at midnight until something else causes a
  // re-render — itemState's clock comparison never fires on its own.
  // Passed the unfiltered `items` rather than `filteredItems` because
  // ProgressBar also reads unfiltered items and would otherwise go stale for
  // a trip hidden by the current filter.
  //
  // `now` is the clock every itemState call below is read against, and it is
  // in those memos' dependency lists. Waking the screen is only half of it:
  // a memo keyed on `items` alone cache-hits straight through the boundary,
  // because at a tear-off no item changes — only the time does.
  const now = useTearOff(items)

  const { byId: purchasesById, refresh: refreshPurchases } = usePurchases(
    listId,
    getToken,
  )

  // Which trip the close sheet is writing down. A null purchaseId means the
  // one still open, which is what the cart's own stamp opens.
  const [closingTrip, setClosingTrip] = useState<{
    purchaseId: string | null
  } | null>(null)
  // The paper the close sheet was filled in from, and the rows it produced.
  // The two arrive together from one scan and go together, so they are one
  // piece of state.
  const [ticket, setTicket] = useState<{
    receipt: CloseReceipt
    lines: CloseLine[]
  } | null>(null)
  // The printed lines somebody has named a product for, so far. This is what
  // teaches the app a name: the same string arrives resolved on the next
  // ticket from that shop.
  const [mappings, setMappings] = useState<PurchaseNameMapping[]>([])
  const [editingLine, setEditingLine] = useState<{
    line: CloseLine
    // Every row of the sheet, so the resolve sheet can offer the free ones.
    lines: CloseLine[]
    apply: (next: CloseLine, claimed?: string) => void
  } | null>(null)

  // A trip only changes as part of an item write, so the items' own refresh is
  // the signal. No second poll. The item hook keeps the array's identity when
  // a poll finds nothing new, so this does not fire every five seconds.
  useEffect(() => {
    refreshPurchases()
  }, [items, refreshPurchases])

  // Where this household has shopped before, newest first. Suggestions only —
  // nothing is preselected, because the app does not know where you went.
  const storeSuggestions = useMemo(() => {
    const byNewest = [...items].sort((a, b) =>
      (b.purchased_at ?? '').localeCompare(a.purchased_at ?? ''),
    )
    const seen: string[] = []
    for (const item of byNewest) {
      if (item.price_store && !seen.includes(item.price_store)) {
        seen.push(item.price_store)
      }
    }
    return seen.slice(0, 4)
  }, [items])

  // The list's live trip, if the read has landed.
  const openTrip = useMemo(
    () =>
      [...purchasesById.values()].find(
        (p) => p.closed_at === null && Date.parse(`${p.tears_off_at}Z`) > now,
      ),
    [purchasesById, now],
  )

  // The trip being closed knows its own day, so the date comes from the trip
  // rather than from the clock. Only a trip nobody has recorded falls back to
  // now.
  const closingDefaultDate = useMemo(() => {
    if (!closingTrip) return ''
    const named =
      closingTrip.purchaseId === null
        ? undefined
        : purchasesById.get(closingTrip.purchaseId)
    // Nothing known about a trip: the whole shop happened offline, so no trip
    // exists server-side yet. The taps still carry their own instants, and the
    // earliest of them is when this shop started. Reading the clock instead
    // would date the sheet by when it was *opened* — shop at 23:40, sit down
    // at 00:05, and the close asks the server for a day the lines are not in.
    // Only the rows this sheet holds. The items endpoint returns the list's
    // whole history — every filed ticket's lines are still in here, which is
    // what the receipt sheets below are drawn from — so scanning all of them
    // would date tonight's shop from one months ago, and the server would then
    // clamp that to a third day again.
    const earliestTap = items
      .filter((i) => itemState(i, now) === 'cart')
      .map((i) => i.purchased_at)
      .filter((at): at is string => at !== null)
      .sort()[0]
    return (
      named?.opened_at ??
      openTrip?.opened_at ??
      earliestTap ??
      new Date(now).toISOString().slice(0, 19)
    )
  }, [closingTrip, purchasesById, openTrip, items, now])

  // Puts the close sheet away with everything it was holding. The photograph
  // is an object URL over the file that was picked, and the browser keeps the
  // whole image in memory until it is let go.
  const dismissCloseSheet = useCallback(() => {
    if (ticket) URL.revokeObjectURL(ticket.receipt.imageUrl)
    setTicket(null)
    setMappings([])
    setClosingTrip(null)
  }, [ticket])

  const handleCloseTrip = useCallback(
    async (unnamed: PurchaseClosePayload) => {
      // Name the trip even when closing the one that is open.
      //
      // A null purchase_id means "whichever trip is open when the server
      // reads this", and the queue exists precisely so the server reads it
      // later. Shop at 23:40 with no signal, reconnect after midnight, and
      // that cart has torn off: the server finds no open trip, or finds
      // today's and refuses lines belonging to last night's. Either way the
      // op is dropped and the whole shop goes with it.
      //
      // Naming it here pins the answer to the moment the household pressed
      // the button, and a torn-off trip that nobody filed is exactly what
      // close() was taught to accept in this phase. Online this resolves to
      // the same row it would have found anyway.
      //
      // The sheet's *rows* still come from cart state, not from this id: an
      // item tapped offline has no purchase_id yet, and matching on one would
      // drop it from the very sheet meant to rescue it.
      const payload: PurchaseClosePayload =
        unnamed.purchase_id == null && openTrip
          ? { ...unnamed, purchase_id: openTrip.id }
          : unnamed
      try {
        await closePurchase(getToken, listId, payload)
      } catch (err) {
        if (!isNetworkError(err)) {
          // The sheet stays up. Its rows are seeded once and live in its own
          // state, so closing it here would throw away every price typed,
          // every quantity corrected and every product added by hand — for a
          // reason the household can do nothing about. Leaving it open costs
          // one more tap and keeps the shop.
          setToast('No se pudo guardar la compra')
          return
        }
        // Principle 3: never lose a write. The sheet is the whole shop, and
        // the phone is most likely offline in the aisle where it was filled
        // in, so it waits in the queue instead of being refused.
        try {
          await enqueue({ listId, type: 'closePurchase', payload })
        } catch {
          // No queue either — private browsing, or no quota left. Say so and
          // leave the sheet up, because it is now the only copy of the shop.
          setToast('No se pudo guardar la compra')
          return
        }
        dismissCloseSheet()
        setToast('Se guardará cuando vuelva la conexión')
        return
      }
      dismissCloseSheet()
      retry()
      refreshPurchases()
    },
    [getToken, listId, openTrip, retry, refreshPurchases, dismissCloseSheet],
  )

  const { pendingCount } = useQueueDrain({
    listId,
    getToken,
    onDrained: retry,
    showToast: setToast,
  })

  // Debounced suggestions — only when name has 2+ chars
  useEffect(() => {
    const q = parsed.name.trim()
    const timer = setTimeout(
      async () => {
        if (q.length < 2) {
          setSuggestions([])
          return
        }
        try {
          const data = await getSuggestions(getToken, q)
          setSuggestions(data)
        } catch {
          // suggestion errors are non-critical
        }
      },
      q.length < 2 ? 0 : 300,
    )
    return () => clearTimeout(timer)
  }, [parsed.name, getToken])

  useEffect(() => {
    void getDueSuggestions(getToken, listId)
      .then(setDueSuggestions)
      .catch(() => {
        /* non-critical */
      })
  }, [listId, getToken])

  const handleReceiptScan = useCallback(() => {
    setReceiptSourcePickerOpen(true)
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      if (file.size > 10 * 1024 * 1024) {
        setToast('El archivo es demasiado grande (máx. 10 MB)')
        return
      }
      setReceiptUploading(true)
      try {
        const parsed = await parseReceiptWithAi(file)
        const result = await submitParsedReceipt(getToken, listId, parsed)
        // Reading a paper again replaces every row, so the old photograph and
        // the answers given about its lines go with them.
        if (ticket) URL.revokeObjectURL(ticket.receipt.imageUrl)
        setTicket({
          receipt: {
            scanId: result.scan_id,
            imageUrl: URL.createObjectURL(file),
            total: result.receipt_total,
            store: result.store,
            date: printedInstant(result.receipt_date),
          },
          lines: receiptToLines(
            result,
            buildLines(items, now, closingTrip?.purchaseId ?? null),
          ),
        })
        setMappings([])
        // A scan from the list, rather than from a sheet already open, closes
        // the trip that is still open.
        setClosingTrip((trip) => trip ?? { purchaseId: null })
      } catch (e) {
        console.error('Receipt scan failed:', e)
        setToast('No se pudo leer el ticket')
      } finally {
        setReceiptUploading(false)
      }
    },
    [getToken, listId, items, now, closingTrip, ticket],
  )

  // Which product a printed line was. Answering it also teaches the app the
  // name, so the same string arrives resolved on the next ticket.
  const handleResolveLine = useCallback(
    (next: CloseLine) => {
      if (!editingLine) return
      // The answer may be a row that was still waiting, and that row goes.
      // Only a row that names an item can be claimed, so an answer with no
      // item is a product being created rather than one taken over.
      const claimed = next.itemId
        ? freeRows(editingLine.lines).find((l) => l.itemId === next.itemId)
        : undefined
      editingLine.apply(next, claimed?.key)
      const printed = next.receiptLine
      if (printed && next.name) {
        // As printed. The server keys these its own way, and doing it here as
        // well is how the two spellings drift apart.
        setMappings((prev) => [
          ...prev.filter((m) => m.receipt_name !== printed),
          {
            receipt_name: printed,
            item_name: next.name,
            item_brand: next.brand,
          },
        ])
      }
      setEditingLine(null)
    },
    [editingLine],
  )

  const handleTogglePurchased = useCallback(
    (itemId: string) => {
      void togglePurchased(itemId)
    },
    [togglePurchased],
  )

  const handleTagClick = useCallback(
    (itemId: string, field: TagField | 'stores') => {
      setEditingTag({ itemId, field })
    },
    [],
  )

  const handleItemMenuOpen = useCallback((itemId: string) => {
    setActiveItemId(itemId)
  }, [])

  const handleCloneItem = useCallback(
    (itemId: string) => {
      const activeItem = items.find((i) => i.id === itemId)
      if (!activeItem) return
      void addItem({
        name: activeItem.name,
        brand: activeItem.brand,
        stores: activeItem.stores,
        quantity: activeItem.quantity,
        ean: activeItem.ean,
      })
    },
    [items, addItem],
  )

  const handleMenuToggle = useCallback(() => {
    setMenuOpen((prev) => !prev)
  }, [])

  const handleChange = useCallback((value: string) => {
    eanRequestIdRef.current++
    setEanLookup({ status: 'idle' })
    setInputValue(value)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!parsed.name.trim()) return
    const stores = storeToAdd
      ? [...new Set([...parsed.stores, storeToAdd])]
      : parsed.stores
    void addItem({ ...parsed, stores })
    setInputValue('')
  }, [parsed, addItem, storeToAdd])

  const handleInputSuggestionAdd = useCallback(
    (suggestion: Suggestion) => {
      void addItem({
        name: suggestion.name,
        brand: suggestion.brand,
        stores: suggestion.stores,
        quantity: null,
      })
      setInputValue('')
      setSuggestions([])
    },
    [addItem],
  )

  const handleScanRequest = useCallback(() => {
    setScanning(true)
  }, [])

  const handleScanResult = useCallback((product: BarcodeRead) => {
    setScanning(false)
    setScannedProduct(product)
  }, [])

  const handleScanError = useCallback((message: string) => {
    setScanning(false)
    setToast(message)
  }, [])

  const handleScanAdd = useCallback(
    (item: { name: string; brand: string | null; stores: string[] }) => {
      const ean = scannedProduct?.ean ?? null
      setScannedProduct(null)
      void addItem({
        name: item.name,
        brand: item.brand,
        stores: item.stores,
        quantity: null,
        ean,
      })
    },
    [addItem, scannedProduct],
  )

  const handleOpenLogPrice = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId)
      setLogPriceFor({
        itemId,
        initialAmount: item?.price ?? null,
        initialPricePer: (item?.price_per as 'KILOGRAM' | null) ?? null,
        initialStore: item?.price_store ?? item?.stores?.[0] ?? null,
        suggestedStore: item?.stores?.length ? null : getLastPriceStore(),
      })
    },
    [items],
  )

  const handleSavePrice = useCallback(
    async (
      amount: number,
      pricePer: 'KILOGRAM' | null,
      store: string | null,
      purchasedQuantity: string | null,
    ) => {
      if (!logPriceFor) return
      try {
        await savePrice(
          logPriceFor.itemId,
          amount,
          pricePer,
          store,
          purchasedQuantity,
        )
        if (store) setLastPriceStore(store)
      } catch {
        // non-critical
      }
      setLogPriceFor(null)
      setActiveItemId(null)
    },
    [logPriceFor, savePrice],
  )

  const handleDeletePrice = useCallback(async () => {
    if (!logPriceFor) return
    try {
      await clearItemPrice(logPriceFor.itemId)
      setLogPriceFor(null)
      setActiveItemId(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // price already gone — treat as success, close sheet
        setLogPriceFor(null)
        setActiveItemId(null)
      } else if (err instanceof ApiError && err.status === 422) {
        // Not "otro día" any more: the backend's 422 fires when the item's
        // trip has been filed, which is midnight by default but is 18:40 the
        // moment someone taps "Cerrar compra". Same wording as the
        // un-purchase toast, because it is the same rule.
        setToast('No se puede eliminar el precio de una compra ya archivada')
        throw err
      } else {
        setToast('No se pudo eliminar el precio')
        throw err
      }
    }
  }, [logPriceFor, clearItemPrice])

  const handleScanEdit = useCallback((prefill: string) => {
    setScannedProduct(null)
    setInputValue(prefill)
  }, [])

  const handleEanSearch = useCallback(
    async (ean: string) => {
      const requestId = ++eanRequestIdRef.current
      setEanLookup({ status: 'loading' })
      try {
        const product = await getBarcode(getToken, ean)
        if (requestId !== eanRequestIdRef.current) return
        setEanLookup({ status: 'found', product })
      } catch (err) {
        if (requestId !== eanRequestIdRef.current) return
        if (err instanceof ApiError && err.status === 404) {
          setEanLookup({ status: 'error', message: 'Código no encontrado' })
        } else {
          setEanLookup({ status: 'error', message: 'Error de conexión' })
        }
      }
    },
    [getToken],
  )

  const handleClear = useCallback(() => {
    eanRequestIdRef.current++
    setEanLookup({ status: 'idle' })
    setInputValue('')
  }, [])

  const handleEanAdd = useCallback(
    (item: { name: string; brand: string | null; stores: string[] }) => {
      const ean = eanLookup.status === 'found' ? eanLookup.product.ean : null
      setEanLookup({ status: 'idle' })
      setInputValue('')
      void addItem({
        name: item.name,
        brand: item.brand,
        stores: item.stores,
        quantity: null,
        ean,
      })
    },
    [addItem, eanLookup],
  )

  const handleEanEdit = useCallback((prefill: string) => {
    setEanLookup({ status: 'idle' })
    setInputValue(prefill)
  }, [])

  const handleSuggestionAdd = useCallback(
    (s: DueSuggestion) => {
      void addItem({
        name: s.name,
        brand: s.brand,
        stores: s.stores,
        quantity: s.avg_quantity !== null ? String(s.avg_quantity) : null,
      })
      setDueSuggestions((prev) => prev.filter((x) => x.name !== s.name))
    },
    [addItem],
  )

  const handleSuggestionDismiss = useCallback((s: DueSuggestion) => {
    writeDismissal(s.name, s.dismissal_ttl_days)
    setDueSuggestions((prev) => prev.filter((x) => x.name !== s.name))
  }, [])

  // The bar measures this trip: what is still to find, and what is already in
  // the cart. Settled purchases from earlier days are not part of it — they
  // tore off with the stub. The cart rule lives in lib/itemState and nowhere
  // else, so the day boundary is local midnight rather than UTC's.
  const { purchasedCount, totalCount } = useMemo(() => {
    let purchased = 0
    let total = 0
    for (const i of items) {
      const state = itemState(i, now)
      if (state === 'pending') {
        total++
      } else if (state === 'cart') {
        purchased++
        total++
      }
    }
    return { purchasedCount: purchased, totalCount: total }
  }, [items, now])

  const stores = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of items.filter((i) => !i.purchased)) {
      for (const s of item.stores) {
        if (!seen.has(s)) {
          seen.add(s)
          result.push(s)
        }
      }
    }
    return result.sort()
  }, [items])

  const filteredItems = useMemo(
    () =>
      filterItems(items, filterQuery, { strictStore: filterMode === 'search' }),
    [items, filterQuery, filterMode],
  )
  const allUnpurchasedCount = useMemo(
    () => items.filter((i) => !i.purchased).length,
    [items],
  )

  const filteredDueSuggestions = useMemo(
    () => dueSuggestions.filter((s) => !isDismissed(s.name)),
    [dueSuggestions],
  )

  const { pendingCost, purchasedCostByTrip } = useMemo(() => {
    const pendingItems: typeof filteredItems = []
    // Keyed by trip, not the rendered date label — two trips on one day used
    // to collide onto the same label and the second trip's total silently
    // overwrote the first's.
    const byTrip = new Map<string, typeof filteredItems>()
    for (const item of filteredItems) {
      // Both arms ask itemState, so the three-way split is visible and the
      // omission of 'cart' is a decision rather than a gap. Mixing the two
      // authorities — `!item.purchased` here, itemState there — left anything
      // with `purchased` set and `purchased_at` null in neither bucket.
      const state = itemState(item, now)
      if (state === 'pending') {
        pendingItems.push(item)
      } else if (state === 'bought') {
        // Cart items are excluded here on purpose: ItemList only looks up
        // this map for 'bought' trips, and a cart item's own trip is still
        // open, so it has no filed total to bucket toward.
        const key = item.purchase_id ?? item.id
        const group = byTrip.get(key) ?? []
        group.push(item)
        byTrip.set(key, group)
      }
    }
    const costByTrip = new Map<string, ReturnType<typeof computeCostSummary>>()
    for (const [key, group] of byTrip) {
      costByTrip.set(key, computeCostSummary(group))
    }
    return {
      pendingCost: computeCostSummary(pendingItems),
      purchasedCostByTrip: costByTrip,
    }
  }, [filteredItems, now])

  return (
    // The board is resolved once here and inherited by everything below, so no
    // component has to know which of the six it is — they ask for --board.
    <div className="list-screen" data-board={board}>
      <ListHeader
        title={localListName}
        emoji={localEmoji}
        onMenuOpen={handleMenuToggle}
        onBack={onBack}
      />

      <ProgressBar purchased={purchasedCount} total={totalCount} />

      {isEnabled(FLAGS.PUSH_NOTIFICATIONS) && (
        <NotificationPrimingCard
          canReceive={canReceivePush({ isIOS, isInstalled })}
          permission={permissionState()}
          // Sharing intent, not just a shared list: every list starts solo, so
          // gating on member count alone would only offer notifications to an
          // owner AFTER they had already missed the first change.
          // Known limitation, accepted: push-sharing-intent is one global key,
          // not per-list, so sharing list A makes the card eligible on solo
          // list B too. Permission is per-origin anyway and the card disappears
          // for good after any grant or dismissal, so a per-list key is not
          // worth the storage complexity.
          hasSharingIntent={
            members.size > 1 ||
            Boolean(localStorage.getItem('push-sharing-intent'))
          }
          isIOS={isIOS}
          listName={localListName}
          onEnable={() => void enablePush(getToken)}
        />
      )}

      {isOffline && (
        <div className="offline-banner offline-banner--sticky" role="status">
          Sin conexión
          {pendingCount > 0
            ? ` · ${pendingCount} ${pendingCount === 1 ? 'cambio pendiente' : 'cambios pendientes'}`
            : ' · Los cambios se sincronizarán al reconectar'}
        </div>
      )}

      {items.length > 0 && (
        <FilterBar
          stores={stores}
          query={filterQuery}
          onChange={setFilterQuery}
          onModeChange={setFilterMode}
        />
      )}

      <ItemList
        status={status}
        items={filteredItems}
        totalItems={allUnpurchasedCount}
        onTogglePurchased={handleTogglePurchased}
        onOpen={handleItemMenuOpen}
        onRetry={retry}
        onClone={handleCloneItem}
        pendingCost={pendingCost}
        purchasedCostByTrip={purchasedCostByTrip}
        purchases={purchasesById}
        onCloseTrip={() => setClosingTrip({ purchaseId: null })}
        onCloseFiledTrip={(purchaseId) => setClosingTrip({ purchaseId })}
        footer={
          isEnabled(FLAGS.AI_RECEIPT_SCANNING) ? (
            /* A way in, not a prompt. It used to appear only once the list
               was empty, which made it a reward for finishing — but the shop
               it is for is precisely the one that never went on the list, so
               waiting for the list to be done was waiting for the wrong
               thing. It says what it does and stays out of the way. */
            <button
              className="save-ticket"
              onClick={handleReceiptScan}
              disabled={receiptUploading || isOffline}
            >
              <span className="save-ticket__stub" aria-hidden>
                <Receipt size={17} strokeWidth={1.75} />
              </span>
              <span className="save-ticket__words">
                <span className="save-ticket__title">
                  {receiptUploading
                    ? 'Procesando ticket…'
                    : 'Guardar un ticket'}
                </span>
                <span className="save-ticket__note">
                  De una compra que no apuntaste aquí
                </span>
              </span>
              <ChevronRight
                className="save-ticket__chevron"
                size={16}
                aria-hidden
              />
            </button>
          ) : undefined
        }
      />

      {editingTag &&
        (() => {
          const editedItem = items.find((i) => i.id === editingTag.itemId)
          if (!editedItem) return null
          if (editingTag.field === 'stores') {
            return (
              <StoreEditSheet
                key={editingTag.itemId}
                item={editedItem}
                items={items}
                onSave={(stores: string[]) => {
                  void updateStores(editingTag.itemId, stores)
                  setEditingTag(null)
                }}
                onClose={() => setEditingTag(null)}
              />
            )
          }
          return (
            <TagEditSheet
              key={`${editingTag.itemId}-${editingTag.field}`}
              item={editedItem}
              field={editingTag.field}
              items={items}
              onSave={(value) => {
                void updateTag(
                  editingTag.itemId,
                  editingTag.field as TagField,
                  value,
                )
                setEditingTag(null)
              }}
              onClose={() => setEditingTag(null)}
            />
          )
        })()}

      {activeItemId &&
        (() => {
          const activeItem = items.find((i) => i.id === activeItemId)
          if (!activeItem) return null
          return (
            <ItemDetailSheet
              item={activeItem}
              listId={listId}
              getToken={getToken}
              members={members}
              // The row stopped carrying these, so the sheet took them on.
              onTagClick={(field) => {
                setActiveItemId(null)
                handleTagClick(activeItemId, field)
              }}
              // Closed first, like every other way out of this sheet. Left
              // open it would sit under the price sheet as a second modal
              // dialog, still listening for Escape — so Escape would shut the
              // sheet behind and leave the one in front standing.
              onLogPrice={() => {
                setActiveItemId(null)
                handleOpenLogPrice(activeItemId)
              }}
              onRename={(name) => {
                void renameItem(activeItemId, name)
                setActiveItemId(null)
              }}
              onDelete={() => {
                void removeItem(activeItemId)
                setActiveItemId(null)
              }}
              onClone={() => {
                handleCloneItem(activeItemId)
                setActiveItemId(null)
              }}
              onClose={() => setActiveItemId(null)}
            />
          )
        })()}

      {menuOpen && (
        <ListActionSheet
          listId={listId}
          listName={localListName}
          currentUserId={currentUserId}
          isOwner={isOwner}
          isDefault={localIsDefault}
          listEmoji={localEmoji}
          onEmojiChange={(emoji) => void handleEmojiChange(emoji)}
          onRename={(newName) => void handleRename(listId, newName)}
          onDelete={() => void handleDelete(listId)}
          onSetDefault={() => void handleSetDefault()}
          onReceiptScan={
            isEnabled(FLAGS.AI_RECEIPT_SCANNING)
              ? () => handleReceiptScan()
              : undefined
          }
          onClose={() => setMenuOpen(false)}
        />
      )}
      {!editingTag && !menuOpen && !activeItemId && (
        <div className="bottom-panel">
          <SmartInputBar
            value={inputValue}
            parsed={parsed}
            items={items}
            suggestions={suggestions}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onSuggestionAdd={handleInputSuggestionAdd}
            onClear={handleClear}
            onScanRequest={handleScanRequest}
            onEanSearch={handleEanSearch}
            isOffline={isOffline}
            eanLoading={eanLookup.status === 'loading'}
            eanError={eanLookup.status === 'error' ? eanLookup.message : null}
            inferredStoreChip={visibleChip}
            onDismissInferredStore={dismissInferredStore}
            dueSuggestionsCount={filteredDueSuggestions.length}
            onDueSuggestionsOpen={() => setDueSuggestionsOpen(true)}
          />
        </div>
      )}
      {dueSuggestionsOpen && filteredDueSuggestions.length > 0 && (
        <DueSuggestionsSheet
          suggestions={filteredDueSuggestions}
          onAdd={handleSuggestionAdd}
          onDismiss={handleSuggestionDismiss}
          onClose={handleDueSuggestionsClose}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {scanning && (
        <BarcodeScanner
          getToken={getToken}
          onResult={handleScanResult}
          onError={handleScanError}
          onClose={() => setScanning(false)}
        />
      )}
      {scannedProduct && (
        <BarcodeScanSheet
          product={scannedProduct}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onAdd={handleScanAdd as any}
          onEdit={handleScanEdit}
          onClose={() => setScannedProduct(null)}
        />
      )}
      {eanLookup.status === 'found' && (
        <BarcodeScanSheet
          product={eanLookup.product}
          initialBrand={parsed.brand ?? undefined}
          initialStores={parsed.stores}
          onAdd={handleEanAdd}
          onEdit={handleEanEdit}
          onClose={handleClear}
        />
      )}

      {logPriceFor &&
        (() => {
          const logItem = items.find((i) => i.id === logPriceFor.itemId)
          if (!logItem) return null
          return (
            <>
              <div
                className="sheet-overlay"
                onClick={() => setLogPriceFor(null)}
              />
              <div className="sheet-container">
                <LogPurchaseSheet
                  item={logItem}
                  initialAmount={logPriceFor.initialAmount}
                  initialPricePer={logPriceFor.initialPricePer}
                  initialStore={logPriceFor.initialStore}
                  initialPurchasedQuantity={logItem.purchased_quantity ?? null}
                  suggestedStore={logPriceFor.suggestedStore}
                  onSave={handleSavePrice}
                  onDelete={handleDeletePrice}
                  onClose={() => setLogPriceFor(null)}
                  isOffline={isOffline}
                />
              </div>
            </>
          )
        })()}

      {closingTrip && (
        <>
          <div className="sheet-overlay" onClick={dismissCloseSheet} />
          <div className="sheet-container">
            <CloseTripSheet
              // The sheet seeds its rows once, so that a poll cannot rewrite a
              // row under somebody pricing it. Reading a paper replaces every
              // row, which is exactly the caller that note asks for a fresh
              // sheet. Discarding one keeps what was typed and happens inside
              // the sheet, so nothing here changes and nothing remounts.
              key={ticket?.receipt.scanId ?? 'hand'}
              initialLines={
                ticket?.lines ?? buildLines(items, now, closingTrip.purchaseId)
              }
              storeSuggestions={storeSuggestions}
              defaultDate={closingDefaultDate}
              purchaseId={closingTrip.purchaseId}
              isOffline={isOffline}
              receipt={ticket?.receipt ?? null}
              mappings={mappings}
              canScan={isEnabled(FLAGS.AI_RECEIPT_SCANNING)}
              onScan={handleReceiptScan}
              onSave={handleCloseTrip}
              onClose={dismissCloseSheet}
              onEditLine={(line, apply, lines) =>
                setEditingLine({ line, lines, apply })
              }
            />
          </div>
        </>
      )}

      {editingLine && (
        <>
          <div className="sheet-overlay" onClick={() => setEditingLine(null)} />
          <div className="sheet-container">
            {/* Two questions, told apart by whether the row's product is
                settled. A printed line with no product, and one the matcher
                only guessed at, both ask which product it is; anything else
                adjusts the product it already names. */}
            {productUnsettled(editingLine.line) ? (
              <ResolveLineSheet
                line={editingLine.line}
                candidates={freeRows(editingLine.lines)}
                onResolve={handleResolveLine}
                onClose={() => setEditingLine(null)}
              />
            ) : (
              <AdjustItemSheet
                line={editingLine.line}
                onDone={(next) => {
                  editingLine.apply(next)
                  setEditingLine(null)
                }}
                onClose={() => setEditingLine(null)}
              />
            )}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {receiptSourcePickerOpen && (
        <>
          <div
            className="sheet-overlay"
            onClick={() => setReceiptSourcePickerOpen(false)}
          />
          <div className="sheet-container">
            <div className="receipt-source-picker">
              <button
                className="receipt-source-picker__btn"
                onClick={() => {
                  setReceiptSourcePickerOpen(false)
                  cameraInputRef.current?.click()
                }}
              >
                <Camera size={16} /> Tomar foto
              </button>
              <button
                className="receipt-source-picker__btn"
                onClick={() => {
                  setReceiptSourcePickerOpen(false)
                  fileInputRef.current?.click()
                }}
              >
                <Image size={16} /> Elegir de galería
              </button>
              <button
                className="receipt-source-picker__cancel"
                onClick={() => setReceiptSourcePickerOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}

      {receiptUploading && (
        <>
          <div className="sheet-overlay" />
          <div className="receipt-uploading-indicator">
            <span
              className="receipt-uploading-indicator__spinner"
              role="status"
              aria-label="Procesando ticket"
            />
            <span>Procesando ticket…</span>
          </div>
        </>
      )}
    </div>
  )
}
