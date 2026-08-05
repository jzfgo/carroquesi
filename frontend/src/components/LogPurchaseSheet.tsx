import { ShoppingCart, Store } from 'lucide-react'
import { useState } from 'react'
import { formatPrice } from '../lib/formatPrice'
import { isTripOpen } from '../lib/isTripOpen'
import { deriveUnit, parseQuantityFactor } from '../lib/itemCost'
import { storeKey } from '../lib/storeKey'
import type { ListItem } from '../types'
import './LogPurchaseSheet.css'
import { Sheet } from './Sheet'

interface Props {
  item: ListItem
  initialAmount: number | null
  initialStore: string | null
  initialPurchasedQuantity: string | null
  suggestedStore?: string | null
  onSave: (
    amount: number,
    pricePer: 'KILOGRAM' | null,
    store: string | null,
    purchasedQuantity: string | null,
  ) => void
  onDelete?: () => Promise<void>
  onClose: () => void
  /** Resolves a raw store string to the list's canonical display name. */
  displayStore?: (raw: string) => string
}

export default function LogPurchaseSheet({
  item,
  initialAmount,
  initialStore,
  initialPurchasedQuantity,
  suggestedStore,
  onSave,
  onDelete,
  onClose,
  displayStore = (raw) => raw,
}: Props) {
  // One chip per store: dedupe spelling variants by key and label with the
  // registry's canonical name.
  const storesByKey = new Map<string, string>()
  for (const s of item.stores ?? []) {
    if (!storesByKey.has(storeKey(s))) {
      storesByKey.set(storeKey(s), displayStore(s))
    }
  }
  const stores = [...storesByKey.values()]
  // Guard again here so the component stays self-contained if reused elsewhere
  const effectiveSuggestion =
    stores.length === 0 ? (suggestedStore ?? null) : null

  const [amountStr, setAmountStr] = useState(
    initialAmount !== null ? String(initialAmount) : '',
  )
  const [selectedStore, setSelectedStore] = useState<string | null>(
    initialStore ?? effectiveSuggestion,
  )
  const [purchasedQtyStr, setPurchasedQtyStr] = useState(
    initialPurchasedQuantity ?? '',
  )
  const [addingStore, setAddingStore] = useState(false)
  const [newStore, setNewStore] = useState('')
  const [deleting, setDeleting] = useState(false)

  // The unit is derived from the quantity, never a toggle (rule 10a): a weight
  // typed there prices per kilo, anything else per unit.
  const { pricePer, suffix } = deriveUnit(purchasedQtyStr)

  const amount = parseFloat(amountStr)
  const canSave = !isNaN(amount) && amount > 0
  const canDelete =
    item.price != null && !!onDelete && isTripOpen(item.purchase_ends_at)

  const liveCost: number | null = (() => {
    const price = parseFloat(amountStr)
    if (isNaN(price) || price <= 0) return null
    const trimmed = purchasedQtyStr.trim()
    if (!trimmed) return null
    const factor = parseQuantityFactor(trimmed, pricePer)
    if (factor === null) return null
    return price * factor
  })()

  function handleSave() {
    if (!canSave) return
    // A hand-typed store that keys-equal an existing chip reuses the chip's
    // form, so price_store doesn't accumulate spelling variants.
    const typed = newStore.trim()
    const finalStore =
      addingStore && typed
        ? (storesByKey.get(storeKey(typed)) ?? typed)
        : selectedStore
    const finalPurchasedQty = purchasedQtyStr.trim() || null
    onSave(amount, pricePer, finalStore, finalPurchasedQty)
  }

  async function handleDelete() {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      // parent shows error toast
    } finally {
      setDeleting(false)
    }
  }

  function handleStoreChip(store: string) {
    setAddingStore(false)
    setSelectedStore(store === selectedStore ? null : store)
  }

  return (
    <Sheet className="lps" label="Registrar compra" onClose={onClose}>
      <div className="lps__title">
        <ShoppingCart size={18} /> Registrar compra
      </div>
      <div className="lps__subtitle">
        {item.name}
        {item.brand ? ` · ${item.brand}` : ''}
      </div>

      <div className="lps__field">
        <div className="lps__field-label">Cantidad · Precio</div>
        <div className="lps__qp-row">
          <input
            className="lps__qty-input"
            type="text"
            placeholder={item.quantity ?? 'ej. 3'}
            value={purchasedQtyStr}
            onChange={(e) => setPurchasedQtyStr(e.target.value)}
          />
          <span className="lps__sep">×</span>
          <span className="lps__euro">€</span>
          {/* No autoFocus: this multi-field form opens without raising the
              keyboard (the field waits for a tap). The «+ otra» store input
              below keeps its autoFocus — it appears on a deliberate tap, not on
              sheet open. */}
          <input
            className="lps__input"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            min="0"
            step="0.01"
          />
          <span className="lps__unit-suffix">{suffix}</span>
        </div>
        <div className="lps__qp-footer">
          <span className="lps__legend">
            Introduce unidades (ej. 3) o peso (ej. 487g, 1.2kg)
          </span>
          {liveCost !== null && (
            <span className="lps__live-cost">≈ {formatPrice(liveCost)}</span>
          )}
        </div>
      </div>

      <div className="lps__field lps__field--last">
        <div className="lps__field-label">Tienda</div>
        <div className="lps__chips">
          {stores.map((store) => (
            <button
              key={store}
              className={`lps__chip${selectedStore === store && !addingStore ? ' lps__chip--selected' : ''}`}
              onClick={() => handleStoreChip(store)}
              type="button"
            >
              <Store size={13} /> {store}
            </button>
          ))}
          {effectiveSuggestion && (
            <button
              className={`lps__chip${selectedStore === effectiveSuggestion && !addingStore ? ' lps__chip--selected' : ''}`}
              onClick={() => handleStoreChip(effectiveSuggestion)}
              type="button"
            >
              <Store size={13} /> {effectiveSuggestion}
            </button>
          )}
          <button
            className="lps__chip lps__chip--add"
            onClick={() => {
              setSelectedStore(null)
              setAddingStore(true)
            }}
            type="button"
          >
            + otra
          </button>
        </div>
        {addingStore && (
          <input
            className="lps__new-store"
            type="text"
            placeholder="Nombre de la tienda"
            value={newStore}
            onChange={(e) => setNewStore(e.target.value)}
            autoFocus
          />
        )}
      </div>
      <button
        className="lps__save"
        onClick={handleSave}
        disabled={!canSave}
        type="button"
      >
        Guardar
      </button>
      {canDelete && (
        <button
          className="lps__delete"
          onClick={handleDelete}
          disabled={deleting}
          type="button"
        >
          {deleting ? 'Eliminando...' : 'Eliminar precio'}
        </button>
      )}
      <button className="lps__cancel" onClick={onClose} type="button">
        Cancelar
      </button>
    </Sheet>
  )
}
