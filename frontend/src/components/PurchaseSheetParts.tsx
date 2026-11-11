import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Store,
  TriangleAlert,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { formatRowAmount } from '../lib/formatPrice'
import { type MissingToSave, missingToSaveText } from '../lib/missingToSave'
import { todayInputValue } from '../lib/receiptDate'
import { formatReceiptDate } from '../lib/receiptReview'
import './PurchaseSheetParts.css'
import { StoreSelect } from './StoreSelect'

// Closing a trip (10b) and reviewing a receipt (13a) do one job: they turn a
// cart into a closed purchase. So both sheets are built from these parts, and
// differ only where the job differs.

/** The sheet head: an optional leading thumb, the title, then the pills. */
export function PurchaseSheetHead({
  title,
  leading,
  children,
}: {
  title: string
  leading?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="psheet-head">
      {leading}
      <div className="psheet-head__main">
        <h2 className="psheet-title">{title}</h2>
        <div className="psheet-pills">{children}</div>
      </div>
    </div>
  )
}

/** The store pill: the store dropdown, or plain ink when the record's own
 *  store is locked. Solid with a store, dashed accent without one. */
export function StorePill({
  options,
  value,
  onSelect,
  onAddNew,
  locked = false,
}: {
  options: string[]
  /** The chosen store, '' for none. */
  value: string
  onSelect: (store: string) => void
  onAddNew: () => void
  locked?: boolean
}) {
  if (locked) {
    return (
      <span className="psheet-pill psheet-pill--locked">
        <Store size={13} aria-hidden />
        {value}
      </span>
    )
  }
  return (
    <StoreSelect
      className={`psheet-storepill${value ? '' : ' psheet-storepill--empty'}`}
      options={options}
      value={value}
      onSelect={onSelect}
      onAddNew={onAddNew}
      placeholder="Poner tienda"
    />
  )
}

/** The date pill. The native date input lies over the whole pill, so a tap
 *  opens the phone's own picker. */
