import {
  Calendar,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Maximize2,
  Receipt,
  RefreshCw,
  Store,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import { formatRowAmount } from '../lib/formatPrice'
import {
  toDateInputValue,
  todayInputValue,
  withDatePart,
} from '../lib/receiptDate'
import {
  isNamed,
  lineTotal,
  quantityDisplay,
  type LineState,
  type ReceiptLine,
} from '../lib/receiptReview'
import { ReceiptFileViewer } from './ReceiptFileViewer'

const CUADRE_TOLERANCE = 0.02

interface Props {
  lines: ReceiptLine[]
  lineStates: LineState[]
  store: string | null
  receiptDate: string | null
  receiptDateLabel: string | null
  /** Targeted attach (25b): the review completes a settled purchase. */
  targeted?: boolean
  /** Render the date/store pill as ink, not a control — the record's own value. */
  dateLocked?: boolean
  storeLocked?: boolean
  /** Per-line note in a targeted review: fill / correction / no-op / new line. */
  changeNotes?: (string | null)[]
  /** The purchase's recorded total, so a differing paper total shows as a
   *  reviewed change rather than a silent overwrite. */
  priorTotal?: number | null
  imageUrl?: string | null
  isPdf?: boolean
  /** Page count printed on the PDF badge; null when it could not be read. */
  pdfPages?: number | null
  knownStores: string[]
  lineSum: number
  savedSum: number
  receiptTotal: number | null
  cuadreDiff: number | null
  includedCount: number
  unnamedCount: number
  canSave: boolean
  onToggleInclude: (index: number) => void
  onSetAll: (included: boolean) => void
  onOpenResolve: (index: number) => void
  onChangeDate: (raw: string | null) => void
  onChangeStore: (store: string | null) => void
  onReReadReceipt: () => void
  onConfirm: () => void
}

function annotationText(ls: LineState): string {
  const r = ls.resolution
  if (r.kind === 'matched' || r.kind === 'linked') return r.itemName
  if (r.kind === 'created') return r.name
  return 'Asignar producto'
}

function annotationBrand(ls: LineState): string | null {
  const r = ls.resolution
  if (r.kind === 'matched' || r.kind === 'linked' || r.kind === 'created') {
    return r.brand
  }
  return null
}

export function ReceiptReviewBody({
  lines,
  lineStates,
  store,
  receiptDate,
  receiptDateLabel,
  targeted = false,
  dateLocked = false,
  storeLocked = false,
  changeNotes,
  priorTotal = null,
  imageUrl,
  isPdf = false,
  pdfPages = null,
  knownStores,
  lineSum,
  savedSum,
  receiptTotal,
  cuadreDiff,
  includedCount,
  unnamedCount,
  canSave,
  onToggleInclude,
  onSetAll,
  onOpenResolve,
  onChangeDate,
  onChangeStore,
  onReReadReceipt,
  onConfirm,
}: Props) {
  const [editing, setEditing] = useState<'date' | 'store' | null>(null)
  const [storeDraft, setStoreDraft] = useState(store ?? '')
  const [lightbox, setLightbox] = useState(false)

  const allIncluded = includedCount === lineStates.length && includedCount > 0
  const matches = cuadreDiff != null && Math.abs(cuadreDiff) < CUADRE_TOLERANCE

  function commitStore() {
    const next = storeDraft.trim()
    onChangeStore(next.length > 0 ? next : null)
    setEditing(null)
  }

  return (
    <>
      <div className="rss-head">
        {imageUrl ? (
          <button
            type="button"
            className={`rss-thumb ${isPdf ? 'rss-thumb--pdfdoc' : ''}`}
            onClick={() => setLightbox(true)}
            aria-label={
              isPdf ? 'Ampliar el ticket' : 'Ampliar la foto del ticket'
            }
          >
            {isPdf ? (
              <>
                <Receipt size={20} />
                <span className="rss-thumb__pdf">PDF</span>
                {pdfPages != null && pdfPages > 1 && (
                  <span className="rss-thumb__pages">{pdfPages} pág.</span>
                )}
              </>
            ) : (
              <img src={imageUrl} alt="" className="rss-thumb__img" />
            )}
            <span className="rss-thumb__badge">
              <Maximize2 size={12} />
            </span>
          </button>
        ) : (
          <div className="rss-thumb rss-thumb--placeholder" aria-hidden="true">
            <Receipt size={20} />
            {isPdf && <span className="rss-thumb__pdf">PDF</span>}
          </div>
        )}

        <div className="rss-head__main">
          <h2 className="rss-title">
            {targeted ? 'Añadir ticket a esta compra' : 'Revisar ticket'}
          </h2>
          <div className="rss-controls">
            {storeLocked ? (
              <span className="rss-pill rss-pill--set rss-pill--locked">
                <Store size={13} />
                {store}
              </span>
            ) : (
              <button
                type="button"
                className={`rss-pill ${store ? 'rss-pill--set' : 'rss-pill--empty'}`}
                onClick={() => setEditing(editing === 'store' ? null : 'store')}
                aria-expanded={editing === 'store'}
              >
                <Store size={13} />
                {store ?? 'Poner tienda'}
                <ChevronDown size={13} className="rss-pill__chevron" />
              </button>
            )}
            {dateLocked ? (
              <span className="rss-pill rss-pill--set rss-pill--locked">
                <Calendar size={13} />
                {receiptDateLabel}
              </span>
            ) : (
              <button
                type="button"
                className={`rss-pill ${receiptDate ? 'rss-pill--set' : 'rss-pill--empty'}`}
                onClick={() => setEditing(editing === 'date' ? null : 'date')}
                aria-expanded={editing === 'date'}
              >
                <Calendar size={13} />
                {receiptDateLabel ?? 'Poner fecha'}
                <ChevronDown size={13} className="rss-pill__chevron" />
              </button>
            )}
          </div>
        </div>
      </div>

      {editing === 'store' && (
        <div className="rss-control-editor">
          <input
            className="rss-control-editor__input"
            type="text"
            list="rss-known-stores"
            value={storeDraft}
            placeholder="Nombre de la tienda"
            autoFocus
            onChange={(e) => setStoreDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitStore()
            }}
          />
          <datalist id="rss-known-stores">
            {knownStores.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button
            type="button"
            className="rss-control-editor__done"
            onClick={commitStore}
          >
            Listo
          </button>
        </div>
      )}

      {editing === 'date' && (
        <div className="rss-control-editor">
          <input
            className="rss-control-editor__input"
            type="date"
            value={toDateInputValue(receiptDate)}
            max={todayInputValue()}
            autoFocus
            onChange={(e) => {
              onChangeDate(
                e.target.value
                  ? withDatePart(receiptDate, e.target.value)
                  : null,
              )
              setEditing(null)
            }}
          />
        </div>
      )}

      <div className="rss-listhead">
        <button
          type="button"
          role="checkbox"
          aria-checked={allIncluded}
          className={`rss-selectall ${allIncluded ? 'rss-selectall--on' : ''}`}
          onClick={() => onSetAll(!allIncluded)}
          aria-label={allIncluded ? 'Deseleccionar todo' : 'Seleccionar todo'}
        />
        <span className="rss-listhead__count">
          {lineStates.length} línea{lineStates.length === 1 ? '' : 's'}
          {unnamedCount > 0 && ` · ${unnamedCount} sin nombre`}
        </span>
        <button
          type="button"
          className="rss-listhead__clear"
          onClick={() => onSetAll(false)}
          disabled={includedCount === 0}
        >
          Quitar todas
        </button>
      </div>

      <div className="rss-body">
        {lines.map((line, i) => {
          const ls = lineStates[i]
          const named = isNamed(ls.resolution)
          const brand = annotationBrand(ls)
          return (
            <div
              key={i}
              className={`rss-row ${ls.included ? '' : 'rss-row--off'}`}
            >
              <input
                type="checkbox"
                className="rss-row__check"
                checked={ls.included}
                onChange={() => onToggleInclude(i)}
                aria-label={`Guardar «${line.receipt_name}»`}
              />
              <button
                type="button"
                className="rss-row__open"
                onClick={() => onOpenResolve(i)}
              >
                <span className="rss-row__product">
                  <span className="rss-ocr">{line.receipt_name}</span>
                  {ls.included ? (
                    <span
                      className={`rss-annot ${named ? 'rss-annot--solid' : 'rss-annot--dashed'}`}
                    >
                      <CornerDownRight
                        size={12}
                        className="rss-annot__elbow"
                        aria-hidden
                      />
                      {/* The elbow and the solid/dashed stroke carry the
                          mapping visually; say it for screen readers too.
                          The unresolved state already says «Asignar
                          producto» in text. */}
                      {named && (
                        <span className="sr-only">se guarda como </span>
                      )}
                      <span className="rss-annot__name">
                        {annotationText(ls)}
                      </span>
                      {brand && (
                        <span className="rss-annot__brand">{brand}</span>
                      )}
                      {changeNotes?.[i] && (
                        <span className="rss-annot__change">
                          {changeNotes[i]}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="rss-annot rss-annot--off">
                      no se guarda
                    </span>
                  )}
                </span>
                <span className="rss-qty">{quantityDisplay(line)}</span>
                <span className="rss-price">
                  {formatRowAmount(lineTotal(line))}
                </span>
                <ChevronRight size={16} className="rss-row__chevron" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="rss-foot">
        {targeted &&
          priorTotal != null &&
          receiptTotal != null &&
          Math.abs(priorTotal - receiptTotal) >= 0.005 && (
            <div className="rss-totalchange" role="status">
              El total guardado pasa de € {formatRowAmount(priorTotal)} a €{' '}
              {formatRowAmount(receiptTotal)}
            </div>
          )}
        {receiptTotal != null ? (
          matches ? (
            <div className="rss-cuadre rss-cuadre--ok" role="status">
              <span className="rss-cuadre__label">Total</span>
              <span className="rss-cuadre__disc rss-cuadre__disc--ok" />
              {/* The green disc is the only visible sign that the sum
                  matches the paper total. */}
              <span className="sr-only">cuadra con la suma de líneas</span>
              <span className="rss-cuadre__total">
                {formatRowAmount(receiptTotal)}
              </span>
            </div>
          ) : (
            <div className="rss-cuadre rss-cuadre--off" role="status">
              <div className="rss-cuadre__text">
                <p className="rss-cuadre__headline">
                  {cuadreDiff != null && cuadreDiff < 0 ? 'Faltan' : 'Sobran'} €{' '}
                  {formatRowAmount(Math.abs(cuadreDiff ?? 0))} para cuadrar
                </p>
                <p className="rss-cuadre__detail">
                  Suma de líneas {formatRowAmount(lineSum)} · total leído{' '}
                  {formatRowAmount(receiptTotal)}. Puede ser un descuento o una
                  línea que no se ha leído bien.
                </p>
              </div>
              <span className="rss-cuadre__disc rss-cuadre__disc--off">
                <TriangleAlert size={15} />
              </span>
            </div>
          )
        ) : (
          <div className="rss-cuadre rss-cuadre--neutral">
            <span className="rss-cuadre__label">Suma de líneas</span>
            <span className="rss-cuadre__total">
              {formatRowAmount(lineSum)}
            </span>
          </div>
        )}

        <button
          type="button"
          className="rss-save"
          disabled={!canSave}
          onClick={onConfirm}
        >
          Guardar compra
          <span className="rss-save__sum">· € {formatRowAmount(savedSum)}</span>
        </button>
        <button type="button" className="rss-reread" onClick={onReReadReceipt}>
          <RefreshCw size={15} /> Volver a leer el ticket
        </button>
      </div>

      {lightbox && imageUrl && (
        <ReceiptFileViewer
          url={imageUrl}
          // The in-memory capture: an image fills the screen, a PDF pages
          // through the same viewer the stored paper uses.
          contentType={isPdf ? 'application/pdf' : 'image/jpeg'}
          pages={isPdf ? pdfPages : null}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  )
}
