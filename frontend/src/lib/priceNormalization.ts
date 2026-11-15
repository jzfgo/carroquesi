import type { PriceEntry } from '../types'
import { type PackFormat, type PriceBasis, unitPrice } from './itemCost'
import { compareServerInstants } from './serverInstant'

export interface ChartEntry {
  displayAmount: number | null
  /** The basis `displayAmount` is in: the history's, shared by every entry. */
  displayBasis: PriceBasis
  store: string | null
  purchased_at: string | null
  originalAmount: number
  originalPricePer: string | null
  /** A reduced label's price: a hollow point, kept off the curve and out of
   *  the minimum. */
  reduced: boolean
  /** The price before the reduction, in the original basis, when known. */
  originalBefore: number | null
  pack: PackFormat | null
}

interface NormalizationResult {
  entries: ChartEntry[]
  isNormalized: boolean
  hasGaps: boolean
}

/**
 * Puts a product's prices on one scale, like a shelf label.
 *
 * When any entry can be priced per kg, L or ud of a pack, the history takes
 * the basis most of those entries share; entries priced per unit bought do
 * not vote. An entry on another basis, or with no format
 * at all, gets displayAmount=null: it keeps its own price, off the curve and
 * out of the minimum. Kilos and litres are never mixed. When no entry can be
 * converted, every price stays per unit bought.
 */
export function normalizeEntries(entries: PriceEntry[]): NormalizationResult {
  // A sin-precio row (bought, price unconfirmed) has no amount, so it is not a
  // plottable point — the chart is about prices that exist. The per-store
  // history list (frame 22b) renders those gaps from the raw response; here we
  // work on the priced rows only.
  const priced = entries
    .filter((e): e is PriceEntry & { amount: number } => e.amount !== null)
    .map((e) => ({
      e,
      unit: unitPrice(
        e.amount,
        e.quantity ?? null,
        e.price_per,
        e.pack ?? null,
      ),
    }))

  const basis = sharedBasis(
    priced.map((p) => ({ basis: p.unit.basis, at: p.e.purchased_at ?? null })),
  )
  let isNormalized = false
  let hasGaps = false

  const normalized = priced.map(({ e, unit }): ChartEntry => {
    const displayAmount = unit.basis === basis ? unit.value : null
    if (displayAmount === null) hasGaps = true
    else if (basis !== 'unit' && e.price_per !== 'KILOGRAM') isNormalized = true
    return {
      displayAmount,
      displayBasis: basis,
      store: e.store,
      purchased_at: e.purchased_at ?? null,
      originalAmount: e.amount,
      originalPricePer: e.price_per,
      reduced: e.reduced,
      originalBefore: e.price_before ?? null,
      pack: e.pack ?? null,
    }
  })

  return { entries: normalized, isNormalized, hasGaps }
}

/** The basis most entries can be priced on; per unit bought only if none. */
function sharedBasis(
  entries: { basis: PriceBasis; at: string | null }[],
): PriceBasis {
  const counts = new Map<PriceBasis, number>()
  for (const { basis } of entries) {
    if (basis !== 'unit') counts.set(basis, (counts.get(basis) ?? 0) + 1)
  }
  // A tie goes to the newest dated entry's basis. A dateless manual log has
  // no place in time, so it never breaks a tie.
  const newestFirst = [...entries].sort((a, b) => {
    if (a.at === b.at) return 0
    if (a.at === null) return 1
    if (b.at === null) return -1
    return compareServerInstants(b.at, a.at)
  })
  let best: PriceBasis = 'unit'
  let most = 0
  for (const { basis } of newestFirst) {
    const n = counts.get(basis) ?? 0
    if (n > most) {
      best = basis
      most = n
    }
  }
  return best
}
