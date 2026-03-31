import { useState, useEffect, useCallback, useMemo } from 'react'
import './ListScreen.css'
import { ListHeader } from './ListHeader'
import { ProgressBar } from './ProgressBar'
import { StoreFilter } from './StoreFilter'
import { ItemList } from './ItemList'
import { SmartInputBar } from './SmartInputBar'
import { TagEditSheet } from './TagEditSheet'
import { ItemActionSheet } from './ItemActionSheet'
import { Toast } from './Toast'
import { ListMembersSheet } from './ListMembersSheet'
import { BarcodeScanner } from './BarcodeScanner'
import { BarcodeScanSheet } from './BarcodeScanSheet'
import { parseInput } from '../parseInput'
import { useAuth } from '../contexts/AuthContext'
import { useListItems } from '../hooks/useListItems'
import { getSuggestions } from '../lib/api'
import type { BarcodeRead, EditingTag, TagField } from '../types'

interface Props {
  listId: string
  listName: string
  listOwnerId: string
  onBack?: () => void
}

export function ListScreen({ listId, listName, listOwnerId, onBack }: Props) {
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
  const currentUserId = user!.id
  const isOwner = listOwnerId === currentUserId

  const parsed = useMemo(() => parseInput(inputValue), [inputValue])
  const { status, items, members, togglePurchased, addItem, updateTag, renameItem, removeItem, retry } =
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

  const handleTogglePurchased = useCallback(
    (itemId: string) => {
      void togglePurchased(itemId)
    },
    [togglePurchased],
  )

  const handleTagClick = useCallback((itemId: string, field: TagField) => {
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

  const handleScanNotFound = useCallback(() => {
    setScannerOpen(false)
    setToast('Producto no encontrado')
  }, [])

  const handleScanAdd = useCallback((item: { name: string; brand: string | null; store: null }) => {
    setScannedProduct(null)
    void addItem({ name: item.name, brand: item.brand, store: null, quantity: null, variety: null })
  }, [addItem])

  const handleScanEdit = useCallback((prefill: string) => {
    setScannedProduct(null)
    setInputValue(prefill)
  }, [])

  const purchasedCount = items.filter((i) => i.purchased).length

  const stores = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of items) {
      if (item.store && !seen.has(item.store)) {
        seen.add(item.store)
        result.push(item.store)
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

  const filteredItems = activeStore ? items.filter(i => i.store === activeStore || i.store === null) : items

  return (
    <div className="list-screen">
      <ListHeader title={listName} onMenuOpen={handleMenuToggle} onBack={onBack} />
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
      />
      {editingTag && (() => {
        const editedItem = items.find(i => i.id === editingTag.itemId)
        if (!editedItem) return null
        return (
          <TagEditSheet
            key={`${editingTag.itemId}-${editingTag.field}`}
            item={editedItem}
            field={editingTag.field}
            items={items}
            onSave={(value) => { void updateTag(editingTag.itemId, editingTag.field, value); setEditingTag(null) }}
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
        <SmartInputBar
          value={inputValue}
          parsed={parsed}
          items={items}
          suggestions={suggestions}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          onScanRequest={handleScanRequest}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      {scannerOpen && (
        <BarcodeScanner
          getToken={getToken}
          onResult={handleScanResult}
          onNotFound={handleScanNotFound}
          onClose={() => setScannerOpen(false)}
        />
      )}
      {scannedProduct && (
        <BarcodeScanSheet
          product={scannedProduct}
          onAdd={handleScanAdd}
          onEdit={handleScanEdit}
          onClose={() => setScannedProduct(null)}
        />
      )}
    </div>
  )
}
