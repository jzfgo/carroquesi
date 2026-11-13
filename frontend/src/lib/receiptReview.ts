import type { MatchedLine, UnmatchedLine } from '../types'
import { deriveUnit, parseQuantityFactor } from './itemCost'
import { toDateInputValue } from './receiptDate'
import type { LineLabel } from './weighedLabel'

export type ReceiptLine = MatchedLine | UnmatchedLine

/**
 * How a receipt line has been resolved to a catalogue product. The paper line
 * itself ("el papel no se discute") is never edited — only *which* product it
 * maps to. `matched` comes from the backend matcher; `linked`/`created` are the
 * two paths a user takes in the resolve sheet (13b); `unassigned` is a line the
 * user still has to name. A line is saveable only once it is not `unassigned`.
 */
export type LineResolution =
  | { kind: 'matched'; itemId: string; itemName: string; brand: string | null }
  | { kind: 'linked'; itemId: string; itemName: string; brand: string | null }
  | { kind: 'created'; name: string; brand: string | null; ean: string | null }
  | { kind: 'unassigned' }

export interface LineState {
  /** Checked = saved to history. Unchecked lines still count toward the cuadre. */
  included: boolean
  resolution: LineResolution
  /**
   * A user-corrected line total (13b «Cantidad y precio»), or null/absent
   * for as-read.
   * The paper line's own figures stay untouched — this is a correction of the
   * interpretation, and every derived figure (unit price, cuadre, save sum)
   * reads through it.
   */
  lineTotal?: number | null
  /**
   * A user-typed quantity (13b «Cantidad y precio»: «346 g», «2»), or
   * null/absent for as-read. Like `lineTotal`, it corrects the interpretation,
   * never the paper: the unit price and its per-kg or per-unit key read
   * through it.
   */
  quantity?: string | null
  /**
   * The unit price the user typed, or null/absent when the price is derived.
   * The total rounds to cents, so dividing it back would not give the typed
   * figure (8,80 €/kg × 0,346 kg = 3,04, and 3,04 / 0,346 = 8,79). Kept so
   * the field and the price history show what the label says. A new
   * quantity clears it, since a quantity change keeps the total.
   */
  unitPrice?: number | null
  /** The weighed label used on this line. */
  label?: LineLabel | null
}

export function isNamed(resolution: LineResolution): boolean {
  return resolution.kind !== 'unassigned'
}

/**
 * A negative amount is a discount the parse failed to fold into its product's
 * line, not a product. It stays visible — it still sums toward the cuadre —
 * but it is locked: never saved, never named.
 */
export function isDiscountLine(line: ReceiptLine): boolean {
  return line.line_total < 0 || line.unit_price < 0
}

export function resolutionItemId(resolution: LineResolution): string | null {
  return resolution.kind === 'matched' || resolution.kind === 'linked'
    ? resolution.itemId
    : null
}

export function resolutionName(resolution: LineResolution): string | null {
  if (resolution.kind === 'matched' || resolution.kind === 'linked') {
    return resolution.itemName
  }
  if (resolution.kind === 'created') return resolution.name
  return null
}

/**
 * Spell a name and brand back into the create bar's sigil syntax. A brand
 * with spaces takes the quotes parseInput needs to read it back whole.
 */
export function withBrandSigil(name: string, brand: string | null): string {
  if (!brand) return name
  const value = /\s/.test(brand) ? `"${brand}"` : brand
  return `${name} #${value}`
}

/**
 * Machine quantity string for the save payload — «202g», «1.12kg», «2», «1».
 * The backend derives the price_per key from it, so its shape must match what
 * the manual-entry path produces (a weight prices per kilo, a count per unit).
 */
export function quantityString(line: ReceiptLine): string {
  if (line.price_type === 'KILOGRAM' && line.quantity != null) {
    return line.quantity < 1
      ? `${Math.round(line.quantity * 1000)}g`
      : `${line.quantity}kg`
  }
  if (line.price_type === 'MULTI' && line.quantity != null) {
    return String(Math.round(line.quantity))
  }
  return '1'
}

