import type { MatchedLine, UnmatchedLine } from '../types'
import { deriveUnit } from './itemCost'
import { toDateInputValue } from './receiptDate'

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
}

export function isNamed(resolution: LineResolution): boolean {
  return resolution.kind !== 'unassigned'
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

export function linePricePer(line: ReceiptLine): 'KILOGRAM' | null {
  return deriveUnit(quantityString(line)).pricePer
}

/**
 * A line's contribution to the receipt — the parse's own `line_total`, not a
 * recomputation. The read receipt total is the sum of these, so the cuadre
 * compares like with like and the paper stays the arbiter.
 */
export function lineTotal(line: ReceiptLine): number {
  return line.line_total
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
