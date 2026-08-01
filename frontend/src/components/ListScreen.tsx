import { Camera, Image, Receipt } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useFeatureFlags } from '../contexts/FeatureFlagsContext'
import { filterItems } from '../hooks/useItemFilter'
import { useListItems } from '../hooks/useListItems'
import { useListSeen } from '../hooks/useListSeen'
import { useOnline } from '../hooks/useOnline'
import { useOwnBrandInference } from '../hooks/useOwnBrandInference'
import { usePWAInstall } from '../hooks/usePWAInstall'
import {
  ApiError,
  deleteList,
  getBarcode,
  getDueSuggestions,
  getSuggestions,
  setDefaultList,
  submitParsedReceipt,
  submitReceiptPrices,
  updateList,
} from '../lib/api'
import { isDismissed, writeDismissal } from '../lib/dismissedSuggestions'
import { FLAGS } from '../lib/featureFlags'
import { computeCostSummary, purchasedDateLabel } from '../lib/itemCost'
import { getLastPriceStore, setLastPriceStore } from '../lib/lastPriceStore'
import { parseInput } from '../lib/parseInput'
import { canReceivePush, enablePush, permissionState } from '../lib/push'
import { parseReceiptWithAi } from '../lib/receiptAi'
import type {
  BarcodeRead,
  DueSuggestion,
  EditingTag,
  NameMapping,
  NewPurchasedItem,
  PricePatch,
  ReceiptScanRequest,
  ReceiptScanResult,
  Suggestion,
  TagField,
} from '../types'
import { BarcodeScanner } from './BarcodeScanner'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import { DueSuggestionsSheet } from './DueSuggestionsSheet'
import { FilterBar } from './FilterBar'
import { ItemActionSheet } from './ItemActionSheet'
import { ItemList } from './ItemList'
import { ListActionSheet } from './ListActionSheet'
import { ListHeader } from './ListHeader'
import './ListScreen.css'
import LogPurchaseSheet from './LogPurchaseSheet'
import { NotificationPrimingCard } from './NotificationPrimingCard'
import PriceHistorySheet from './PriceHistorySheet'
import { ProgressBar } from './ProgressBar'
import ReceiptScanSheet from './ReceiptScanSheet'
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
  onSetDefault?: (isDefault: boolean) => void
  onBack?: () => void
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
  onSetDefault,
  onBack,
}: Props) {
  const { getToken, user } = useAuth()
  const [localListName, setLocalListName] = useState(listName)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets optimistic local title when polling confirms external rename
    setLocalListName(listName)
  }, [listName])
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
  const isOffline = !useOnline()
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState<EditingTag | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'chips' | 'search'>('chips')
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  type ScanTarget = { kind: 'add' } | { kind: 'receipt-line'; index: number }
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null)
  const [pendingScan, setPendingScan] = useState<{
    index: number
    product: BarcodeRead
  } | null>(null)
  const [scannedProduct, setScannedProduct] = useState<BarcodeRead | null>(null)
  const [dueSuggestions, setDueSuggestions] = useState<DueSuggestion[]>([])
  const [dueSuggestionsOpen, setDueSuggestionsOpen] = useState(false)
  const [priceItemId, setPriceItemId] = useState<string | null>(null)
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
  const [receiptScanResult, setReceiptScanResult] =
    useState<ReceiptScanResult | null>(null)
  const [receiptParsed, setReceiptParsed] = useState<ReceiptScanRequest | null>(
    null,
  )
  const [receiptRematching, setReceiptRematching] = useState(false)
  // Survives the remount a date correction causes; reset with the scan session.
  const [receiptDateConfirmed, setReceiptDateConfirmed] = useState(false)
  const [receiptUploading, setReceiptUploading] = useState(false)
  const [receiptSourcePickerOpen, setReceiptSourcePickerOpen] = useState(false)
  const currentUserId = user!.id
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
        // Two phases, two messages: reading the image is a Gemini call and
        // saving it is ours, so a failure in one must not accuse the other.
        let parsed: ReceiptScanRequest
        try {
          parsed = await parseReceiptWithAi(file)
        } catch (e) {
          console.error('Receipt scan AI read failed:', e)
          setToast('No se pudo leer el ticket')
          return
        }

        const result = await submitParsedReceipt(getToken, listId, parsed)
        // Kept so a corrected date can be re-matched against the same lines
        // without re-reading the image (another Gemini call, another chance
        // for a transient error).
        setReceiptParsed(parsed)
        setReceiptScanResult(result)
        // Belt-and-suspenders alongside the exit-path clears below: guarantees
        // a fresh session never starts primed with a scan from a stale one,
        // without depending on every exit path having been enumerated.
        setPendingScan(null)
        setReceiptDateConfirmed(false)
      } catch (e) {
        console.error('Receipt scan submit failed:', e)
        setToast('No se pudo procesar el ticket')
      } finally {
        setReceiptUploading(false)
      }
    },
    [getToken, listId],
  )

  // Re-runs the backend match against the same parsed lines with a date the
  // user corrected. A wrong year puts the +-3 day match window years off the
  // real purchases, so the first pass legitimately matched nothing; this is
  // what lets them recover without re-scanning the receipt.
  const handleReceiptDateCorrected = useCallback(
    async (receiptDate: string) => {
      if (!receiptParsed) return
      setReceiptRematching(true)
      try {
        const result = await submitParsedReceipt(getToken, listId, {
          ...receiptParsed,
          receipt_date: receiptDate,
        })
        setReceiptParsed((prev) =>
          prev ? { ...prev, receipt_date: receiptDate } : prev,
        )
        // Both of these belong on the success path, and for the same reason:
        // nothing on screen changes when the re-match fails, so anything reset
        // up front is lost for no gain. `dateConfirmed` set early would drop
        // the prompt and the date button's flagged styling, stranding the
        // misread date with nothing pointing at it; `pendingScan` cleared
        // early would discard a barcode the user had already scanned in, and
        // make them scan it again after a transient failure.
        //
        // On the success path pendingScan must still go, for the reason
        // handleReceiptSheetClose clears it: the corrected match replaces
        // matched/unmatched wholesale and remounts the sheet, where
        // `appliedScan` starts at null again, so a surviving scan would
        // reapply its product to whatever line now sits at that index. These
        // batch with setReceiptScanResult, so the remount already sees null.
        setReceiptDateConfirmed(true)
        setPendingScan(null)
        setReceiptScanResult(result)
      } catch (e) {
        console.error('Receipt re-match failed:', e)
        setToast('No se pudo volver a buscar')
      } finally {
        setReceiptRematching(false)
      }
    },
    [getToken, listId, receiptParsed],
  )

  const handleReceiptConfirm = useCallback(
    async (
      patches: PricePatch[],
      mappings: NameMapping[],
      newItems: NewPurchasedItem[],
    ): Promise<boolean> => {
      if (!receiptScanResult) return false
      try {
        const data = await submitReceiptPrices(getToken, listId, {
          scan_id: receiptScanResult.scan_id,
          receipt_date: receiptScanResult.receipt_date,
          patches,
          new_items: newItems,
          mappings,
        })
        setReceiptScanResult(null)
        setReceiptParsed(null)
        setPendingScan(null)
        setReceiptDateConfirmed(false)
        const n = data.items_updated
        const c = data.items_created
        const parts: string[] = []
        if (n > 0) {
          parts.push(
            `${n} precio${n !== 1 ? 's' : ''} actualizado${n !== 1 ? 's' : ''}`,
          )
        }
        if (c > 0) {
          parts.push(
            `${c} artículo${c !== 1 ? 's' : ''} añadido${c !== 1 ? 's' : ''}`,
          )
        }
        setToast(parts.length > 0 ? parts.join(' · ') : 'No se guardó nada')
        retry()
        return true
      } catch {
        // The sheet stays mounted and awaits our return value — signalling
        // failure re-enables its confirm button instead of stranding the
        // user with edits they'd otherwise lose by closing and rescanning.
        setToast('No se pudieron guardar los precios')
        return false
      }
    },
    [getToken, listId, receiptScanResult, retry],
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
    setScanTarget({ kind: 'add' })
  }, [])

  const handleScanResult = useCallback(
    (product: BarcodeRead) => {
      const target = scanTarget
      setScanTarget(null)
      if (target?.kind === 'receipt-line') {
        setPendingScan({ index: target.index, product })
        return
      }
      setScannedProduct(product)
    },
    [scanTarget],
  )

  const handleScanError = useCallback((message: string) => {
    setScanTarget(null)
    setToast(message)
  }, [])

  const handleReceiptScanRequest = useCallback((index: number) => {
    setScanTarget({ kind: 'receipt-line', index })
  }, [])

  // Closing (or completing) a receipt session must drop any pendingScan —
  // otherwise a stale scanned product from a finished session would get
  // applied to whichever row shares its index the next time a fresh
  // ReceiptScanSheet mounts, since the sheet only compares by identity.
  const handleReceiptSheetClose = useCallback(() => {
    setReceiptScanResult(null)
    setReceiptParsed(null)
    setPendingScan(null)
    setReceiptDateConfirmed(false)
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
      setPriceItemId(null)
    },
    [logPriceFor, savePrice],
  )

  const handleDeletePrice = useCallback(async () => {
    if (!logPriceFor) return
    try {
      await clearItemPrice(logPriceFor.itemId)
      setLogPriceFor(null)
      setPriceItemId(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // price already gone — treat as success, close sheet
        setLogPriceFor(null)
        setPriceItemId(null)
      } else if (err instanceof ApiError && err.status === 422) {
        setToast(
          'No se puede eliminar el precio de un artículo comprado en otro día',
        )
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

  const { purchasedCount, totalCount } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10) // 'YYYY-MM-DD' UTC
    const isPurchasedToday = (i: (typeof items)[number]) =>
      !!i.purchased_at && i.purchased_at.slice(0, 10) === today
    let purchased = 0
    let total = 0
    for (const i of items) {
      if (!i.purchased) {
        total++
      } else if (isPurchasedToday(i)) {
        purchased++
        total++
      }
    }
    return { purchasedCount: purchased, totalCount: total }
  }, [items])

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

  const { pendingCost, purchasedCostByDate } = useMemo(() => {
    const pendingItems: typeof filteredItems = []
    const byDate = new Map<string, typeof filteredItems>()
    for (const item of filteredItems) {
      if (!item.purchased) {
        pendingItems.push(item)
      } else {
        const label = purchasedDateLabel(item.purchased_at)
        const group = byDate.get(label) ?? []
        group.push(item)
        byDate.set(label, group)
      }
    }
    const costByDate = new Map<string, ReturnType<typeof computeCostSummary>>()
    for (const [label, group] of byDate) {
      costByDate.set(label, computeCostSummary(group))
    }
    return {
      pendingCost: computeCostSummary(pendingItems),
      purchasedCostByDate: costByDate,
    }
  }, [filteredItems])

  return (
    <div className="list-screen">
      <ListHeader
        title={localListName}
        emoji={listEmoji}
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
          onEnable={() => void enablePush(getToken)}
        />
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
        members={members}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onMenuOpen={handleItemMenuOpen}
        onRetry={retry}
        onPriceClick={(itemId) => setPriceItemId(itemId)}
        onClone={handleCloneItem}
        pendingCost={pendingCost}
        purchasedCostByDate={purchasedCostByDate}
        footer={
          allUnpurchasedCount === 0 &&
          items.length > 0 &&
          !receiptScanResult &&
          isEnabled(FLAGS.AI_RECEIPT_SCANNING) ? (
            <div className="receipt-scan-cta">
              <button
                className="receipt-scan-cta__btn"
                onClick={handleReceiptScan}
                disabled={receiptUploading || isOffline}
              >
                {receiptUploading ? (
                  'Procesando ticket…'
                ) : (
                  <>
                    <Receipt size={16} /> Escanear ticket para registrar precios
                  </>
                )}
              </button>
            </div>
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
            <ItemActionSheet
              item={activeItem}
              purchased={activeItem.purchased}
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
      {scanTarget && (
        <BarcodeScanner
          getToken={getToken}
          onResult={handleScanResult}
          onError={handleScanError}
          onClose={() => setScanTarget(null)}
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

      {priceItemId &&
        (() => {
          const priceItem = items.find((i) => i.id === priceItemId)
          if (!priceItem) return null
          return (
            <>
              <div
                className="sheet-overlay"
                onClick={() => setPriceItemId(null)}
              />
              <div className="sheet-container">
                <PriceHistorySheet
                  item={priceItem}
                  listId={listId}
                  getToken={getToken}
                  onLogPrice={() => handleOpenLogPrice(priceItemId)}
                  onClose={() => setPriceItemId(null)}
                  readOnly={!priceItem.purchased}
                />
              </div>
            </>
          )
        })()}

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
                />
              </div>
            </>
          )
        })()}

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

      {receiptScanResult && (
        <>
          <div className="sheet-overlay" onClick={handleReceiptSheetClose} />
          <div className="sheet-container">
            <ReceiptScanSheet
              // A re-match replaces matched/unmatched wholesale, so line edits
              // made against the old result are no longer meaningful. Remount
              // rather than trying to reconcile them.
              key={receiptScanResult.scan_id}
              result={receiptScanResult}
              candidateItems={items.map((i) => ({
                id: i.id,
                name: i.name,
                purchased: i.purchased,
                purchased_at: i.purchased_at,
                brand: i.brand,
                stores: i.stores,
                quantity: i.quantity,
              }))}
              store={receiptScanResult.store}
              onConfirm={handleReceiptConfirm}
              onClose={handleReceiptSheetClose}
              pendingScan={pendingScan}
              onRequestScan={handleReceiptScanRequest}
              onDateCorrected={handleReceiptDateCorrected}
              rematching={receiptRematching}
              dateConfirmed={receiptDateConfirmed}
            />
          </div>
        </>
      )}
    </div>
  )
}
