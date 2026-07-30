import { ChevronRight } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { linesTotal, toPayload, type CloseLine } from '../lib/closeLines'
import { formatPrice } from '../lib/formatPrice'
import { madridDay, naiveUtcForMadridNoon } from '../lib/tripDay'
import type { PurchaseClosePayload } from '../types'
import './CloseTripSheet.css'
import { CostBadge } from './CostBadge'

export interface CloseTripSheetProps {
  initialLines: CloseLine[]
  storeSuggestions: string[]
  /** The trip's own day, so an old shop is not stamped with today. */
  defaultDate: string
  /** Null closes the trip that is still open. */
  purchaseId: string | null
  isOffline: boolean
  onSave: (payload: PurchaseClosePayload) => void | Promise<void>
  onClose: () => void
  onEditLine?: (line: CloseLine, apply: (next: CloseLine) => void) => void
}

/**
 * What a shop was: the shop, the day, and the lines that came home.
 *
 * The rows arrive already ticked when they were picked up, and offered
 * unticked when they were not. Unticking one leaves it exactly where it is —
 * still bought, still in the cart, waiting for the next ticket. That is how
 * one evening with two shops becomes two tickets.
 */
export function CloseTripSheet({
  initialLines,
  storeSuggestions,
  defaultDate,
  purchaseId,
  isOffline,
  onSave,
  onClose,
  onEditLine,
}: CloseTripSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  // Seeded once, on purpose. The list is polled every few seconds, and rows
  // rewritten under a household in the middle of pricing them would lose what
  // they had typed. A caller that needs fresh rows must mount a fresh sheet.
  const [lines, setLines] = useState(initialLines)
  const [store, setStore] = useState('')
  const [addingStore, setAddingStore] = useState(false)
  const [newStore, setNewStore] = useState('')
  // The trip's own day, not today, and the day it was in Madrid rather than
  // in UTC. Stamping an old shop with today's date would file its prices under
  // a day nobody shopped.
  const [day, setDay] = useState(() => madridDay(defaultDate))
  // The sheet used to be unmounted the instant this was pressed, which hid
  // the fact that nothing stops a second press. It stays up through a failure
  // now — deliberately, so a refused close does not take the shop with it —
  // so the guard has to be real. Two presses on a slow connection would file
  // the cart twice, and the second would come back refused and toast a
  // failure over a shop that saved.
  const [saving, setSaving] = useState(false)

  // Counts the rows added by hand. A key built from how many rows there are
  // would come round again after one is added and dropped, and React would
  // fold the new row into the old one's place.
  const added = useRef(0)

  const effectiveStore = addingStore ? newStore.trim() : store
  const includedCount = lines.filter((l) => l.included).length
  const unpriced = lines.filter((l) => l.included && l.price == null).length
  const allIncluded = lines.length > 0 && includedCount === lines.length
  const total = useMemo(() => linesTotal(lines), [lines])
  const canSave = effectiveStore !== '' && day !== '' && includedCount > 0

  function toggle(key: string) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, included: !l.included } : l)),
    )
  }

  function toggleAll() {
    setLines((prev) => prev.map((l) => ({ ...l, included: !allIncluded })))
  }

  function apply(next: CloseLine) {
    setLines((prev) => {
      const at = prev.findIndex((l) => l.key === next.key)
      if (at === -1) return [...prev, next]
      const copy = [...prev]
      copy[at] = next
      return copy
    })
  }

  // A shop picked from the row settles the question, so a half-typed name
  // stops being what saves. The two can never disagree at the door.
  function pickStore(name: string) {
    setAddingStore(false)
    setStore(name === store ? '' : name)
  }

  function addProduct() {
    onEditLine?.(
      {
        key: `new-${added.current++}`,
        itemId: null,
        name: '',
        brand: null,
        quantity: null,
        price: null,
        pricePer: null,
        included: true,
        fromCart: false,
      },
      apply,
    )
  }

  async function handleSave() {
    if (!canSave || saving) return
    // Left where it was when the day was not touched, so the trip keeps its
    // own instant. Moved to a different day, it goes to noon there — far
    // enough from either midnight that no offset can drag it into a
    // neighbouring day.
    const purchasedAt =
      day === madridDay(defaultDate) ? defaultDate : naiveUtcForMadridNoon(day)
    setSaving(true)
    try {
      await onSave(
        toPayload(lines, {
          store: effectiveStore,
          purchasedAt,
          purchaseId,
          // A close written by hand never confirms a figure. Only a receipt
          // does.
          total: null,
        }),
      )
    } finally {
      // Released even on success. The sheet is usually gone by then, and on
      // the paths where it is not, a stuck button would be the second thing
      // to go wrong after whatever kept it open.
      setSaving(false)
    }
  }

  return (
    <div className="cts" ref={sheetRef}>
      <div className="cts__handle" {...swipe} />

      <div className="cts__head">
        {/* Where the paper goes. Dashed because there is none yet: this trip
            was written by hand, and a scan has not been laid over it. */}
        <div className="cts__thumb" aria-hidden />
        <div className="cts__head-body">
          <h2 className="cts__title">Cerrar compra</h2>
          <div className="cts__pills">
            {storeSuggestions.map((name) => (
              <button
                key={name}
                type="button"
                className={`cts__pill${
                  store === name && !addingStore ? ' cts__pill--on' : ''
                }`}
                onClick={() => pickStore(name)}
              >
                {name}
              </button>
            ))}
            {/* Nothing is preselected. The app does not know where the
                household went, and the suggestions are only shops this list
                has bought from before. */}
            <button
              type="button"
              className="cts__pill cts__pill--ask"
              onClick={() => {
                setStore('')
                setAddingStore(true)
              }}
            >
              {storeSuggestions.length === 0 ? 'Elegir tienda' : '+ otra'}
            </button>
            <input
              type="date"
              className="cts__date"
              aria-label="Fecha"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
            <span className="cts__pill-count">{lines.length} productos</span>
          </div>
          {addingStore && (
            <input
              className="cts__new-store"
              aria-label="Tienda"
              value={newStore}
              onChange={(e) => setNewStore(e.target.value)}
              autoFocus
            />
          )}
        </div>
      </div>

      <div className="cts__bar">
        <span className="cts__bar-count">
          {`${includedCount} de ${lines.length}${
            unpriced > 0 ? ` · ${unpriced} sin precio` : ''
          }`}
        </span>
        <button type="button" className="cts__bar-all" onClick={toggleAll}>
          {allIncluded ? 'Quitar todas' : 'Marcar todas'}
        </button>
      </div>

      {lines.map((line) => (
        <div className="cts__row" key={line.key}>
          <input
            type="checkbox"
            className="cts__check"
            aria-label={line.name}
            checked={line.included}
            onChange={() => toggle(line.key)}
          />
          <span className="cts__name">
            {line.name}
            {(line.brand || !line.fromCart) && (
              <small className="cts__meta">
                {[line.brand, line.fromCart ? null : 'sigue en la lista']
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            )}
          </span>
          <span className="cts__qty">{line.quantity}</span>
          <span
            className={`cts__amount${
              line.price == null ? ' cts__amount--none' : ''
            }`}
          >
            {line.price == null
              ? 'sin precio'
              : formatPrice(line.price, line.pricePer)}
          </span>
          <button
            type="button"
            className="cts__door"
            aria-label={`Ajustar ${line.name}`}
            onClick={() => onEditLine?.(line, apply)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      ))}

      <button type="button" className="cts__add" onClick={addProduct}>
        Añadir producto
      </button>

      {/* A floor, and it says so. Under this label the mark means a row you
          ticked is not in the figure — no price, or a weight nobody can
          read. */}
      <div className="cts__total">
        <span className="cts__total-label">Total de lo que has puesto</span>
        {total ? (
          <CostBadge cost={total} className="cts__total-amount" />
        ) : (
          <span className="cts__total-amount">—</span>
        )}
      </div>

      <button
        type="button"
        className="cts__save"
        onClick={handleSave}
        disabled={!canSave || saving}
      >
        Guardar compra
      </button>
      {/* Not "needs a connection", the way a sheet that writes straight to the
          API says it. This close goes through the offline queue, so it is kept
          and sent later — and a supermarket basement is where it will most
          often be written. */}
      {isOffline && (
        <p className="cts__offline">Se guardará cuando vuelva la conexión</p>
      )}
      <button type="button" className="cts__cancel" onClick={onClose}>
        Cancelar
      </button>
    </div>
  )
}
