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
 * Canonical date label for a purchased item.
 * Used by both ListScreen (cost grouping) and ItemList (rendering) so the
 * keys always match.
 */
export function purchasedDateLabel(purchased_at: string | null): string {
  if (!purchased_at) return 'Fecha desconocida'
  return new Date(purchased_at + 'Z').toLocaleDateString('es', {
    dateStyle: 'medium',
  })
}

/**
 * The date a trip prints in the stack (18a / 29a). A closed trip settles to
 * «22 jul» (day + short month). A proto-ticket — torn off, still unwritten —
 * prints «martes 21» (weekday + day) *while it is this month's*: the near
 * voice, because the day is recent and its weekday still means something. Once
 * it leaves the current month it is no longer recent, so the weekday yields to
 * the month and it prints «21 jul» — the same day+month as a closed trip,
 * disambiguated from one by its seal rather than its date.
 *
 * Always reads `opened_at`, the day the shopping started: it is the trip's
 * real day for every write path (a same-day close, a torn-off cart, or a
 * back-dated manual purchase whose `closed_at`/`tears_off_at` sit on the
 * following local midnight). Naive-UTC strings get their Z restored first, the
 * same guard `purchasedDateLabel`/`isTripOpen` use.
 *
 * The weekday form is built from two parts rather than one Intl call because
 * `{ weekday:'long', day:'numeric' }` yields «martes, 21» in es — the comma is
 * not in the frame.
 */
export function tripDateLabel(openedAt: string, proto: boolean): string {
  const d = new Date(openedAt.endsWith('Z') ? openedAt : openedAt + 'Z')
  const now = new Date()
  const thisMonth =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (proto && thisMonth) {
    const weekday = d.toLocaleDateString('es', { weekday: 'long' })
    const day = d.toLocaleDateString('es', { day: 'numeric' })
    return `${weekday} ${day}`
  }
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}
