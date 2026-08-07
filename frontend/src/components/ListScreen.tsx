import { Camera, Image } from 'lucide-react'
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
  getElsewhereMatch,
  getList,
  getSuggestions,
  rebuyPurchaseItem,
  renameStore,
  setBoardPref,
  setDefaultList,
  submitParsedReceipt,
  submitReceiptPrices,
  updateList,
} from '../lib/api'
import { asBoardName, type BoardName } from '../lib/boards'
import { isDismissed, writeDismissal } from '../lib/dismissedSuggestions'
import { FLAGS } from '../lib/featureFlags'
import { isTripOpen } from '../lib/isTripOpen'
import { computeCostSummary } from '../lib/itemCost'
import { getLastPriceStore, setLastPriceStore } from '../lib/lastPriceStore'
import { parseInput } from '../lib/parseInput'
import { canReceivePush, enablePush, permissionState } from '../lib/push'
import { parseReceiptWithAi } from '../lib/receiptAi'
import { storeKey } from '../lib/storeKey'
import type {
  BarcodeRead,
  DueSuggestion,
  EditingTag,
  ElsewhereMatch,
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
import { CloseTripSheet } from './CloseTripSheet'
import { FilterBar } from './FilterBar'
import { ItemFichaSheet } from './ItemFichaSheet'
import { ItemList } from './ItemList'
import { ListActionSheet } from './ListActionSheet'
import { ListHeader } from './ListHeader'
import './ListScreen.css'
import LogPurchaseSheet from './LogPurchaseSheet'
import { NotificationPrimingCard } from './NotificationPrimingCard'
import { ProgressBar } from './ProgressBar'
import {
  ReceiptConsentSheet,
  type ReceiptConsentSheetHandle,
} from './ReceiptConsentSheet'
import { ReceiptIllegibleSheet } from './ReceiptIllegibleSheet'
import ReceiptScanSheet, { type ReceiptConfirmMeta } from './ReceiptScanSheet'
import { SaveTicketSheet } from './SaveTicketSheet'
import { SmartInputBar } from './SmartInputBar'
import { SmartSearchPill } from './SmartSearchPill'
import { Stack, type StackHandle } from './Stack'
import { StoreEditSheet } from './StoreEditSheet'
import { TagEditSheet } from './TagEditSheet'
import { Toast } from './Toast'

interface Props {
  listId: string
  listName: string
  listEmoji?: string | null
  listOwnerId: string
  /** The caller's board for this list; unknown or absent values land on kraft. */
  board?: string | null
  isDefault?: boolean
  onRename?: (newName: string) => void
  onSetDefault?: (isDefault: boolean) => void
  onBack?: () => void
  /** The list stopped being the reader's after mount — confirmed, not suspected. */
  onListGone?: (reason: 'not_found' | 'forbidden') => void
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
  board = null,
  isDefault = false,
  onRename,
  onSetDefault,
  onBack,
  onListGone,
}: Props) {
  const { getToken, user, recordReceiptConsent } = useAuth()
  const [localBoard, setLocalBoard] = useState(asBoardName(board))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets optimistic board when the route's list data refreshes
    setLocalBoard(asBoardName(board))
  }, [board])
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
  const [localEmoji, setLocalEmoji] = useState(listEmoji)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: resets optimistic emoji when the route's list data refreshes
    setLocalEmoji(listEmoji)
  }, [listEmoji])
  const { isEnabled } = useFeatureFlags()
  const { isIOS, isInstalled } = usePWAInstall()
  // Resets the push unseen watermark and clears this list's tray notifications
  // whenever the list is actually on screen.
  useListSeen(listId, getToken)
  const isOffline = !useOnline()
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [toast, setToast] = useState<string | null>(null)
  // Held in state, not read inline in JSX: the priming card gates on this, and
  // only a state change after enablePush settles re-renders it away. Otherwise
  // the card keeps offering «Activar avisos» after a grant — or after a denial,
  // when the browser will never show the prompt again.
  const [pushPermission, setPushPermission] = useState(() => permissionState())
  const [editingTag, setEditingTag] = useState<EditingTag | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  // The 21b search pill takes over the title-area slot. `searching` is the
  // whole mode: it filters strictly (a typed @tienda excludes storeless items),
  // while the chips filter loosely — so strictStore is just `searching`, and no
  // separate filterMode state is needed.
  const [searching, setSearching] = useState(false)
  // A same-name hit in another of the user's lists, shown as the third line of
  // the no-results search state (16c). Null unless a search came back empty and
  // the lookup found something.
  const [elsewhereMatch, setElsewhereMatch] = useState<ElsewhereMatch | null>(
    null,
  )
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  type ScanTarget = { kind: 'add' } | { kind: 'receipt-line'; index: number }
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null)
  const [pendingScan, setPendingScan] = useState<{
    index: number
    product: BarcodeRead
  } | null>(null)
  const [scannedProduct, setScannedProduct] = useState<BarcodeRead | null>(null)
  const [dueSuggestions, setDueSuggestions] = useState<DueSuggestion[]>([])
  const [logPriceFor, setLogPriceFor] = useState<{
    itemId: string
    initialAmount: number | null
    initialStore: string | null
    suggestedStore: string | null
  } | null>(null)

  // A write answering 403/404 only *suggests* the list is gone — the missing
  // thing is often the item. Re-read the list itself and evict only when that
  // second, independent answer agrees: a membership check that is wrong once
  // costs somebody their shopping screen mid-aisle. Answers whether it
  // evicted, so a caller holding a failure message can stand down when the
  // terminal screen is about to say something better.
  const confirmListGone = useCallback(async (): Promise<boolean> => {
    if (!onListGone) return false
    try {
      await getList(getToken, listId)
      return false
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        onListGone('not_found')
        return true
      }
      if (err instanceof ApiError && err.status === 403) {
        onListGone('forbidden')
        return true
      }
      return false
    }
  }, [getToken, listId, onListGone])

  const handleRename = useCallback(
    async (listId: string, newName: string) => {
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
      const previous = localListName
      setLocalListName(newName)
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
    try {
      await setDefaultList(getToken, listId)
      onSetDefault?.(true)
    } catch {
      setLocalIsDefault(false)
      setToast('No se pudo marcar como predeterminada')
    }
  }, [getToken, isOffline, listId, onSetDefault])

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
      } catch {
        setLocalEmoji(previous)
        setToast('No se pudo cambiar el emoji')
      }
    },
    [getToken, isOffline, listId, localEmoji],
  )

  const handleBoardChange = useCallback(
    async (next: BoardName) => {
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
      const previous = localBoard
      setLocalBoard(next)
      try {
        await setBoardPref(getToken, listId, next)
      } catch {
        setLocalBoard(previous)
        setToast('No se pudo cambiar el tablero')
      }
    },
    [getToken, isOffline, listId, localBoard],
  )

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
      } catch (err) {
        // Deleting a list that is already gone is success arriving late —
        // finish the tap instead of blaming it.
        if (err instanceof ApiError && err.status === 404) {
          setMenuOpen(false)
          onBack?.()
          return
        }
        // The failure toast is right for a transient 403 but wrong next to
        // the terminal screen — when the confirm evicts, let it answer alone.
        if (err instanceof ApiError && err.status === 403) {
          if (await confirmListGone()) return
        }
        setToast('No se pudo eliminar la lista')
      }
    },
    [getToken, onBack, isOffline, confirmListGone],
  )

  const [eanLookup, setEanLookup] = useState<EanLookupState>({
    status: 'idle',
  })
  const eanRequestIdRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [receiptScanResult, setReceiptScanResult] =
    useState<ReceiptScanResult | null>(null)
  // The captured image, kept in memory only for the review thumbnail; the file
  // itself is never stored. Revoked when the session ends (see setReceiptImage).
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null)
  const [receiptIsPdf, setReceiptIsPdf] = useState(false)
  // Rescued store/date/total from a scan that read zero lines — the 18c
  // illegible path. Non-null mounts <ReceiptIllegibleSheet>; the review sheet
  // never opens for these.
  const [illegibleRescue, setIllegibleRescue] = useState<{
    store: string | null
    date: string | null
    total: number | null
  } | null>(null)
  const receiptImageUrlRef = useRef<string | null>(null)
  const [receiptUploading, setReceiptUploading] = useState(false)
  const [receiptSourcePickerOpen, setReceiptSourcePickerOpen] = useState(false)
  const [consentSheetOpen, setConsentSheetOpen] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const consentSheetRef = useRef<ReceiptConsentSheetHandle>(null)
  // Set when a granted consent has been persisted, so the scan the user came
  // for continues once the disclosure sheet has finished its exit.
  const scanAfterConsentRef = useRef(false)
  const currentUserId = user!.id

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
    storeEntries,
    displayStore,
    applyStoreRename,
    togglePurchased,
    addItem,
    updateTag,
    updateStores,
    renameItem,
    removeItem,
    savePrice,
    clearItemPrice,
    retry,
  } = useListItems(listId, getToken, setToast, confirmListGone)

  // The pending list (items) and the trip stack are two independent reads with
  // their own refresh handles. A mutation that closes, settles, or re-buys a
  // trip changes BOTH, so every such site invalidates them together through
  // this one call — updating only one leaves a trip reading as open until a
  // manual refresh. `stackRef.refetch` is imperative because the stack hook
  // lives inside <Stack>, not here.
  const stackRef = useRef<StackHandle>(null)
  const invalidateAfterTripChange = useCallback(() => {
    retry()
    void stackRef.current?.refetch()
  }, [retry])

  const handleRenameStore = useCallback(
    async (renamedKey: string, displayName: string) => {
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
      try {
        await renameStore(getToken, listId, renamedKey, displayName)
        applyStoreRename(renamedKey, displayName)
      } catch {
        setToast('No se pudo renombrar la tienda')
      }
    },
    [applyStoreRename, getToken, isOffline, listId],
  )

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

  // The single choke point for every scan entry point (list options, the
  // save-ticket door, close-trip). Only a granted account scans; otherwise —
  // undecided or previously declined — the disclosure is shown, so a declined
  // user can reconsider in place rather than being sent to Ajustes.
  const handleReceiptScan = useCallback(() => {
    if (user?.receiptConsent === 'granted') {
      setReceiptSourcePickerOpen(true)
    } else {
      setConsentSheetOpen(true)
    }
  }, [user])

  const handleConsentDecision = useCallback(
    (consent: 'granted' | 'declined') => {
      // Continue into the scan only once the write persists — never on the
      // sheet's exit animation, which can outrun a slow or failed PUT and open
      // the source picker (firing the Gemini parse) with consent never saved.
      // So: disable the actions, await the write, and only on success play the
      // exit; the picker then opens in handleConsentClose. A failure re-enables
      // the actions and keeps the sheet open to retry.
      setConsentBusy(true)
      recordReceiptConsent(consent)
        .then(() => {
          scanAfterConsentRef.current = consent === 'granted'
          consentSheetRef.current?.close()
        })
        .catch(() => {
          setConsentBusy(false)
          setToast('No se pudo guardar tu preferencia. Inténtalo de nuevo.')
        })
    },
    [recordReceiptConsent],
  )

  const handleConsentClose = useCallback(() => {
    setConsentSheetOpen(false)
    setConsentBusy(false)
    if (scanAfterConsentRef.current) {
      scanAfterConsentRef.current = false
      setReceiptSourcePickerOpen(true)
    }
  }, [])

  // Swaps the in-memory receipt image, revoking the previous object URL so a
  // re-read or a finished session never leaks one.
  const setReceiptImage = useCallback((url: string | null, isPdf: boolean) => {
    if (receiptImageUrlRef.current) {
      URL.revokeObjectURL(receiptImageUrlRef.current)
    }
    receiptImageUrlRef.current = url
    setReceiptImageUrl(url)
    setReceiptIsPdf(isPdf)
  }, [])

  useEffect(() => {
    return () => {
      if (receiptImageUrlRef.current) {
        URL.revokeObjectURL(receiptImageUrlRef.current)
      }
    }
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

        // A PDF has no preview thumbnail — the sheet shows a badge instead.
        const isPdf = file.type === 'application/pdf'

        // Zero lines is the "illegible" signal: the parse prompt omits unreadable
        // lines rather than throwing, so an empty list means the photo couldn't
        // be read. There is nothing to match — skip the matcher and offer 18c,
        // where what was rescued (store/date/total) saves as a manual purchase.
        if (parsed.lines.length === 0) {
          setIllegibleRescue({
            store: parsed.store ?? null,
            date: parsed.receipt_date ?? null,
            total: parsed.receipt_total ?? null,
          })
          setReceiptImage(isPdf ? null : URL.createObjectURL(file), isPdf)
          setPendingScan(null)
          return
        }

        const result = await submitParsedReceipt(getToken, listId, parsed)
        setReceiptScanResult(result)
        // Hold the image in memory for the review thumbnail. Clearing pendingScan
        // is belt-and-suspenders alongside the exit-path clears: a fresh session
        // never starts primed with a scan from a stale one.
        setReceiptImage(isPdf ? null : URL.createObjectURL(file), isPdf)
        setPendingScan(null)
      } catch (e) {
        console.error('Receipt scan submit failed:', e)
        setToast('No se pudo procesar el ticket')
      } finally {
        setReceiptUploading(false)
      }
    },
    [getToken, listId, setReceiptImage],
  )

  const handleReceiptConfirm = useCallback(
    async (
      patches: PricePatch[],
      mappings: NameMapping[],
      newItems: NewPurchasedItem[],
      meta: ReceiptConfirmMeta,
    ): Promise<boolean> => {
      if (!receiptScanResult) return false
      try {
        const data = await submitReceiptPrices(getToken, listId, {
          scan_id: receiptScanResult.scan_id,
          receipt_date: meta.receiptDate,
          // Store and paper total close the trip these lines settle onto. The
          // review UI requires a store; the total rides from the parsed receipt.
          store: meta.store,
          receipt_total: receiptScanResult.receipt_total,
          patches,
          new_items: newItems,
          mappings,
        })
        setReceiptScanResult(null)
        setReceiptImage(null, false)
        setPendingScan(null)
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
        invalidateAfterTripChange()
        return true
      } catch {
        // The sheet stays mounted and awaits our return value — signalling
        // failure re-enables its confirm button instead of stranding the
        // user with edits they'd otherwise lose by closing and rescanning.
        setToast('No se pudieron guardar los precios')
        return false
      }
    },
    [
      getToken,
      listId,
      receiptScanResult,
      invalidateAfterTripChange,
      setReceiptImage,
    ],
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

  // Re-buy from the stack (18a/22a): a past trip's line goes back onto the
  // pending list. Unlike handleCloneItem, the line is not in `items` (it comes
  // from the trip's own fetch), so this hits the dedicated endpoint — the
  // server derives store + quantity and stays idempotent — then refetches so
  // the re-added line appears on the sheet.
  const handleStackRebuy = useCallback(
    async (purchaseId: string, itemId: string) => {
      if (isOffline) {
        setToast('Sin conexión')
        return
      }
      try {
        await rebuyPurchaseItem(getToken, listId, purchaseId, itemId)
        invalidateAfterTripChange()
      } catch {
        setToast('No se pudo volver a comprar')
      }
    },
    [getToken, listId, isOffline, invalidateAfterTripChange, setToast],
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
    if (isOffline) {
      setToast('Sin conexión')
      return
    }
    const stores = storeToAdd
      ? [...new Set([...parsed.stores, storeToAdd])]
      : parsed.stores
    void addItem({ ...parsed, stores })
    setInputValue('')
  }, [parsed, addItem, storeToAdd, isOffline])

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
    setReceiptImage(null, false)
    setPendingScan(null)
  }, [setReceiptImage])

  // "Volver a leer el ticket" — reopen the source picker for a fresh read; a
  // new file yields a new scan_id, remounting the keyed sheet.
  const handleReReadReceipt = useCallback(() => {
    setReceiptSourcePickerOpen(true)
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
      if (isOffline) {
        setToast('Sin conexión')
        return
      }
      try {
        await savePrice(
          logPriceFor.itemId,
          amount,
          pricePer,
          store,
          purchasedQuantity,
        )
      } catch {
        setToast('No se pudo guardar el precio')
        return
      }
      if (store) setLastPriceStore(store)
      setLogPriceFor(null)
    },
    [logPriceFor, savePrice, isOffline],
  )

  const handleDeletePrice = useCallback(async () => {
    if (!logPriceFor) return
    if (isOffline) {
      setToast('Sin conexión')
      return
    }
    try {
      await clearItemPrice(logPriceFor.itemId)
      setLogPriceFor(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // price already gone — treat as success, close sheet
        setLogPriceFor(null)
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
  }, [logPriceFor, clearItemPrice, isOffline])

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

  // The close-trip sheet (10b): no id closes the open cart, an id closes a
  // torn-off proto-trip named by the stack's seal. A proto also carries the day
  // it covered, so its close back-dates there instead of defaulting to today.
  const [closeTrip, setCloseTrip] = useState<{
    purchaseId?: string
    initialDate?: string
  } | null>(null)
  const handleCloseTrip = useCallback(
    (purchaseId?: string, initialDate?: string) => {
      setCloseTrip({ purchaseId, initialDate })
    },
    [],
  )
  // The save-a-ticket door (26a): records a shop that was never tracked here.
  const [saveTicketOpen, setSaveTicketOpen] = useState(false)
  const handleSaveTicket = useCallback(() => setSaveTicketOpen(true), [])

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
    // One chip per store, not per spelling: dedupe by key and label with
    // the registry's canonical name.
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of items.filter((i) => !i.purchased)) {
      for (const s of item.stores) {
        const key = storeKey(s)
        if (!seen.has(key)) {
          seen.add(key)
          result.push(displayStore(s))
        }
      }
    }
    return result.sort()
  }, [items, displayStore])

  const filteredItems = useMemo(
    () => filterItems(items, filterQuery, { strictStore: searching }),
    [items, filterQuery, searching],
  )
  const allUnpurchasedCount = useMemo(
    () => items.filter((i) => !i.purchased).length,
    [items],
  )

  const filteredDueSuggestions = useMemo(
    () => dueSuggestions.filter((s) => !isDismissed(s.name)),
    [dueSuggestions],
  )

  // Cross-list lookup for the no-results search state (16c). Only a search that
  // came back empty asks the question; debounced so keystrokes don't each hit
  // the endpoint, and guarded by `cancelled` so a slow answer for an old query
  // can't overwrite a newer one. A failed lookup just drops the extra line.
  useEffect(() => {
    const query = filterQuery.trim()
    if (!searching || query === '' || filteredItems.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the stale answer on leaving the no-results state
      setElsewhereMatch(null)
      return
    }
    let cancelled = false
    const id = setTimeout(() => {
      void getElsewhereMatch(getToken, listId, query)
        .then((match) => {
          if (!cancelled) setElsewhereMatch(match)
        })
        .catch(() => {
          if (!cancelled) setElsewhereMatch(null)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [searching, filterQuery, filteredItems.length, getToken, listId])

  // Only the pending subtotal lives here now: settled trips carry their own
  // confirmed totals in the stack (18a), so there is no per-date settled
  // subtotal to compute from the item list any more.
  const pendingCost = useMemo(
    () => computeCostSummary(filteredItems.filter((item) => !item.purchased)),
    [filteredItems],
  )

  const openSearch = () => {
    setSearching(true)
    setFilterQuery('')
  }
  const closeSearch = () => {
    setSearching(false)
    setFilterQuery('')
  }
  // "Añadir «query»" from the no-results state (16c): searching for something
  // absent is wanting to add it. Parses the query like the input bar so any
  // @tienda/#marca sigils carry over, then leaves search for the filled list.
  const handleAddFromSearch = () => {
    const parsedSearch = parseInput(filterQuery)
    if (!parsedSearch.name.trim()) return
    if (isOffline) {
      setToast('Sin conexión')
      return
    }
    void addItem(parsedSearch)
    closeSearch()
  }

  return (
    <div className="list-screen" data-board={localBoard}>
      <ListHeader
        title={localListName}
        emoji={localEmoji}
        onMenuOpen={handleMenuToggle}
        onBack={onBack}
        onSearch={items.length > 0 && !searching ? openSearch : undefined}
      />

      <ProgressBar purchased={purchasedCount} total={totalCount} />

      {isEnabled(FLAGS.PUSH_NOTIFICATIONS) && (
        <NotificationPrimingCard
          canReceive={canReceivePush({ isIOS, isInstalled })}
          permission={pushPermission}
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
          // enablePush must run first in the gesture: an await before its
          // Notification.requestPermission() call makes Safari drop the
          // transient activation and never show the prompt.
          onEnable={() =>
            void enablePush(getToken)
              .catch(() => setToast('No se pudieron activar los avisos'))
              .finally(() => setPushPermission(permissionState()))
          }
        />
      )}

      {searching ? (
        <SmartSearchPill
          query={filterQuery}
          onChange={setFilterQuery}
          onClose={closeSearch}
        />
      ) : (
        items.length > 0 && (
          <FilterBar
            stores={stores}
            query={filterQuery}
            onChange={setFilterQuery}
          />
        )
      )}

      <ItemList
        status={status}
        items={filteredItems}
        totalItems={allUnpurchasedCount}
        searching={searching}
        query={filterQuery}
        elsewhereMatch={elsewhereMatch}
        onAddFromSearch={handleAddFromSearch}
        onTogglePurchased={handleTogglePurchased}
        onOpenActions={handleItemMenuOpen}
        onRetry={retry}
        onClone={handleCloneItem}
        pendingCost={pendingCost}
        stack={
          <Stack
            ref={stackRef}
            listId={listId}
            getToken={getToken}
            onRebuy={handleStackRebuy}
            onOpenLine={handleItemMenuOpen}
            onCloseTrip={handleCloseTrip}
            onSaveTicket={handleSaveTicket}
            query={filterQuery}
            searching={searching}
          />
        }
        displayStore={displayStore}
        onCloseTrip={handleCloseTrip}
        suggestions={filteredDueSuggestions}
        onSuggestionAdd={handleSuggestionAdd}
        onSuggestionDismiss={handleSuggestionDismiss}
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
          // Prices belong to closed-trip records only: until the trip closes
          // there is no amount to record, so pending and in-cart items get no
          // price entry at all.
          const isRecord =
            activeItem.purchased && !isTripOpen(activeItem.purchase_ends_at)
          return (
            <ItemFichaSheet
              item={activeItem}
              members={members}
              displayStore={displayStore}
              getToken={getToken}
              listId={listId}
              purchased={activeItem.purchased}
              onRename={(name) => {
                void renameItem(activeItemId, name)
                setActiveItemId(null)
              }}
              onEditField={(field) => {
                handleTagClick(activeItemId, field)
                setActiveItemId(null)
              }}
              onLogPrice={
                isRecord
                  ? () => {
                      handleOpenLogPrice(activeItemId)
                      setActiveItemId(null)
                    }
                  : undefined
              }
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
          listEmoji={localEmoji}
          currentUserId={currentUserId}
          ownerId={listOwnerId}
          isDefault={localIsDefault}
          memberCount={members.size}
          board={localBoard}
          onBoardChange={(b) => void handleBoardChange(b)}
          onRename={(newName) => void handleRename(listId, newName)}
          onEmojiChange={(emoji) => void handleEmojiChange(emoji)}
          onDelete={() => void handleDelete(listId)}
          onSetDefault={() => void handleSetDefault()}
          // Leaving the list is the person's own act to end the relationship —
          // leaving the screen completes the tap.
          onLeftList={() => onBack?.()}
          onListSuspect={() => void confirmListGone()}
          onReceiptScan={
            isEnabled(FLAGS.AI_RECEIPT_SCANNING)
              ? () => handleReceiptScan()
              : undefined
          }
          onClose={() => setMenuOpen(false)}
          storeEntries={storeEntries}
          onRenameStore={(key, name) => void handleRenameStore(key, name)}
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
          />
        </div>
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
          displayStore={displayStore}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onAdd={handleScanAdd as any}
          onEdit={handleScanEdit}
          onClose={() => setScannedProduct(null)}
        />
      )}
      {eanLookup.status === 'found' && (
        <BarcodeScanSheet
          product={eanLookup.product}
          displayStore={displayStore}
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
            <LogPurchaseSheet
              item={logItem}
              displayStore={displayStore}
              initialAmount={logPriceFor.initialAmount}
              initialStore={logPriceFor.initialStore}
              initialPurchasedQuantity={logItem.purchased_quantity ?? null}
              suggestedStore={logPriceFor.suggestedStore}
              onSave={handleSavePrice}
              onDelete={handleDeletePrice}
              onClose={() => setLogPriceFor(null)}
            />
          )
        })()}

      {closeTrip && (
        <CloseTripSheet
          listId={listId}
          getToken={getToken}
          purchaseId={closeTrip.purchaseId}
          initialDate={closeTrip.initialDate}
          cartItems={
            closeTrip.purchaseId
              ? undefined
              : items.filter(
                  (i) => i.purchased && isTripOpen(i.purchase_ends_at),
                )
          }
          storeOptions={items.flatMap((i) => i.stores)}
          displayStore={displayStore}
          onClose={() => setCloseTrip(null)}
          onDone={() => {
            setCloseTrip(null)
            invalidateAfterTripChange()
          }}
          onScanReceipt={() => {
            setCloseTrip(null)
            handleReceiptScan()
          }}
        />
      )}

      {saveTicketOpen && (
        <SaveTicketSheet
          listId={listId}
          getToken={getToken}
          storeOptions={items.flatMap((i) => i.stores)}
          displayStore={displayStore}
          onClose={() => setSaveTicketOpen(false)}
          showToast={setToast}
          onDone={() => {
            setSaveTicketOpen(false)
            invalidateAfterTripChange()
          }}
          onScanReceipt={
            isEnabled(FLAGS.AI_RECEIPT_SCANNING)
              ? () => {
                  setSaveTicketOpen(false)
                  handleReceiptScan()
                }
              : undefined
          }
        />
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

      {consentSheetOpen && (
        <ReceiptConsentSheet
          ref={consentSheetRef}
          busy={consentBusy}
          onDecision={handleConsentDecision}
          onClose={handleConsentClose}
        />
      )}

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
        <ReceiptScanSheet
          // A fresh read (re-read the ticket) yields a new scan_id, so the
          // sheet remounts rather than reconciling edits against new lines.
          key={receiptScanResult.scan_id}
          result={receiptScanResult}
          // Link targets mirror the backend matcher's pool: items still in play
          // — pending, or purchased but still in the open cart — never ones
          // already settled on a closed trip, which a receipt does not re-file.
          candidateItems={items
            .filter((i) => !i.purchased || isTripOpen(i.purchase_ends_at))
            .map((i) => ({
              id: i.id,
              name: i.name,
              purchased: i.purchased,
              purchased_at: i.purchased_at,
              brand: i.brand,
              stores: i.stores,
              quantity: i.quantity,
            }))}
          store={receiptScanResult.store}
          imageUrl={receiptImageUrl}
          isPdf={receiptIsPdf}
          onConfirm={handleReceiptConfirm}
          onClose={handleReceiptSheetClose}
          onReReadReceipt={handleReReadReceipt}
          pendingScan={pendingScan}
          onRequestScan={handleReceiptScanRequest}
        />
      )}

      {illegibleRescue && (
        <ReceiptIllegibleSheet
          listId={listId}
          getToken={getToken}
          rescuedStore={illegibleRescue.store}
          rescuedDate={illegibleRescue.date}
          rescuedTotal={illegibleRescue.total}
          storeOptions={items.flatMap((i) => i.stores)}
          displayStore={displayStore}
          showToast={setToast}
          onClose={() => {
            setIllegibleRescue(null)
            setReceiptImage(null, false)
          }}
          onDiscard={() => {
            setIllegibleRescue(null)
            setReceiptImage(null, false)
          }}
          onDone={() => {
            setIllegibleRescue(null)
            setReceiptImage(null, false)
            invalidateAfterTripChange()
            setToast('Compra guardada')
          }}
          onRetakePhoto={() => {
            setIllegibleRescue(null)
            handleReReadReceipt()
          }}
        />
      )}
    </div>
  )
}
