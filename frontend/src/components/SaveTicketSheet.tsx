import { Calendar, ChevronLeft, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'
import { manualPurchase } from '../lib/api'
import { isOnline } from '../lib/connectivity'
import { parseAmount } from '../lib/formatPrice'
import { storeKey } from '../lib/storeKey'
import type { PurchaseManualBody } from '../types'
import './SaveTicketSheet.css'
import { Sheet } from './Sheet'

interface Props {
  listId: string
  getToken: () => Promise<string>
  /** The list's stores, offered as chips. A store is optional here — a bare
   *  dated record is a legitimate purchase. */
  storeOptions?: string[]
  displayStore: (raw: string) => string
  onClose: () => void
  /** After a saved record — the parent refreshes the list + stack. */
  onDone: () => void
  /** Surfaces a refusal or failure as a toast (offline, or a lost save). */
  showToast: (msg: string) => void
  /** «Escanear el ticket» — hand off to the receipt flow. Present only when
   *  receipt scanning is on; absent hides the branch. */
  onScanReceipt?: () => void
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/**
 * Save a ticket by hand (26a): write down a shop that was never tracked here.
 * Unlike closing the cart, this claims no lines — it records that a shop
 * happened on a stated day, optionally where and for how much (the merged
 * manual-purchase endpoint). When receipt scanning is on, «Escanear el ticket»
 * offers the richer path instead.
 *
 * One sheet whose contents swap between the form and the «Nueva tienda» step —
 * never a second sheet (the app-wide sheet↔sub-sheet rule).
 */
export function SaveTicketSheet({
  listId,
  getToken,
  storeOptions = [],
  displayStore,
  onClose,
  onDone,
  showToast,
  onScanReceipt,
}: Props) {
  const [store, setStore] = useState('')
  // Stores added by hand through «+ otra», offered as chips beside the registry's.
  const [extraStores, setExtraStores] = useState<string[]>([])
  const [storeSubsheet, setStoreSubsheet] = useState(false)
  const [newStoreText, setNewStoreText] = useState('')
  const [date, setDate] = useState(today())
  const [totalText, setTotalText] = useState('')
  const [saving, setSaving] = useState(false)

  // One chip per store, deduped by key, labelled with the registry's name.
  const stores = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of [...storeOptions, ...extraStores]) {
      if (!raw) continue
      const key = storeKey(raw)
      if (!seen.has(key)) {
        seen.add(key)
        out.push(displayStore(raw))
      }
    }
    return out
  }, [storeOptions, extraStores, displayStore])

  // Confirm a hand-typed store from the «Nueva tienda» step: keep it as a chip
  // and select it, then return to the form.
  const confirmNewStore = () => {
    const v = newStoreText.trim()
    if (!v) return
    setExtraStores((xs) =>
      xs.some((x) => storeKey(x) === storeKey(v)) ? xs : [...xs, v],
    )
    setStore(v)
    setStoreSubsheet(false)
  }

  const save = async () => {
    // Offline is read-only: refuse before the write, with a toast, like every
    // other mutation — a silent no-op reads as nothing happened.
    if (!isOnline()) {
      showToast('Sin conexión')
      return
    }
    setSaving(true)
    try {
      const body: PurchaseManualBody = {
        date,
        // A store is optional; a blank one is a bare record, not a shop named "".
        store: store.trim() || null,
        total: parseAmount(totalText),
      }
      await manualPurchase(getToken, listId, body)
      onDone()
    } catch {
      // Leave the sheet open so the entry is not lost to a transient failure,
      // and say so — the spinner resetting alone looks like nothing happened.
      showToast('No se pudo guardar la compra')
    } finally {
      setSaving(false)
    }
  }

  const step: 'store' | 'form' = storeSubsheet ? 'store' : 'form'
  return (
    <Sheet
      className={`save-sheet${step !== 'form' ? ' save-sheet--editing' : ''}`}
      onClose={onClose}
      onDismiss={step === 'store' ? () => setStoreSubsheet(false) : undefined}
      label={step === 'store' ? 'Nueva tienda' : 'Guardar un ticket'}
    >
      {step === 'store' ? (
        <div className="save-sheet__view">
          <button
            type="button"
            className="save-sheet__back"
            onClick={() => setStoreSubsheet(false)}
          >
            <ChevronLeft size={22} strokeWidth={1.8} aria-hidden />
            Guardar un ticket
          </button>
          <div className="save-sheet__body">
            <label className="save-field">
              <span className="save-field__label">Tienda</span>
              <input
                className="save-field__box"
                value={newStoreText}
                onChange={(e) => setNewStoreText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmNewStore()
                }}
                placeholder="Nombre de la tienda"
                autoFocus
              />
            </label>
          </div>
          <div className="save-sheet__footer">
            <button
              type="button"
              className="save-sheet__save"
              onClick={confirmNewStore}
              disabled={newStoreText.trim() === ''}
            >
              Usar esta tienda
            </button>
          </div>
        </div>
      ) : (
        <div className="save-sheet__view">
          <div className="save-sheet__head">
            <h2 className="save-sheet__title">Guardar un ticket</h2>
            <p className="save-sheet__subtitle">
              De una compra que no apuntaste aquí
            </p>
          </div>

          {onScanReceipt && (
            <button
              type="button"
              className="save-sheet__scan"
              onClick={onScanReceipt}
            >
              <Receipt size={16} aria-hidden /> Escanear el ticket
            </button>
          )}

          <div className="save-sheet__field-block">
            <span className="save-field__label">Tienda · opcional</span>
            <div className="save-sheet__chips">
              {stores.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`save-chip${storeKey(s) === storeKey(store) ? ' save-chip--on' : ''}`}
                  aria-pressed={storeKey(s) === storeKey(store)}
                  // Tap toggles: a store is optional, so a second tap clears it.
                  onClick={() => setStore((cur) => (cur === s ? '' : s))}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                className="save-chip save-chip--add"
                aria-label="Añadir otra tienda"
                onClick={() => {
                  setNewStoreText('')
                  setStoreSubsheet(true)
                }}
              >
                + otra
              </button>
            </div>
          </div>

          <div className="save-sheet__row">
            <label className="save-sheet__field-block">
              <span className="save-field__label">Fecha</span>
              <span className="save-date">
                <Calendar size={14} aria-hidden />
                <input
                  type="date"
                  className="save-date__input"
                  value={date}
                  max={today()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </span>
            </label>
            <label className="save-sheet__field-block">
              <span className="save-field__label">Total · opcional</span>
              <span className="save-total">
                <span className="save-total__euro">€</span>
                <input
                  className="save-total__input"
                  value={totalText}
                  onChange={(e) => setTotalText(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </span>
            </label>
          </div>

          <div className="save-sheet__footer">
            <button
              type="button"
              className="save-sheet__save"
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar compra'}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
