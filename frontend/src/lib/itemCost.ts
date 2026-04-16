import type { ListItem } from '../types'

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
    const factor = parseQuantityFactor(item.quantity, item.price_per)
    if (factor === null) {
      partial = true
      continue
    }
    total += item.price * factor
  }
  return total === 0 ? null : { total, partial }
}

/**
 * Canonical date label for a purchased item.
 * Used by both ListScreen (cost grouping) and ItemList (rendering) so the
 * keys always match.
 */
export function purchasedDateLabel(purchased_at: string | null): string {
  if (!purchased_at) return 'Fecha desconocida'
  return new Date(purchased_at + 'Z').toLocaleDateString('es', { dateStyle: 'medium' })
}
