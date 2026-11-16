import type { ListItem } from '../types'
import { parseServerInstant } from './serverInstant'

// What people type → the unit it means. Only these spellings price a line.
const UNIT_ALIASES: Record<string, ContentUnit> = {
  g: 'g',
  gr: 'g',
  gramo: 'g',
  gramos: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  ml: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  litro: 'l',
  litros: 'l',
}

export type ContentUnit = 'g' | 'kg' | 'ml' | 'cl' | 'dl' | 'l'
export type PriceBasis = 'kg' | 'l' | 'ud' | 'unit'

// A unit → how many of its basis (kilos or litres) it holds.
const UNIT_TO_BASE: Record<ContentUnit, [number, 'kg' | 'l']> = {
  g: [0.001, 'kg'],
  kg: [1, 'kg'],
  ml: [0.001, 'l'],
  cl: [0.01, 'l'],
  dl: [0.1, 'l'],
  l: [1, 'l'],
}

/** The unit a typed token means, or null when it is not one we price. */
export function readUnit(raw: string | null | undefined): ContentUnit | null {
  if (!raw) return null
  return UNIT_ALIASES[raw.replace(/\.$/, '').toLowerCase()] ?? null
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
  const unit = readUnit(m[2])
  // A weighed line sold by volume counts its litres as kilos, as before.
  const kgFactor = unit != null ? UNIT_TO_BASE[unit][0] : undefined

  if (isPerKg) {
    return kgFactor != null ? value * kgFactor : null
  }

  // Non-per-unit: SI unit → pack descriptor (×1), otherwise numeric count
  return kgFactor != null ? 1 : value
}

export function parseKgFactor(quantity: string | null): number | null {
  return parseQuantityFactor(quantity, 'KILOGRAM')
}

/** A line's pack format: 6 × 1,5 L, 108 g, or a pack of 12. */
export interface PackFormat {
  count: number
  content?: number | null
  unit?: ContentUnit | null
}

function measure(
  quantity: string | null,
): { amount: number; basis: 'kg' | 'l' } | null {
  if (!quantity) return null
  const m = quantity.trim().match(QTY_RE)
  if (!m) return null
  const unit = readUnit(m[2])
  if (unit == null) return null
  const [factor, basis] = UNIT_TO_BASE[unit]
  return { amount: parseFloat(m[1].replace(',', '.')) * factor, basis }
}

/**
 * A line's price on a scale that compares across purchases, like a shelf
 * label: €/kg, €/L, €/ud of a pack, or €/unit bought.
 *
 * A weighed line is already €/kg. A pack format wins (6 × 1,5 L at 3,48 →
 * 0,39 €/L; a pack of 12 at 3,60 → 0,30 €/ud). With no format, a quantity
 * that names a size is read as the package size («500 g» at 1,20 →
 * 2,40 €/kg). Otherwise the price is per unit bought. `price` is per pack,
 * never the line total. Compare two prices only when their bases match. The
 * backend's spend insights run the same rule, pinned to quantityVectors.json.
 */
export function unitPrice(
  price: number,
  quantity: string | null,
  pricePer: string | null,
  pack: PackFormat | null = null,
): { value: number; basis: PriceBasis } {
  if (pricePer === 'KILOGRAM') return { value: price, basis: 'kg' }
  const count = pack?.count || 1
  if (pack?.content && pack.unit) {
    const [factor, basis] = UNIT_TO_BASE[pack.unit]
    return { value: price / (count * pack.content * factor), basis }
  }
  if (count > 1) return { value: price / count, basis: 'ud' }
  const size = measure(quantity)
  if (size?.amount) return { value: price / size.amount, basis: size.basis }
  return { value: price, basis: 'unit' }
}

/**
 * The `/ud`·`/kg` unit and its `price_per` are DERIVED from what is typed in the
 * quantity — a weight («500 ml», «1,12 kg») prices per kilo, anything else per
 * unit. This is rule 10a: no segmented toggle anywhere, the same rule everywhere
 * a price is entered.
 */
export function deriveUnit(quantity: string | null): {
  pricePer: 'KILOGRAM' | null
  suffix: string
} {
  const isWeight = !!quantity && parseKgFactor(quantity) !== null
  return {
    pricePer: isWeight ? 'KILOGRAM' : null,
    suffix: isWeight ? '/kg' : '/ud',
  }
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
 * The date a trip prints in the stack (18a / 29a). A trip whose day is the
 * viewer's today reads «hoy» — the nearest voice there is. A closed trip
 * otherwise settles to «22 jul» (day + short month). A proto-ticket — torn off,
 * still unwritten — prints «martes 21» (weekday + day) *while it is this
 * month's*: the near voice, because the day is recent and its weekday still
 * means something. Once it leaves the current month it is no longer recent, so
 * the weekday yields to the month and it prints «21 jul» — the same day+month
 * as a closed trip, disambiguated from one by its seal rather than its date.
 * A day in an earlier year also carries that year — «21 jul 2025» — since the
 * archive reaches back two years and «21 jul» alone would be ambiguous across
 * them.
 *
 * Always reads `opened_at`, the day the shopping started: it is the trip's
 * real day for every write path (a same-day close, a torn-off cart, or a
 * back-dated manual purchase whose `closed_at`/`tears_off_at` sit on the
 * following local midnight).
 *
 * The weekday form is built from two parts rather than one Intl call because
 * `{ weekday:'long', day:'numeric' }` yields «martes, 21» in es — the comma is
 * not in the frame.
 */
export function tripDateLabel(openedAt: string, proto: boolean): string {
  const d = parseServerInstant(openedAt)
  const now = new Date()
  const sameYearMonth =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (sameYearMonth && d.getDate() === now.getDate()) return 'hoy'
  if (proto && sameYearMonth) {
    const weekday = d.toLocaleDateString('es', { weekday: 'long' })
    const day = d.toLocaleDateString('es', { day: 'numeric' })
    return `${weekday} ${day}`
  }
  return d.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/**
 * The trip's day as a date-input value (YYYY-MM-DD) in the viewer's zone.
 * Closing a proto-trip defaults its date to this, so the trip stays filed
 * under the day it covered instead of jumping to today.
 */
export function tripDateInput(openedAt: string): string {
  const d = parseServerInstant(openedAt)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
