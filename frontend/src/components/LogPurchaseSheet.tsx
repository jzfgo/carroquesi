import { ShoppingCart, Store } from 'lucide-react';
import { useRef, useState } from 'react';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import { formatPrice } from '../lib/formatPrice';
import { isSameCalendarDay } from '../lib/isSameCalendarDay';
import { parseQuantityFactor } from '../lib/itemCost';
import type { ListItem } from '../types';
import './LogPurchaseSheet.css';

interface Props {
  item: ListItem;
  initialAmount: number | null;
  initialPricePer: 'KILOGRAM' | null;
  initialStore: string | null;
  initialPurchasedQuantity: string | null;
  suggestedStore?: string | null;
  onSave: (
    amount: number,
    pricePer: 'KILOGRAM' | null,
    store: string | null,
    purchasedQuantity: string | null,
  ) => void;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  isOffline?: boolean;
}

export default function LogPurchaseSheet({
  item,
  initialAmount,
  initialPricePer,
  initialStore,
  initialPurchasedQuantity,
  suggestedStore,
  onSave,
  onDelete,
  onClose,
  isOffline,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToDismiss(sheetRef, onClose);

  const stores = item.stores ?? [];
  // Guard again here so the component stays self-contained if reused elsewhere
  const effectiveSuggestion =
    stores.length === 0 ? (suggestedStore ?? null) : null;

  const [amountStr, setAmountStr] = useState(
    initialAmount !== null ? String(initialAmount) : '',
  );
  const [pricePer, setPricePer] = useState<'KILOGRAM' | null>(initialPricePer);
  const [selectedStore, setSelectedStore] = useState<string | null>(
    initialStore ?? effectiveSuggestion,
  );
  const [purchasedQtyStr, setPurchasedQtyStr] = useState(
    initialPurchasedQuantity ?? '',
  );
  const [addingStore, setAddingStore] = useState(false);
  const [newStore, setNewStore] = useState('');
  const [deleting, setDeleting] = useState(false);

  const amount = parseFloat(amountStr);
  const canSave = !isNaN(amount) && amount > 0;
  const canDelete =
    item.price != null && !!onDelete && isSameCalendarDay(item.purchased_at);

  const liveCost: number | null = (() => {
    const price = parseFloat(amountStr);
    if (isNaN(price) || price <= 0) return null;
    const trimmed = purchasedQtyStr.trim();
    if (!trimmed) return null;
    const factor = parseQuantityFactor(trimmed, pricePer);
    if (factor === null) return null;
    return price * factor;
  })();

  function handleSave() {
    if (!canSave) return;
    const finalStore =
      addingStore && newStore.trim() ? newStore.trim() : selectedStore;
    const finalPurchasedQty = purchasedQtyStr.trim() || null;
    onSave(amount, pricePer, finalStore, finalPurchasedQty);
  }

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      // parent shows error toast
    } finally {
      setDeleting(false);
    }
  }

  function handleStoreChip(store: string) {
    setAddingStore(false);
    setSelectedStore(store === selectedStore ? null : store);
  }

  return (
    <div className="lps" ref={sheetRef}>
      <div className="lps__handle" {...swipe} />
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
          <input
            className="lps__input"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            min="0"
            step="0.01"
            autoFocus
          />
          <div className="lps__unit-toggle">
            <button
              className={`lps__unit-btn${pricePer === null ? ' lps__unit-btn--active' : ''}`}
              onClick={() => setPricePer(null)}
              type="button"
            >
              /ud
            </button>
            <button
              className={`lps__unit-btn${pricePer === 'KILOGRAM' ? ' lps__unit-btn--active' : ''}`}
              onClick={() => setPricePer('KILOGRAM')}
              type="button"
            >
              /kg
            </button>
          </div>
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
              setSelectedStore(null);
              setAddingStore(true);
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
      {isOffline && <p className="lps__offline-msg">Disponible con conexión</p>}
      <button
        className="lps__save"
        onClick={handleSave}
        disabled={!canSave || !!isOffline}
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
    </div>
  );
}
