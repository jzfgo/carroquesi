import { CornerDownRight, Maximize2, Receipt, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { formatRowAmount } from '../lib/formatPrice'
import { toDateInputValue, withDatePart } from '../lib/receiptDate'
import {
  effectiveLineTotal,
  effectiveQuantityDisplay,
  isDiscountLine,
  isNamed,
  type LineState,
  type ReceiptLine,
} from '../lib/receiptReview'
import {
  DatePill,
  MissingToSaveNotice,
  PurchaseAmount,
  PurchaseHelp,
  PurchaseNotice,
  PurchaseRow,
  PurchaseSheetHead,
  PurchaseTable,
  PurchaseTableHead,
  PurchaseTotal,
  SavePurchaseButton,
  SecondaryButton,
  StorePill,
} from './PurchaseSheetParts'
import { ReceiptFileViewer } from './ReceiptFileViewer'
import { WeightChip } from './WeightChip'

const CUADRE_TOLERANCE = 0.02

interface Props {
  lines: ReceiptLine[]
  lineStates: LineState[]
  store: string | null
  receiptDate: string | null
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
  /** The stores the store pill offers. */
  storeOptions: string[]
  lineSum: number
  savedSum: number
  receiptTotal: number | null
  cuadreDiff: number | null
  includedCount: number
  canSave: boolean
  onToggleInclude: (index: number) => void
  onSetAll: (included: boolean) => void
  onOpenResolve: (index: number) => void
  /** Per line: whether it offers the «Peso» chip. */
  weightChips?: boolean[]
  onScanLabel?: (index: number) => void
  onChangeDate: (raw: string | null) => void
  onChangeStore: (store: string | null) => void
  /** The store pill's «+ otra»: the parent opens the «Nueva tienda» step. */
  onAddStore: () => void
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
  targeted = false,
  dateLocked = false,
  storeLocked = false,
  changeNotes,
  priorTotal = null,
  imageUrl,
  isPdf = false,
  pdfPages = null,
  storeOptions,
  lineSum,
  savedSum,
  receiptTotal,
  cuadreDiff,
  includedCount,
  canSave,
  onToggleInclude,
  onSetAll,
  onOpenResolve,
  weightChips,
  onScanLabel,
  onChangeDate,
  onChangeStore,
  onAddStore,
  onReReadReceipt,
  onConfirm,
}: Props) {
  const [lightbox, setLightbox] = useState(false)

  // "All" means all selectable: a locked discount line can never be included,
  // so it does not keep the select-all toggle from reading as complete.
  const selectableCount = lines.filter((l) => !isDiscountLine(l)).length
  const allIncluded = includedCount === selectableCount && includedCount > 0
  const matches = cuadreDiff != null && Math.abs(cuadreDiff) < CUADRE_TOLERANCE

  const thumb = imageUrl ? (
    <button
      type="button"
      className={`rss-thumb ${isPdf ? 'rss-thumb--pdfdoc' : ''}`}
      onClick={() => setLightbox(true)}
      aria-label={isPdf ? 'Ampliar el ticket' : 'Ampliar la foto del ticket'}
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
  )

  return (
    <>
      <PurchaseSheetHead
        title={targeted ? 'Añadir ticket a esta compra' : 'Revisar ticket'}
        leading={thumb}
      >
        <StorePill
          options={storeOptions}
          value={store ?? ''}
          locked={storeLocked}
          onSelect={(next) => onChangeStore(next || null)}
          onAddNew={onAddStore}
        />
        <DatePill
          value={toDateInputValue(receiptDate)}
          locked={dateLocked}
          onChange={(day) =>
            onChangeDate(day ? withDatePart(receiptDate, day) : null)
          }
        />
      </PurchaseSheetHead>

      <PurchaseTable checks className="rss-body">
        <PurchaseTableHead
          count={lines.length}
          leading={
            <button
              type="button"
              role="checkbox"
              aria-checked={allIncluded}
              className={`rss-selectall ${allIncluded ? 'rss-selectall--on' : ''}`}
              onClick={() => onSetAll(!allIncluded)}
              aria-label={
                allIncluded ? 'Deseleccionar todo' : 'Seleccionar todo'
              }
            />
          }
        />

        {lines.map((line, i) => {
          const ls = lineStates[i]
          const named = isNamed(ls.resolution)
          const brand = annotationBrand(ls)
          // A negative amount is a discount the parse failed to fold into its
          // product: it stays on the paper and in the cuadre's sum, but it is
          // locked — never saved, never named, no door to resolve it.
          const discount = isDiscountLine(line)
          const weightChip = !!weightChips?.[i] && !!onScanLabel
          return (
            <PurchaseRow
              key={i}
              off={!ls.included}
              disabled={discount}
              onOpen={() => onOpenResolve(i)}
              leading={
                <input
                  type="checkbox"
                  className="rss-row__check"
                  checked={ls.included}
                  disabled={discount}
                  onChange={() => onToggleInclude(i)}
                  aria-label={`Guardar «${line.receipt_name}»`}
                />
              }
              product={
                <>
                  <span className="rss-ocr">{line.receipt_name}</span>
                  {discount ? (
                    <span className="rss-annot rss-annot--off">
                      descuento · no se guarda
                    </span>
                  ) : ls.included ? (
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
                </>
              }
              // With the chip, the chip takes the quantity's place.
              qty={weightChip ? '' : effectiveQuantityDisplay(line, ls)}
              amount={<PurchaseAmount value={effectiveLineTotal(line, ls)} />}
              chip={
                weightChip && (
                  <WeightChip
                    lineName={line.receipt_name}
                    onClick={() => onScanLabel!(i)}
                  />
                )
              }
            />
          )
        })}

        {receiptTotal == null ? (
          <PurchaseTotal label="Suma de líneas" value={lineSum} />
        ) : (
          <PurchaseTotal
            value={receiptTotal}
            status={matches}
            mark={
              matches && (
                <>
                  <span className="rss-cuadre__disc rss-cuadre__disc--ok" />
                  {/* The green disc is the only visible sign that the sum
                      matches the paper total. */}
                  <span className="sr-only">cuadra con la suma de líneas</span>
                </>
              )
            }
          />
        )}
        <PurchaseHelp>
          Toca una línea para asignarla o corregirla. Una línea desmarcada no se
          guarda, pero sigue sumando para el cuadre.
        </PurchaseHelp>
      </PurchaseTable>

      <div className="psheet-foot">
        {targeted &&
          priorTotal != null &&
          receiptTotal != null &&
          Math.abs(priorTotal - receiptTotal) >= 0.005 && (
            <div className="rss-totalchange" role="status">
              El total guardado pasa de € {formatRowAmount(priorTotal)} a €{' '}
              {formatRowAmount(receiptTotal)}
            </div>
          )}
        {/* A total that does not match moves up to sit over the save button,
            where it cannot be missed (18b). It only informs: the paper may
            hold a discount, so it never blocks the save. */}
        {receiptTotal != null && !matches && (
          <PurchaseNotice
            tone="info"
            title={`${cuadreDiff != null && cuadreDiff < 0 ? 'Faltan' : 'Sobran'} € ${formatRowAmount(Math.abs(cuadreDiff ?? 0))} para cuadrar`}
          >
            Suma de líneas {formatRowAmount(lineSum)} · total leído{' '}
            {formatRowAmount(receiptTotal)}. Puede ser un descuento o una línea
            que no se ha leído bien.
          </PurchaseNotice>
        )}
        <MissingToSaveNotice
          store={store == null}
          date={receiptDate == null}
          unnamedLines={
            lineStates.filter((ls) => ls.included && !isNamed(ls.resolution))
              .length
          }
          nothingToSave={includedCount === 0 ? 'ticket' : null}
        />

        <SavePurchaseButton
          sum={savedSum}
          disabled={!canSave}
          onClick={onConfirm}
        />
        <SecondaryButton onClick={onReReadReceipt}>
          <RefreshCw size={15} /> Volver a leer el ticket
        </SecondaryButton>
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
