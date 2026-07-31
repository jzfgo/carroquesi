import type { ListItem } from '../types'
import { parseNaiveUtc } from './naiveUtc'

// SI units → kg equivalent (volume treated as water: 1 L = 1 kg)
const UNIT_TO_KG: Record<string, number> = {
  g: 0.001,
  kg: 1,
  ml: 0.001,
  cl: 0.01,
  dl: 0.1,
  l: 1,
}

// Matches a leading decimal number (comma or dot separator) followed by an
// optional unit token (letters, optional trailing dot as abbreviation marker).
const QTY_RE = /^([\d]+(?:[.,]\d+)?)\s*([a-zA-Z]+\.?)?/i

/**
 * Returns the numeric factor by which to multiply item.price,
 * or null if the contribution can't be computed (item is excluded → triggers ≥).
 *
 * Rules:
 *  - price_per = 'KILOGRAM': needs a recognised SI unit in quantity to convert
 *    to kg. No unit or unrecognised unit → null.
 *  - price_per = null: SI unit means pack-size descriptor → ×1.
 *    Plain number or unrecognised unit text → numeric count.
 */
export function parseQuantityFactor(
  quantity: string | null,
  pricePer: string | null,
): number | null {
  const isPerKg = pricePer === 'KILOGRAM'

  if (!quantity) return isPerKg ? null : 1

  const m = quantity.trim().match(QTY_RE)
  if (!m) return isPerKg ? null : 1

  const value = parseFloat(m[1].replace(',', '.'))
  const rawUnit = m[2] ? m[2].replace(/\.$/, '').toLowerCase() : null
  const kgFactor = rawUnit != null ? UNIT_TO_KG[rawUnit] : undefined

  if (isPerKg) {
    return kgFactor != null ? value * kgFactor : null
  }

  // Non-per-unit: SI unit → pack descriptor (×1), otherwise numeric count
  return kgFactor != null ? 1 : value
}

export function parseKgFactor(quantity: string | null): number | null {
  return parseQuantityFactor(quantity, 'KILOGRAM')
}

export interface CostSummary {
  total: number
  partial: boolean
}

/**
 * Computes a cost summary for a group of items.
 * Returns null if the summed total is zero (nothing worth rendering).
 */
export function computeCostSummary(items: ListItem[]): CostSummary | null {
  let total = 0
  let partial = false
  for (const item of items) {
    if (item.price == null) {
      partial = true
      continue
    }
    const effectiveQty =
      item.purchased && item.purchased_quantity != null
        ? item.purchased_quantity
        : item.quantity
    const factor = parseQuantityFactor(effectiveQty, item.price_per)
    if (factor === null) {
      partial = true
      continue
    }
    total += item.price * factor
  }
  return total === 0 ? null : { total, partial }
}

/**
 * Canonical date label for a purchased item — the day header over a trip's
 * lines in ItemList.
 *
 * Read through `parseNaiveUtc` rather than by hand. This was
 * `new Date(purchased_at + 'Z')`: the same rule inlined, but without its
 * fail-safe. Appending `Z` unconditionally turns a stamp that already names
 * its zone into `2026-07-23T00:30:00+02:00Z`, and that — like a stamp nobody
 * can read — is an `Invalid Date`, whose `toLocaleDateString` is the literal
 * string «Invalid Date», printed as a heading over somebody's shop. Not
 * knowing the day is something this function can already say out loud.
 */
export function purchasedDateLabel(purchased_at: string | null): string {
  const at = purchased_at === null ? null : parseNaiveUtc(purchased_at)
  if (at === null) return 'Fecha desconocida'
  return new Date(at).toLocaleDateString('es', { dateStyle: 'medium' })
}
