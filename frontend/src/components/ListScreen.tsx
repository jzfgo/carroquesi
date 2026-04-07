import { useState, useEffect, useCallback, useMemo } from 'react'
import './ListScreen.css'
import { ListHeader } from './ListHeader'
import { ProgressBar } from './ProgressBar'
import { StoreFilter } from './StoreFilter'
import { ItemList } from './ItemList'
import { SmartInputBar } from './SmartInputBar'
import { TagEditSheet } from './TagEditSheet'
import { StoreEditSheet } from './StoreEditSheet'
import { ItemActionSheet } from './ItemActionSheet'
import { Toast } from './Toast'
import { ListMembersSheet } from './ListMembersSheet'
import { BarcodeScanner } from './BarcodeScanner'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import LogPriceSheet from './LogPriceSheet'
import PriceHistorySheet from './PriceHistorySheet'
import PurchaseToast from './PurchaseToast'
import { parseInput } from '../parseInput'
import { useAuth } from '../contexts/AuthContext'
import { useListItems } from '../hooks/useListItems'
import { getSuggestions, getDueSuggestions, logPrice } from '../lib/api'
import { FrequencySuggestionBanner } from './FrequencySuggestionBanner'
import type { BarcodeRead, DueSuggestion, EditingTag, TagField } from '../types'

interface Props {
  listId: string
  listName: string
  listEmoji?: string | null
  listOwnerId: string
  onBack?: () => void
}

