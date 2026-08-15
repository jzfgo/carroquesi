import {
  ChevronDown,
  ImageOff,
  Pencil,
  ScanLine,
  Sun,
  ZapOff,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { manualPurchase } from '../lib/api'
import { isOnline } from '../lib/connectivity'
import { parseAmount } from '../lib/formatPrice'
import { toDateInputValue, todayInputValue } from '../lib/receiptDate'
import { storeKey } from '../lib/storeKey'
import type { PurchaseManualBody } from '../types'
import './ReceiptIllegibleSheet.css'
import { Sheet } from './Sheet'

type Editing = 'store' | 'date' | 'total' | null

interface Props {
  listId: string
  getToken: () => Promise<string>
  /** The lineless scan holding the stored capture; the save links it to the
   *  record it writes, so the purchase shows its paper from day one. Null when
   *  storing the paper failed — the sheet then promises no photo. */
  scanId: string | null
  /** What the parse rescued when it read no lines — each may be null. */
  rescuedStore: string | null
  /** A UTC instant from the parse, or null; reduced to a calendar day here. */
  rescuedDate: string | null
  rescuedTotal: number | null
  /** The list's stores, offered as datalist suggestions for the Tienda field. */
  storeOptions: string[]
  displayStore: (raw: string) => string
  onClose: () => void
  /** After the partial record saves — the parent closes + refreshes the stack. */
  onDone: () => void
  /** «Repetir la foto» — reopen the source picker for a fresh read. */
  onRetakePhoto: () => void
  /** «Descartar» — walk away; nothing was saved, so no confirm. */
  onDiscard: () => void
  showToast: (msg: string) => void
}

/** «26 jul» — the calendar day of a `YYYY-MM-DD`, built from parts to dodge the
 *  UTC-midnight shift that parsing the bare string would cause. */
function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * When the photo can't be read (18c): a scan that returned zero lines is not an
 * error to apologise for, it's a wrinkled ticket. The sheet shows what the parse
 * *did* rescue — store, date, total, all three editable — and offers to save
 * just that as a manual purchase (the merged JAV-129 endpoint). Store + date +
 * total keep the month's spending square; only per-product prices are lost, and
 * that beats forcing a retake. The capture itself is already stored against a
 * lineless scan by then, and the save hands that scan to the record — the
 * unreadable paper survives with the purchase it documents. «Descartar» goes last, in plain ink, no confirm —
 * an exit, not a button pressed by inertia. The three photo tips live here, at
 * failure time, because that's the one moment anyone reads how to take the photo.
 *
 * A standalone bottom sheet, a peer of the review/consent sheets — it is never
 * shown alongside them, so it doesn't touch the swap-contents-in-one-Sheet rule.
 */
export function ReceiptIllegibleSheet({
  listId,
  getToken,
  scanId,
  rescuedStore,
  rescuedDate,
  rescuedTotal,
  storeOptions,
  displayStore,
  onClose,
  onDone,
  onRetakePhoto,
  onDiscard,
  showToast,
}: Props) {
  const [store, setStore] = useState(rescuedStore ?? '')
  const [date, setDate] = useState(
    () => toDateInputValue(rescuedDate) || todayInputValue(),
  )
  const [totalText, setTotalText] = useState(() =>
    // Ungrouped on purpose: this value round-trips through parseAmount, whose
    // comma→dot swap would read a grouped «1.234,50» as 1.234. Seed the plain
    // «1234,50» the field parses cleanly; a thousands separator here would
    // silently truncate a four-figure total on save.
    rescuedTotal != null ? rescuedTotal.toFixed(2).replace('.', ',') : '',
  )
  const [editing, setEditing] = useState<Editing>(null)
  const [saving, setSaving] = useState(false)

  // One suggestion per store, deduped by key, labelled from the registry.
  const stores = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of storeOptions) {
      if (!raw) continue
      const key = storeKey(raw)
      if (!seen.has(key)) {
        seen.add(key)
        out.push(displayStore(raw))
      }
    }
    return out
  }, [storeOptions, displayStore])

  const save = async () => {
    // Offline is read-only: refuse before the write, like every other mutation.
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
        // The stored capture rides along: the backend links the scan to the
        // record it is about to write.
        scan_id: scanId,
      }
      await manualPurchase(getToken, listId, body)
      onDone()
    } catch {
      // Leave the sheet open so the rescued figures aren't lost to a transient
      // failure, and say so — a reset spinner alone reads as nothing happened.
      showToast('No se pudo guardar la compra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet className="rill" label="No se lee el ticket" onClose={onClose}>
      <div className="rill-head">
        <span className="rill-head__thumb" aria-hidden>
          <ImageOff size={20} strokeWidth={1.8} />
        </span>
        <span className="rill-head__text">
          <span className="rill-head__title">No se lee el ticket</span>
          <span className="rill-head__sub">
            {scanId
              ? 'Se distinguen la tienda y el total; la foto se guarda con la compra'
              : 'Se distinguen la tienda y el total, nada más'}
          </span>
        </span>
      </div>

      <div className="rill-card">
        <div className="rill-field">
          <span className="rill-field__label">Tienda</span>
          {editing === 'store' ? (
            <input
              className="rill-field__input"
              list="rill-stores"
              value={store}
              placeholder="Nombre de la tienda"
              autoFocus
              onChange={(e) => setStore(e.target.value)}
              onBlur={() => setEditing(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setEditing(null)
              }}
            />
          ) : (
            <button
              type="button"
              className="rill-pill"
              onClick={() => setEditing('store')}
            >
              {store.trim() || 'Poner tienda'}
              <ChevronDown size={12} strokeWidth={2} />
            </button>
          )}
          <datalist id="rill-stores">
            {stores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        <div className="rill-field">
          <span className="rill-field__label">Fecha</span>
          {editing === 'date' ? (
            <input
              type="date"
              className="rill-field__input"
              value={date}
              max={todayInputValue()}
              autoFocus
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value)
                setEditing(null)
              }}
              onBlur={() => setEditing(null)}
            />
          ) : (
            <button
              type="button"
              className="rill-pill"
              onClick={() => setEditing('date')}
            >
              {formatDayLabel(date)}
              <ChevronDown size={12} strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="rill-field">
          <span className="rill-field__label">Total</span>
          {editing === 'total' ? (
            <span className="rill-total-edit">
              <span className="rill-total-edit__euro">€</span>
              <input
                className="rill-field__input rill-field__input--total"
                inputMode="decimal"
                value={totalText}
                placeholder="0,00"
                autoFocus
                onChange={(e) => setTotalText(e.target.value)}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditing(null)
                }}
              />
            </span>
          ) : (
            <button
              type="button"
              className="rill-pill rill-pill--total"
              onClick={() => setEditing('total')}
            >
              € {totalText.trim() || '0,00'}
              <Pencil size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div className="rill-actions">
        <button
          type="button"
          className="rill-btn rill-btn--primary"
          onClick={onRetakePhoto}
        >
          Repetir la foto
        </button>
        <button
          type="button"
          className="rill-btn rill-btn--secondary"
          onClick={save}
          disabled={saving}
        >
          <Pencil size={16} strokeWidth={1.8} aria-hidden />
          {saving ? 'Guardando…' : 'Guardar solo la tienda y el total'}
        </button>
        <button
          type="button"
          className="rill-btn rill-btn--tertiary"
          onClick={onDiscard}
        >
          Descartar
        </button>
      </div>

      <div className="rill-tips">
        <div className="rill-tips__eyebrow">Para que salga a la primera</div>
        <div className="rill-tips__list">
          <div className="rill-tip">
            <Sun size={15} strokeWidth={1.8} aria-hidden />
            <span>Sobre una superficie lisa y con luz de frente</span>
          </div>
          <div className="rill-tip">
            <ScanLine size={15} strokeWidth={1.8} aria-hidden />
            <span>Que quepa entero, del encabezado al total</span>
          </div>
          <div className="rill-tip">
            <ZapOff size={15} strokeWidth={1.8} aria-hidden />
            <span>Evita reflejos y sombras sobre el papel</span>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