/** Human quantity for the list column — «1,12 kg», «202 g», «12», «1». */
export function quantityDisplay(line: ReceiptLine): string {
  if (line.price_type === 'KILOGRAM' && line.quantity != null) {
    if (line.quantity < 1) return `${Math.round(line.quantity * 1000)} g`
    return `${line.quantity.toLocaleString('es-ES')} kg`
  }
  if (line.price_type === 'MULTI' && line.quantity != null) {
    return String(Math.round(line.quantity))
  }
  return '1'
}

/** The quantity the review works with: the user's, else the paper's. */
export function effectiveQuantity(
  line: ReceiptLine,
  state?: LineState,
): string {
  return state?.quantity ?? quantityString(line)
}

export function effectivePricePer(
  line: ReceiptLine,
  state?: LineState,
): 'KILOGRAM' | null {
  return deriveUnit(effectiveQuantity(line, state)).pricePer
}

/** The quantity column: the paper's, or the user's as they typed it. */
export function effectiveQuantityDisplay(
  line: ReceiptLine,
  state?: LineState,
): string {
  return state?.quantity != null ? state.quantity.trim() : quantityDisplay(line)
}

/**
 * Two quantities below this apart are the same: a weight read in kilos and
 * one typed in grams differ only by float noise.
 */
export const QUANTITY_EPSILON = 0.0005

/**
 * Whether two quantity texts mean the same amount: «202 g» and «0,202 kg»
 * do, «1» and «1 kg» do not, since one counts and the other weighs.
 */
export function sameQuantityText(a: string, b: string): boolean {
  const perA = deriveUnit(a).pricePer
  if (perA !== deriveUnit(b).pricePer) return false
  const fa = parseQuantityFactor(a, perA)
  const fb = parseQuantityFactor(b, perA)
  if (fa == null || fb == null) return false
  return Math.abs(fa - fb) < QUANTITY_EPSILON
}

/** The line total a unit price makes at a quantity, rounded to cents. */
export function unitPriceToTotal(
  price: number,
  quantity: string,
): number | null {
  const factor = parseQuantityFactor(quantity, deriveUnit(quantity).pricePer)
  if (factor == null) return null
  return Math.round(price * factor * 100) / 100
}

/**
 * A line's contribution to the receipt — the parse's own `line_total`, not a
 * recomputation. The read receipt total is the sum of these, so the cuadre
 * compares like with like and the paper stays the arbiter.
 */
export function lineTotal(line: ReceiptLine): number {
  return line.line_total
}

/**
 * The line total the review actually works with: the user's correction when
 * one exists, else the parse's own figure. Every derived number — cuadre,
 * save sum, the applied unit price — reads through this, so a correction
 * behaves exactly as if the paper had been read right the first time.
 */
export function effectiveLineTotal(
  line: ReceiptLine,
  state?: LineState,
): number {
  return state?.lineTotal ?? lineTotal(line)
}

/**
 * The per-item price the apply records. A typed price is kept as typed.
 * As read, it is the parse's own.
 * Once either figure is corrected, it is the effective total divided by the
 * effective quantity, per kilo or per unit. A quantity that gives no factor,
 * or a zero one, falls back to the total: recording something recoverable
 * beats dividing by nothing.
 */
export function effectiveUnitPrice(
  line: ReceiptLine,
  state?: LineState,
): number {
  if (state?.unitPrice != null) return state.unitPrice
  if (state?.lineTotal == null && state?.quantity == null) {
    return line.unit_price
  }
  const total = effectiveLineTotal(line, state)
  const factor = parseQuantityFactor(
    effectiveQuantity(line, state),
    effectivePricePer(line, state),
  )
  return factor != null && factor > 0 ? total / factor : total
}

/** The receipt date as the header pill prints it — «26 jul» (year only if past). */
export function formatReceiptDate(raw: string | null): string | null {
  const iso = toDateInputValue(raw)
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  const now = new Date()
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(y === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}
