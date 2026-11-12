import type { LabelRead } from '../types'
import { parseAmount } from './formatPrice'
import { deriveUnit, parseQuantityFactor } from './itemCost'
import { readsLabelWeight } from './ownBrands'

/** The weight a label prints, as a quantity the app reads back: «0,636 kg». */
export function labelQuantity(weightG: number): string {
  const kilos = (weightG / 1000).toFixed(3).replace(/\.?0+$/, '')
  return `${kilos.replace('.', ',')} kg`
}

export function labelPricePerKg(label: LabelRead): number {
  return (label.price_per_kg_cents ?? 0) / 100
}

export function labelTotal(label: LabelRead): number {
  return label.total_cents / 100
}

/** The label and the line charge the same, to the cent. */
export function labelAgrees(label: LabelRead, lineTotal: number): boolean {
  return label.total_cents === Math.round(lineTotal * 100)
}

export function hasWeight(quantity: string | null): boolean {
  return deriveUnit(quantity).pricePer === 'KILOGRAM'
}

function isOneUnit(quantity: string | null): boolean {
  return !quantity?.trim() || parseQuantityFactor(quantity, null) === 1
}

/**
 * Whether a line offers the «Peso» chip. A packaged product carries an EAN
 * and a pack counts as one unit, so the EAN check does most of the
 * filtering. A product bought by weight before always offers it.
 */
export function showsWeightChip(line: {
  store: string | null
  quantity: string | null
  ean: string | null
  boughtByWeight: boolean
}): boolean {
  if (!readsLabelWeight(line.store) || hasWeight(line.quantity)) return false
  return (isOneUnit(line.quantity) && !line.ean) || line.boughtByWeight
}

/** The code to send for decoding, or null when the read cannot be a label:
 * a QR code may hold a link, and a label is 8 to 24 numbers. */
export function labelCode(raw: string): string | null {
  const code = raw.trim()
  return /^\d{8,24}$/.test(code) ? code : null
}

/**
 * The weighed label used on a line: its code, to notice the same label
 * twice; its article code, which the save sends; and, from a reduced label,
 * the price before in €/kg, when the user typed it.
 */
export interface LineLabel {
  code: string
  article: string
  reduced: boolean
  priceBefore: number | null
}

/**
 * The old price typed from the label under a reduced one, against what was
 * paid. Both are totals for `kilos`. Null while the field is blank; `valid`
 * is false for a figure that cannot be read or is not above `paid`. It must
 * also sit above `paidPerKg` per kilo, the price the line will save: the
 * label's printed total need not be its weight times its €/kg, and the save
 * keeps only an old price above that €/kg.
 */
export function readPriceBefore(
  text: string,
  paid: number,
  kilos: number,
  paidPerKg: number,
): { total: number; valid: boolean } | null {
  if (text.trim() === '') return null
  const total = parseAmount(text)
  if (total == null) return { total: Number.NaN, valid: false }
  const valid =
    Math.round(total * 100) > Math.round(paid * 100) &&
    total / kilos > paidPerKg
  return { total, valid }
}

/**
 * What a line's label adds to its save. The price before goes only while
 * the line is still priced per kilo below it: an edit after the scan may
 * have moved the price, and the backend refuses an old price that is not
 * above it. The mark itself stays through such an edit: the label said the
 * price was reduced, and the user kept that label on the line.
 */
export function reductionFields(
  label: LineLabel,
  price: number | null,
  pricePer: string | null,
): { reduced: boolean; price_before: number | null } {
  const before = label.reduced ? label.priceBefore : null
  const keep =
    before != null && price != null && pricePer === 'KILOGRAM' && before > price
  return { reduced: label.reduced, price_before: keep ? before : null }
}
