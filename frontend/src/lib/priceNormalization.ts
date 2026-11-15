import type { PriceEntry } from '../types'
import { parseKgFactor, unitPrice } from './itemCost'

export interface ChartEntry {
  displayAmount: number | null
  displayPricePer: 'KILOGRAM' | null
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
 * Converts PriceEntry records to ChartEntry records, normalizing to €/kg when
 * any entry has a parseable SI quantity or is already price_per='KILOGRAM'.
 * Entries that cannot be converted receive displayAmount=null (rendered as isolated dots).
 *
 * The trigger is global: if any entry qualifies, all entries are processed,
 * ensuring cross-store comparison on a consistent scale.
 */
export function normalizeEntries(entries: PriceEntry[]): NormalizationResult {
  // A sin-precio row (bought, price unconfirmed) has no amount, so it is not a
  // plottable point — the chart is about prices that exist. The per-store
  // history list (frame 22b) renders those gaps from the raw response; here we
  // work on the priced rows only. The predicate narrows amount to number, which
  // keeps originalAmount non-null and the €/kg arithmetic below safe.
  const priced = entries.filter(
    (e): e is PriceEntry & { amount: number } => e.amount !== null,
  )
  const shouldNormalize = priced.some(
    (e) => e.price_per === 'KILOGRAM' || parseKgFactor(e.quantity) !== null,
  )

  if (!shouldNormalize) {
    return {
      entries: priced.map((e) => ({
        displayAmount: e.amount,
        displayPricePer: e.price_per as 'KILOGRAM' | null,
        store: e.store,
        purchased_at: e.purchased_at,
        originalAmount: e.amount,
        originalPricePer: e.price_per,
        reduced: e.reduced,
        originalBefore: e.price_before ?? null,
      })),
      isNormalized: false,
      hasGaps: false,
    }
  }

  let isNormalized = false
  let hasGaps = false

  const normalized: ChartEntry[] = priced.map((e) => {
    const unit = unitPrice(e.amount, e.quantity, e.price_per)
    const displayAmount = unit.basis === 'kg' ? unit.value : null
    if (displayAmount === null) hasGaps = true
    else if (e.price_per !== 'KILOGRAM') isNormalized = true

    return {
      displayAmount,
      displayPricePer: 'KILOGRAM' as const,
      store: e.store,
      purchased_at: e.purchased_at,
      originalAmount: e.amount,
      originalPricePer: e.price_per,
      reduced: e.reduced,
      originalBefore: e.price_before ?? null,
    }
  })

  return { entries: normalized, isNormalized, hasGaps }
}
