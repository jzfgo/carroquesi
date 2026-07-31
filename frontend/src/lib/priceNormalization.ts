import type { PriceEntry } from '../types'
import { parseKgFactor } from './itemCost'

export interface ChartEntry {
  displayAmount: number | null
  displayPricePer: 'KILOGRAM' | null
  store: string | null
  purchased_at: string | null
  /** null when the shop recorded no amount at all. */
  originalAmount: number | null
  originalPricePer: string | null
}

export interface NormalizationResult {
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
 *
 * Two different things arrive as a null displayAmount, and only originalAmount
 * tells them apart: a price that would not convert keeps its original figure,
 * a shop that wrote nothing down has none to keep.
 */
export function normalizeEntries(entries: PriceEntry[]): NormalizationResult {
  const shouldNormalize = entries.some(
    (e) =>
      e.amount !== null &&
      (e.price_per === 'KILOGRAM' || parseKgFactor(e.quantity) !== null),
  )

  if (!shouldNormalize) {
    return {
      entries: entries.map((e) => ({
        displayAmount: e.amount,
        displayPricePer: e.price_per as 'KILOGRAM' | null,
        store: e.store,
        purchased_at: e.purchased_at,
        originalAmount: e.amount,
        originalPricePer: e.price_per,
      })),
      isNormalized: false,
      hasGaps: false,
    }
  }

  let isNormalized = false
  let hasGaps = false

  const normalized: ChartEntry[] = entries.map((e) => {
    let displayAmount: number | null

    if (e.amount === null) {
      // Nothing to convert and nothing missing from the conversion, so this
      // does not count as a gap: hasGaps is about amounts that would not convert.
      displayAmount = null
    } else if (e.price_per === 'KILOGRAM') {
      displayAmount = e.amount
    } else {
      const kgFactor = parseKgFactor(e.quantity)
      if (kgFactor !== null) {
        displayAmount = e.amount / kgFactor
        isNormalized = true
      } else {
        displayAmount = null
        hasGaps = true
      }
    }

    return {
      displayAmount,
      displayPricePer: 'KILOGRAM' as const,
      store: e.store,
      purchased_at: e.purchased_at,
      originalAmount: e.amount,
      originalPricePer: e.price_per,
    }
  })

  return { entries: normalized, isNormalized, hasGaps }
}