export function DatePill({
  value,
  onChange,
  locked = false,
}: {
  /** The chosen day as YYYY-MM-DD, '' for none. */
  value: string
  /** The picked day, or '' when the picker was cleared. */
  onChange: (day: string) => void
  locked?: boolean
}) {
  const today = todayInputValue()
  const label =
    value === ''
      ? 'Poner fecha'
      : value === today
        ? 'Hoy'
        : (formatReceiptDate(value) ?? value)
  if (locked) {
    return (
      <span className="psheet-pill psheet-pill--locked">
        <Calendar size={13} aria-hidden />
        {label}
      </span>
    )
  }
  return (
    <label className={`psheet-pill${value ? '' : ' psheet-pill--empty'}`}>
      <Calendar size={13} className="psheet-pill__icon" aria-hidden />
      {label}
      <ChevronDown size={13} className="psheet-pill__icon" aria-hidden />
      <input
        type="date"
        className="psheet-pill__date"
        aria-label="Fecha"
        value={value}
        max={today}
        onClick={(e) => {
          // A desktop browser opens the picker only from its own icon,
          // which is hidden here. Some browsers lack showPicker.
          try {
            e.currentTarget.showPicker()
          } catch {
            // The phone's picker opens on tap anyway.
          }
        }}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

/** The table: its rows share one set of columns. `checks` adds the leading
 *  checkbox column the receipt review needs. */
export function PurchaseTable({
  checks = false,
  className,
  children,
}: {
  checks?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`psheet-table${checks ? ' psheet-table--checks' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  )
}

/** «Producto · N / Cant. / Importe». The money column is the line total. */
export function PurchaseTableHead({
  count,
  leading,
}: {
  count: number
  leading?: ReactNode
}) {
  return (
    <div className="psheet-grid psheet-tablehead">
      {leading}
      <span>Producto · {count}</span>
      <span className="psheet-num">Cant.</span>
      <span className="psheet-num">Importe</span>
      <span />
    </div>
  )
}

/** One line. The whole row is the button, and the chevron says so. A chip
 *  is a sibling of the button, never inside it (a button cannot hold a
 *  button), laid over the quantity cell. */
export function PurchaseRow({
  leading,
  product,
  qty,
  amount,
  onOpen,
  openVerb,
  disabled = false,
  off = false,
  chip,
}: {
  leading?: ReactNode
  product: ReactNode
  qty: ReactNode
  amount: ReactNode
  onOpen: () => void
  /** Said before the row's content, for screen readers only. The content
   *  stays the button's name, so quantity and amount are still read. */
  openVerb?: string
  disabled?: boolean
  /** A line that will not be saved: its ink dims. */
  off?: boolean
  chip?: ReactNode
}) {
  return (
    <div className={`psheet-grid psheet-row${off ? ' psheet-row--off' : ''}`}>
      {leading}
      <button
        type="button"
        className="psheet-row__open"
        onClick={onOpen}
        disabled={disabled}
      >
        {/* The content is the button's name. A whitespace node in a grid
            makes no cell, but keeps the words apart when it is read out. */}
        {openVerb && <span className="sr-only">{openVerb}</span>}{' '}
        <span className="psheet-row__product">{product}</span>{' '}
        <span className="psheet-qty">{qty}</span>{' '}
        <span className="psheet-num">{amount}</span>
        {disabled ? (
          <span />
        ) : (
          <ChevronRight size={14} className="psheet-row__chevron" aria-hidden />
        )}
      </button>
      {chip && <span className="psheet-row__chip">{chip}</span>}
    </div>
  )
}

/** A line's amount: solid when confirmed, dashed accent when only suggested,
 *  «sin precio» when there is none. */
export function PurchaseAmount({
  value,
  suggested = false,
}: {
  value: number | null
  suggested?: boolean
}) {
  if (value == null) {
    return <span className="psheet-amount psheet-amount--none">sin precio</span>
  }
  if (suggested) {
    return (
      <span className="psheet-amount psheet-amount--suggested">
        {formatRowAmount(value)}
        {/* The dashed border says "suggested, not yet real"; say it for
            screen readers too. */}
        <span className="sr-only"> (precio sugerido)</span>
      </span>
    )
  }
  return <span className="psheet-amount">{formatRowAmount(value)}</span>
}

/** «Total» in caps and the figure in mono, with no «€». `mark` sits before
 *  the figure (the receipt's cuadre disc). */
export function PurchaseTotal({
  label = 'Total',
  value,
  mark,
  status = false,
}: {
  label?: string
  value: number
  mark?: ReactNode
  status?: boolean
}) {
  return (
    <div className="psheet-total" role={status ? 'status' : undefined}>
      <span className="psheet-total__label">{label}</span>
      <span className="psheet-total__figure">
        {mark}
        <span className="psheet-total__value">{formatRowAmount(value)}</span>
      </span>
    </div>
  )
}

/** The short line under the total, starting «Toca una línea para…». */
export function PurchaseHelp({ children }: { children: ReactNode }) {
  return <p className="psheet-help">{children}</p>
}

/** The sheet's primary action. */
export function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="psheet-primary"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** «Guardar compra · € N»: the sum of what will be saved. */
export function SavePurchaseButton({
  sum,
  disabled,
  saving = false,
  onClick,
}: {
  sum: number
  disabled: boolean
  saving?: boolean
  onClick: () => void
}) {
  return (
    <PrimaryButton disabled={disabled} onClick={onClick}>
      {saving ? 'Guardando…' : `Guardar compra · € ${formatRowAmount(sum)}`}
    </PrimaryButton>
  )
}

/** A card over the save button: a title, an optional detail, and a circled
 *  symbol at its top right. `info` only tells (the receipt's cuadre);
 *  `warning` says what keeps the purchase from saving. */
export function PurchaseNotice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warning'
  title: string
  children?: ReactNode
}) {
  return (
    <div
      className={`psheet-notice psheet-notice--${tone}`}
      // Polite for both: the notice stays while the sheet is open, and an
      // alert would interrupt as the sheet appears.
      role="status"
    >
      <div className="psheet-notice__text">
        <p className="psheet-notice__title">{title}</p>
        {children && <p className="psheet-notice__detail">{children}</p>}
      </div>
      <span className="psheet-notice__disc" aria-hidden>
        {tone === 'warning' ? (
          <TriangleAlert size={15} strokeWidth={2.2} />
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <path d="M12 16v-5" />
            <path d="M12 7.5h.01" />
          </svg>
        )}
      </span>
    </div>
  )
}

/** The warning over a disabled save button, when something is missing. */
export function MissingToSaveNotice(missing: MissingToSave) {
  const text = missingToSaveText(missing)
  return text ? <PurchaseNotice tone="warning" title={text} /> : null
}

/** The outlined second action under the save button. */
export function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="psheet-secondary" onClick={onClick}>
      {children}
    </button>
  )
}

/** A line detail's back button. It names the sheet it returns to. */
export function SheetBackButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <div className="psheet-backbar">
      <button type="button" className="psheet-back" onClick={onClick}>
        <ChevronLeft size={22} strokeWidth={1.8} aria-hidden />
        {label}
      </button>
    </div>
  )
}
