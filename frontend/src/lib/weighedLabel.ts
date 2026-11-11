import type { LabelRead } from '../types'
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
