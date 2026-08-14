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
  imageUrl?: string | null
  isPdf?: boolean
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
  imageUrl,
  isPdf = false,
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
        {imageUrl && !isPdf ? (
          <button
            type="button"
            className="rss-thumb"
            onClick={() => setLightbox(true)}
            aria-label="Ampliar la foto del ticket"
          >
            <img src={imageUrl} alt="" className="rss-thumb__img" />
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
          <h2 className="rss-title">Revisar ticket</h2>
          <div className="rss-controls">
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
                      <CornerDownRight size={12} className="rss-annot__elbow" />
                      <span className="rss-annot__name">
                        {annotationText(ls)}
                      </span>
                      {brand && (
                        <span className="rss-annot__brand">{brand}</span>
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
        {receiptTotal != null ? (
          matches ? (
            <div className="rss-cuadre rss-cuadre--ok">
              <span className="rss-cuadre__label">Total</span>
              <span className="rss-cuadre__disc rss-cuadre__disc--ok" />
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
          // The lightbox only opens for the in-memory capture, never a PDF.
          contentType="image/jpeg"
          pages={null}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  )
}
