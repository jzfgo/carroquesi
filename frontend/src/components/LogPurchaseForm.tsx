import { ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { formatAmount } from '../lib/formatPrice'
import { deriveUnit, parseQuantityFactor } from '../lib/itemCost'
import { storeKey } from '../lib/storeKey'
import type { ListItem } from '../types'
import './LogPurchaseForm.css'
import { ADD_STORE, StoreSelect } from './StoreSelect'

interface Props {
  item: ListItem
  initialAmount: number | null
  initialStore: string | null
  initialPurchasedQuantity: string | null
  onSave: (
    amount: number,
    pricePer: 'KILOGRAM' | null,
    store: string | null,
    purchasedQuantity: string | null,
  ) => void
  /** Resolves a raw store string to the list's canonical display name. */
  displayStore?: (raw: string) => string
}

export default function LogPurchaseForm({
  item,
  initialAmount,
  initialStore,
  initialPurchasedQuantity,
  onSave,
  displayStore = (raw) => raw,
}: Props) {
  // One offer per store: dedupe spelling variants by key and label with the
  // registry's canonical name. The trip's store comes first, because the
  // price was paid there.
  const storesByKey = new Map<string, string>()
  const offered = [
    ...(item.purchase_store ? [item.purchase_store] : []),
    ...(item.stores ?? []),
  ]
  for (const s of offered) {
    if (!storesByKey.has(storeKey(s))) {
      storesByKey.set(storeKey(s), displayStore(s))
    }
  }
  const stores = [...storesByKey.values()]

  const [amountStr, setAmountStr] = useState(
    initialAmount !== null ? String(initialAmount) : '',
  )
  const [selectedStore, setSelectedStore] = useState<string | null>(
    initialStore,
  )
  const [purchasedQtyStr, setPurchasedQtyStr] = useState(
    initialPurchasedQuantity ?? '',
  )
  const [addingStore, setAddingStore] = useState(false)
  const [newStore, setNewStore] = useState('')

  // The unit is derived from the quantity, never a toggle (rule 10a): a weight
  // typed there prices per kilo, anything else per unit.
  const { pricePer, suffix } = deriveUnit(purchasedQtyStr)

  const amount = parseFloat(amountStr)
  const canSave = !isNaN(amount) && amount > 0

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

  return (
    <div className="lps">
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
          {/* One span, so the flex gap never splits «€» from «/ud». */}
          <span className="lps__euro">
            €<span className="lps__unit-suffix">{suffix}</span>
          </span>
        </div>
        <div className="lps__qp-footer">
          <span className="lps__legend">
            Introduce unidades (ej. 3) o peso (ej. 487g, 1.2kg)
          </span>
          {liveCost !== null && (
            <span className="lps__live-cost">≈ {formatAmount(liveCost)}</span>
          )}
        </div>
      </div>

      <div className="lps__field lps__field--last">
        <div className="lps__field-label">Tienda</div>
        {/* «+ otra» reveals the field below (no sub-view here); while it is
            open the select shows that entry as the current choice. */}
        <StoreSelect
          className="lps__store"
          options={stores}
          value={addingStore ? ADD_STORE : (selectedStore ?? '')}
          onSelect={(v) => {
            setAddingStore(false)
            setSelectedStore(v || null)
          }}
          onAddNew={() => {
            setSelectedStore(null)
            setAddingStore(true)
          }}
          emptyLabel="Sin tienda"
        />
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
    </div>
  )
}
