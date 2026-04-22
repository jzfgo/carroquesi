import { useState } from 'react'
import type { ListItem } from '../types'
import './LogPriceSheet.css'

interface Props {
  item: ListItem
  initialAmount: number | null
  initialPricePer: 'KILOGRAM' | null
  initialStore: string | null
  suggestedStore?: string | null
  onSave: (amount: number, pricePer: 'KILOGRAM' | null, store: string | null) => void
  onClose: () => void
}

export default function LogPriceSheet({ item, initialAmount, initialPricePer, initialStore, suggestedStore, onSave, onClose }: Props) {
  const stores = item.stores ?? []
  // Guard again here so the component stays self-contained if reused elsewhere
  const effectiveSuggestion = stores.length === 0 ? (suggestedStore ?? null) : null

  const [amountStr, setAmountStr] = useState(initialAmount !== null ? String(initialAmount) : '')
  const [pricePer, setPricePer] = useState<'KILOGRAM' | null>(initialPricePer)
  const [selectedStore, setSelectedStore] = useState<string | null>(initialStore ?? effectiveSuggestion)
  const [addingStore, setAddingStore] = useState(false)
  const [newStore, setNewStore] = useState('')

  const amount = parseFloat(amountStr)
  const canSave = !isNaN(amount) && amount > 0

  function handleSave() {
    if (!canSave) return
    const finalStore = addingStore && newStore.trim() ? newStore.trim() : selectedStore
    onSave(amount, pricePer, finalStore)
  }

  function handleStoreChip(store: string) {
    setAddingStore(false)
    setSelectedStore(store === selectedStore ? null : store)
  }

  return (
    <div className="lps">
      <div className="lps__handle" />
      <div className="lps__title">💶 Añadir precio</div>
      <div className="lps__subtitle">{item.name}{item.brand ? ` · ${item.brand}` : ''}</div>
      <div className="lps__field">
        <div className="lps__field-label">Precio pagado</div>
        <div className="lps__input-row">
          <span className="lps__euro">€</span>
          <input className="lps__input" type="number" inputMode="decimal" placeholder="0.00"
            value={amountStr} onChange={e => setAmountStr(e.target.value)} min="0" step="0.01" autoFocus />
          <div className="lps__unit-toggle">
            <button className={`lps__unit-btn${pricePer === null ? ' lps__unit-btn--active' : ''}`}
              onClick={() => setPricePer(null)} type="button">/ud</button>
            <button className={`lps__unit-btn${pricePer === 'KILOGRAM' ? ' lps__unit-btn--active' : ''}`}
              onClick={() => setPricePer('KILOGRAM')} type="button">/kg</button>
          </div>
        </div>
        <div className="lps__legend">
          Introduce el precio normalizado: por unidad (ej. €0.89 por un cartón de leche) o por kg (ej. €3.20/kg de arroz a granel).
        </div>
      </div>
      <div className="lps__field lps__field--last">
        <div className="lps__field-label">Tienda</div>
        <div className="lps__chips">
          {stores.map(store => (
            <button key={store}
              className={`lps__chip${selectedStore === store && !addingStore ? ' lps__chip--selected' : ''}`}
              onClick={() => handleStoreChip(store)} type="button">🏪 {store}</button>
          ))}
          {effectiveSuggestion && (
            <button
              className={`lps__chip${selectedStore === effectiveSuggestion && !addingStore ? ' lps__chip--selected' : ''}`}
              onClick={() => handleStoreChip(effectiveSuggestion)} type="button">🏪 {effectiveSuggestion}</button>
          )}
          <button className="lps__chip lps__chip--add" onClick={() => { setSelectedStore(null); setAddingStore(true) }} type="button">+ otra</button>
        </div>
        {addingStore && (
          <input className="lps__new-store" type="text" placeholder="Nombre de la tienda"
            value={newStore} onChange={e => setNewStore(e.target.value)} autoFocus />
        )}
      </div>
      <button className="lps__save" onClick={handleSave} disabled={!canSave} type="button">Guardar</button>
      <button className="lps__cancel" onClick={onClose} type="button">Cancelar</button>
    </div>
  )
}
