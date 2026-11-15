import type { PriceEntry } from '../types'
import { type PriceBasis, unitPrice } from './itemCost'

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
 * the basis most entries share. An entry on another basis, or with no format
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

  const basis = sharedBasis(priced.map((p) => p.unit.basis))
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
    }
  })

  return { entries: normalized, isNormalized, hasGaps }
}

/** The basis most entries can be priced on; per unit bought only if none. */
function sharedBasis(bases: PriceBasis[]): PriceBasis {
  const counts = new Map<PriceBasis, number>()
  for (const b of bases) {
    if (b !== 'unit') counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  let best: PriceBasis = 'unit'
  let most = 0
  // A tie goes to the newer entries' basis: the response is oldest first.
  for (const b of [...bases].reverse()) {
    const n = counts.get(b) ?? 0
    if (n > most) {
      best = b
      most = n
    }
  }
  return best
}
