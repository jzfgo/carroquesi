import { Camera, ChevronRight, Maximize2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import {
  discardPaper,
  linesTotal,
  receiptTotal,
  toPayload,
  type CloseLine,
} from '../lib/closeLines'
import { formatPrice } from '../lib/formatPrice'
import { madridDay, naiveUtcForMadridNoon } from '../lib/tripDay'
import type { PurchaseClosePayload, PurchaseNameMapping } from '../types'
import './CloseTripSheet.css'
import { CostBadge } from './CostBadge'

/** The paper a ticket-mode sheet was filled in from. */
export interface CloseReceipt {
  /** The scan the rows came from, so the close can be tied back to it. */
  scanId: string
  /** The photograph, as something an `<img>` can show. */
  imageUrl: string
  /** The total printed on the paper. Null when the scan could not read it. */
  total: number | null
  /** The shop the scan read. Null when it could not. */
  store: string | null
  /** The instant the paper printed, hour and all. Null when unreadable. */
  date: string | null
}

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
  /** Open whatever answers a row. The caller is handed the rows as they stand,
   *  because which sheet it opens and what that sheet may offer are both read
   *  off them. */
  onEditLine?: (
    line: CloseLine,
    apply: (next: CloseLine, claimed?: string) => void,
    lines: CloseLine[],
  ) => void
  /** The paper behind these rows, when one has been read. */
  receipt?: CloseReceipt | null
  /** The printed lines somebody named a product for. The caller collects these
   *  as the answers are given, because it is the caller that asks. */
  mappings?: PurchaseNameMapping[]
  /** Whether this household can have a paper read at all. */
  canScan?: boolean
  /** Read a paper: the first one, or this one again. The caller picks the
   *  image, runs the scan, and mounts a fresh sheet with the rows it gives. */
  onScan?: () => void
}

/** What to call a row out loud. A line the paper printed may have no product
 *  yet, and the printed string is the only name it has. */