export function ListScreen({ listId, listName, listEmoji = null, listOwnerId, onBack }: Props) {
  const { getToken, user } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState<EditingTag | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [storeFilter, setStoreFilter] = useState<string | null>(null)
  const [activeItemId, setActiveItemId] = useState<string | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannedProduct, setScannedProduct] = useState<BarcodeRead | null>(null)
  const [dueSuggestions, setDueSuggestions] = useState<DueSuggestion[]>([])
  const [priceItemId, setPriceItemId] = useState<string | null>(null)
  const [logPriceFor, setLogPriceFor] = useState<{
    itemId: string
    initialAmount: number | null
    initialPricePer: 'KILOGRAM' | null
    initialStore: string | null
  } | null>(null)
  const [purchaseToast, setPurchaseToast] = useState<{ itemId: string; itemName: string } | null>(null)
  const handleDismissPurchaseToast = useCallback(() => setPurchaseToast(null), [])
  const [lastPrices, setLastPrices] = useState<Map<string, { amount: number; price_per: 'KILOGRAM' | null }>>(new Map())
  const currentUserId = user!.id
  const isOwner = listOwnerId === currentUserId

  const parsed = useMemo(() => parseInput(inputValue), [inputValue])
  const { status, items, members, togglePurchased, addItem, updateTag, updateStores, renameItem, removeItem, retry } =
    useListItems(listId, getToken, setToast)

  // Debounced suggestions — only when name has 2+ chars
  useEffect(() => {
    const q = parsed.name.trim()
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const data = await getSuggestions(getToken, q)
        setSuggestions(data.map(s => s.name))
      } catch {
        // suggestion errors are non-critical
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [parsed.name, getToken])

  useEffect(() => {
    void getDueSuggestions(getToken, listId)
      .then(setDueSuggestions)
      .catch(() => {/* non-critical */})
  }, [listId, getToken])

  const handleTogglePurchased = useCallback(
    (itemId: string) => {
      const item = items.find(i => i.id === itemId)
      void togglePurchased(itemId)
      // Show toast when marking as purchased (not when unmarking)
      if (item && !item.purchased) {
        setPurchaseToast({ itemId, itemName: item.name })
      }
    },
    [togglePurchased, items],
  )

  const handleTagClick = useCallback((itemId: string, field: TagField | 'stores') => {
    setEditingTag({ itemId, field })
  }, [])

  const handleItemMenuOpen = useCallback((itemId: string) => {
    setActiveItemId(itemId)
  }, [])

  const handleMenuToggle = useCallback(() => {
    if (menuOpen) {
      // If sheet is already open, close it
      setMenuOpen(false)
    } else {
      // Otherwise open the menu
      setMenuOpen(true)
    }
  }, [menuOpen])

  const handleSubmit = useCallback(() => {
    if (!parsed.name.trim()) return
    void addItem(parsed)
    setInputValue('')
  }, [parsed, addItem])

  const handleScanRequest = useCallback(() => {
    setScannerOpen(true)
  }, [])

  const handleScanResult = useCallback((product: BarcodeRead) => {
    setScannerOpen(false)
    setScannedProduct(product)
  }, [])

  const handleScanError = useCallback((message: string) => {
    setScannerOpen(false)
    setToast(message)
  }, [])

  const handleScanAdd = useCallback((item: { name: string; brand: string | null; stores: string[] }) => {
    const ean = scannedProduct?.ean ?? null
    setScannedProduct(null)
    void addItem({ name: item.name, brand: item.brand, stores: item.stores, quantity: null, ean })
  }, [addItem, scannedProduct])

  const handleOpenLogPrice = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    const last = lastPrices.get(itemId)
    setLogPriceFor({
      itemId,
      initialAmount: last?.amount ?? null,
      initialPricePer: last?.price_per ?? null,
      initialStore: item?.stores?.[0] ?? null,
    })
  }, [items, lastPrices])

  const handleSavePrice = useCallback(async (amount: number, pricePer: 'KILOGRAM' | null, store: string | null) => {
    if (!logPriceFor) return
    try {
      await logPrice(getToken, listId, logPriceFor.itemId, { amount, price_per: pricePer, store })
      setLastPrices(prev => new Map(prev).set(logPriceFor.itemId, { amount, price_per: pricePer }))
    } catch {
      // non-critical
    }
    setLogPriceFor(null)
    setPriceItemId(null)
    setPurchaseToast(null)
  }, [logPriceFor, getToken, listId])

  const handleScanEdit = useCallback((prefill: string) => {
    setScannedProduct(null)
    setInputValue(prefill)
  }, [])

  const handleSuggestionAdd = useCallback((s: DueSuggestion) => {
    void addItem({ name: s.name, brand: s.brand, stores: s.stores, quantity: null })
    setDueSuggestions(prev => prev.filter(x => x.name !== s.name))
  }, [addItem])

  const purchasedCount = items.filter((i) => i.purchased).length

  const stores = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of items.filter(i => !i.purchased)) {
      for (const s of item.stores) {
        if (!seen.has(s)) {
          seen.add(s)
          result.push(s)
        }
      }
    }
    return result.sort()
  }, [items])

  // Reset filter if the active store disappears from items
  const activeStore = storeFilter && stores.includes(storeFilter) ? storeFilter : null
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (storeFilter && !stores.includes(storeFilter)) setStoreFilter(null)
  }, [stores, storeFilter])

  const filteredItems = activeStore
    ? items.filter(i => i.stores.includes(activeStore) || i.stores.length === 0)
    : items

  return (
    <div className="list-screen">
      <ListHeader title={listName} emoji={listEmoji} onMenuOpen={handleMenuToggle} onBack={onBack} />
      <ProgressBar purchased={purchasedCount} total={items.length} />
      <StoreFilter stores={stores} active={activeStore} onSelect={setStoreFilter} />
      <ItemList
        status={status}
        items={filteredItems}
        members={members}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onMenuOpen={handleItemMenuOpen}
        onRetry={retry}
        onPriceClick={itemId => setPriceItemId(itemId)}
        lastPrices={lastPrices}
      />
      {editingTag && (() => {
        const editedItem = items.find(i => i.id === editingTag.itemId)
        if (!editedItem) return null
        if (editingTag.field === 'stores') {
          return (
            <StoreEditSheet
              key={editingTag.itemId}
              item={editedItem}
              items={items}
              onSave={(stores: string[]) => { void updateStores(editingTag.itemId, stores); setEditingTag(null) }}
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
            onSave={(value) => { void updateTag(editingTag.itemId, editingTag.field as TagField, value); setEditingTag(null) }}
            onClose={() => setEditingTag(null)}
          />
        )
      })()}
      {activeItemId && (() => {
        const activeItem = items.find(i => i.id === activeItemId)
        if (!activeItem) return null
        return (
          <ItemActionSheet
            item={activeItem}
            onRename={(name) => { void renameItem(activeItemId, name); setActiveItemId(null) }}
            onDelete={() => { void removeItem(activeItemId); setActiveItemId(null) }}
            onClose={() => setActiveItemId(null)}
          />
        )
      })()}
      {menuOpen && (
        <ListMembersSheet
          listId={listId}
          currentUserId={currentUserId}
          isOwner={isOwner}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {!editingTag && !menuOpen && !activeItemId && (
        <>
          <FrequencySuggestionBanner
            suggestions={dueSuggestions}
            onAdd={handleSuggestionAdd}
          />
          <SmartInputBar
            value={inputValue}
            parsed={parsed}
            items={items}
            suggestions={suggestions}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            onScanRequest={handleScanRequest}
          />
        </>
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {scannerOpen && (
        <BarcodeScanner
          getToken={getToken}
          onResult={handleScanResult}
          onError={handleScanError}
          onClose={() => setScannerOpen(false)}
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

      {priceItemId && (() => {
        const priceItem = items.find(i => i.id === priceItemId)
        if (!priceItem) return null
        return (
          <>
            <div className="sheet-overlay" onClick={() => setPriceItemId(null)} />
            <div className="sheet-container">
              <PriceHistorySheet
                item={priceItem}
                listId={listId}
                getToken={getToken}
                onLogPrice={() => handleOpenLogPrice(priceItemId)}
                onClose={() => setPriceItemId(null)}
              />
            </div>
          </>
        )
      })()}

      {logPriceFor && (() => {
        const logItem = items.find(i => i.id === logPriceFor.itemId)
        if (!logItem) return null
        return (
          <>
            <div className="sheet-overlay" onClick={() => setLogPriceFor(null)} />
            <div className="sheet-container">
              <LogPriceSheet
                item={logItem}
                initialAmount={logPriceFor.initialAmount}
                initialPricePer={logPriceFor.initialPricePer}
                initialStore={logPriceFor.initialStore}
                onSave={handleSavePrice}
                onClose={() => setLogPriceFor(null)}
              />
            </div>
          </>
        )
      })()}

      {purchaseToast && (
        <PurchaseToast
          itemName={purchaseToast.itemName}
          onAddPrice={() => { setPurchaseToast(null); handleOpenLogPrice(purchaseToast.itemId) }}
          onDismiss={handleDismissPurchaseToast}
        />
      )}
    </div>
  )
}