function rowLabel(line: CloseLine): string {
  return line.name || line.receiptLine || ''
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
  receipt,
  mappings = [],
  canScan = false,
  onScan,
}: CloseTripSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  // Seeded once, on purpose. The list is polled every few seconds, and rows
  // rewritten under a household in the middle of pricing them would lose what
  // they had typed. A caller that needs fresh rows must mount a fresh sheet.
  const [lines, setLines] = useState(initialLines)
  // Seeded once as well, and dropped here rather than by the caller. Reading
  // a paper again replaces every row, so it arrives as a fresh sheet.
  // Discarding one is the opposite promise — what was typed survives — so it
  // happens in place.
  const [paper, setPaper] = useState(receipt ?? null)
  const [paperActions, setPaperActions] = useState(false)
  const [viewingPaper, setViewingPaper] = useState(false)
  const [store, setStore] = useState(receipt?.store ?? '')
  const [addingStore, setAddingStore] = useState(false)
  const [newStore, setNewStore] = useState('')
  // The instant the sheet keeps while nobody touches the day: the paper's
  // printed hour in ticket mode, the trip's own instant in hand mode. Read
  // from the prop and not from the paper's state, so discarding an untouched
  // receipt does not quietly move the stamp to midday.
  const anchorDate = receipt ? receipt.date : defaultDate
  // The day it was in Madrid rather than in UTC. Stamping an old shop with
  // today's date would file its prices under a day nobody shopped.
  const [day, setDay] = useState(() =>
    anchorDate ? madridDay(anchorDate) : '',
  )
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
  const unpriced = lines.filter(
    (l) => l.included && l.price == null && l.receiptAmount == null,
  ).length
  const allIncluded = lines.length > 0 && includedCount === lines.length
  const total = useMemo(() => linesTotal(lines), [lines])
  const canSave = effectiveStore !== '' && day !== '' && includedCount > 0
  // A shop the scan read may be one this list has never bought from, and it
  // still has to show as picked. It leads the row, where correcting it is one
  // tap.
  const stores = useMemo(
    () =>
      receipt?.store && !storeSuggestions.includes(receipt.store)
        ? [receipt.store, ...storeSuggestions]
        : storeSuggestions,
    [receipt?.store, storeSuggestions],
  )
  // Every line the paper printed, ticked or not, because an unticked line is
  // still on the receipt.
  const paperSum = useMemo(() => receiptTotal(lines), [lines])
  // Null when there is nothing to check: no paper, or a scan that could not
  // read the total.
  //
  // Both figures are two-decimal money added as floats, so a receipt that
  // adds up to the cent still misses by a fraction of one. Compared exactly,
  // the check would call a perfect receipt wrong.
  const check =
    paper?.total != null && paperSum != null
      ? {
          printed: paper.total,
          offBy: Math.round(paperSum * 100) - Math.round(paper.total * 100),
        }
      : null
  // Reading a paper is a network round trip, and this sheet is written in a
  // supermarket basement more often than anywhere else.
  const canRead = canScan && !isOffline

  function toggle(key: string) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, included: !l.included } : l)),
    )
  }

  function toggleAll() {
    setLines((prev) => prev.map((l) => ({ ...l, included: !allIncluded })))
  }

  // `claimed` is a row the answer took over. One product cannot sit on two
  // rows of one ticket: the payload would send it twice and the sheet would
  // show it twice.
  function apply(next: CloseLine, claimed?: string) {
    setLines((prev) => {
      const rest = claimed ? prev.filter((l) => l.key !== claimed) : prev
      const at = rest.findIndex((l) => l.key === next.key)
      if (at === -1) return [...rest, next]
      const copy = [...rest]
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

  // Takes the paper's authority off the sheet and keeps everything it read.
  // The names, amounts and ticks stay as ordinary typed values, so the sheet
  // must not be rebuilt around them.
  function discard() {
    setPaperActions(false)
    setViewingPaper(false)
    setPaper(null)
    setLines(discardPaper)
  }

  function readPaper() {
    setPaperActions(false)
    onScan?.()
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
      lines,
    )
  }

  async function handleSave() {
    if (!canSave || saving) return
    // Left where it was when the day was not touched, so the trip keeps its
    // own instant. Moved to a different day, it goes to noon there — far
    // enough from either midnight that no offset can drag it into a
    // neighbouring day.
    const purchasedAt =
      anchorDate && day === madridDay(anchorDate)
        ? anchorDate
        : naiveUtcForMadridNoon(day)
    const payload = toPayload(lines, {
      store: effectiveStore,
      purchasedAt,
      purchaseId,
      // The paper's own printed figure, and nothing else. A close written by
      // hand confirms no total.
      total: paper?.total ?? null,
    })
    setSaving(true)
    try {
      await onSave(
        paper
          ? {
              ...payload,
              scan_id: paper.scanId,
              // Only with the paper. Both fields are the scan's own, and a
              // close that no longer names a scan may not carry either.
              mappings,
            }
          : payload,
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
        {paper ? (
          // Adding a paper is additive, so it costs one tap. The two things
          // that undo one sit behind the preview, which is also how the
          // destructive one stays apart without a dialog asking twice.
          <div className="cts__paper">
            <button
              type="button"
              className="cts__paper-preview"
              aria-label="Qué hacer con el ticket"
              aria-expanded={paperActions}
              onClick={() => setPaperActions((open) => !open)}
            >
              <img className="cts__paper-img" src={paper.imageUrl} alt="" />
            </button>
            <button
              type="button"
              className="cts__paper-badge"
              aria-label="Ver el ticket"
              onClick={() => setViewingPaper(true)}
            >
              <Maximize2 size={11} />
            </button>
            {paperActions && (
              <div className="cts__paper-menu">
                <button
                  type="button"
                  className="cts__paper-action"
                  disabled={!canRead}
                  onClick={readPaper}
                >
                  Volver a leerlo
                </button>
                {/* No connection needed: nothing leaves the sheet. */}
                <button
                  type="button"
                  className="cts__paper-action cts__paper-action--drop"
                  onClick={discard}
                >
                  Descartar el ticket
                </button>
              </div>
            )}
          </div>
        ) : (
          // Where the paper goes. Dashed because there is none yet: this trip
          // was written by hand, and a scan has not been laid over it.
          <button
            type="button"
            className="cts__thumb"
            aria-label="Escanear ticket"
            disabled={!canRead}
            onClick={() => onScan?.()}
          >
            <Camera size={18} />
          </button>
        )}
        <div className="cts__head-body">
          <h2 className="cts__title">Cerrar compra</h2>
          <div className="cts__pills">
            {stores.map((name) => (
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
              {stores.length === 0 ? 'Elegir tienda' : '+ otra'}
            </button>
            {/* Dashed while it holds no answer — the same grammar as the
                annotations below. A scan that could not read the day leaves
                it empty, and the sheet waits for it. */}
            <input
              type="date"
              className={`cts__date${day === '' ? ' cts__date--ask' : ''}`}
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
            aria-label={rowLabel(line)}
            checked={line.included}
            onChange={() => toggle(line.key)}
          />
          <span className="cts__name">
            {line.receiptLine != null ? (
              <>
                {/* The paper leads, because the printed string is the only
                    thing a person can check against what they are holding.
                    What the app believes goes under it, said by its form
                    rather than by a word. */}
                <span className="cts__raw">{line.receiptLine}</span>
                <span
                  className={`cts__guess${
                    line.matchState === 'literal' ? '' : ' cts__guess--ask'
                  }`}
                >
                  {line.name || 'Asignar producto'}
                </span>
              </>
            ) : (
              <>
                {line.name}
                {(line.brand || !line.fromCart) && (
                  <small className="cts__meta">
                    {[line.brand, line.fromCart ? null : 'sigue en la lista']
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                )}
              </>
            )}
          </span>
          <span className="cts__qty">{line.quantity}</span>
          {/* Where the paper printed a figure, the sheet repeats it. Working
              it out again from the price is arithmetic the paper already did,
              and the second attempt is the one that rounds. */}
          <span
            className={`cts__amount${
              line.receiptAmount == null && line.price == null
                ? ' cts__amount--none'
                : ''
            }`}
          >
            {line.receiptAmount != null
              ? formatPrice(line.receiptAmount)
              : line.price == null
                ? 'sin precio'
                : formatPrice(line.price, line.pricePer)}
          </span>
          <button
            type="button"
            className="cts__door"
            aria-label={`${
              line.itemId == null && line.receiptLine != null
                ? 'Asignar'
                : 'Ajustar'
            } ${rowLabel(line)}`}
            onClick={() => onEditLine?.(line, apply, lines)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      ))}

      <button type="button" className="cts__add" onClick={addProduct}>
        Añadir producto
      </button>

      {check ? (
        // The paper's figure against what its own lines add up to. Nothing is
        // ever moved to make the two agree: a till discount is ordinary, and
        // closing the arithmetic by hand would be inventing data.
        <div
          className={`cts__recon${check.offBy === 0 ? ' cts__recon--ok' : ' cts__recon--off'}`}
        >
          <span className="cts__recon-dot" aria-hidden />
          <span className="cts__recon-label">
            {check.offBy === 0
              ? 'Cuadra con el ticket'
              : 'No cuadra con el ticket'}
          </span>
          <span className="cts__recon-amount">
            {formatPrice(check.printed)}
            {check.offBy !== 0 && (
              <small className="cts__recon-diff">
                {`${check.offBy > 0 ? '+' : '−'}${formatPrice(
                  Math.abs(check.offBy) / 100,
                )}`}
              </small>
            )}
          </span>
        </div>
      ) : (
        // A floor, and it says so. Under this label the mark means a row you
        // ticked is not in the figure — no price, or a weight nobody can
        // read.
        <div className="cts__total">
          <span className="cts__total-label">Total de lo que has puesto</span>
          {total ? (
            <CostBadge cost={total} className="cts__total-amount" />
          ) : (
            <span className="cts__total-amount">—</span>
          )}
        </div>
      )}

      {/* The figure beside the label is what is about to enter price history,
          which is not what the paper says the shop cost. The two disagree
          whenever a printed line is left unticked, and that is the screen
          saying so rather than a fault to reconcile.

          The button is named for the verb alone, and the figure is read after
          it as a description. What the button does must not change wording
          with the arithmetic. */}
      <button
        type="button"
        className="cts__save"
        aria-label="Guardar compra"
        aria-describedby={check && total ? 'cts-save-amount' : undefined}
        onClick={handleSave}
        disabled={!canSave || saving}
      >
        Guardar compra
        {check && total && (
          <span className="cts__save-amount" id="cts-save-amount">
            {' · '}
            <CostBadge cost={total} className="cts__save-figure" />
          </span>
        )}
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

      {viewingPaper && paper && (
        <button
          type="button"
          className="cts__paper-full"
          aria-label="Cerrar el ticket"
          onClick={() => setViewingPaper(false)}
        >
          <img
            className="cts__paper-full-img"
            src={paper.imageUrl}
            alt="Ticket"
          />
        </button>
      )}
    </div>
  )
}
