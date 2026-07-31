import { formatPrice } from './formatPrice'
import { formatMonth, formatShortDate } from './formatShortDate'
import type { ChartEntry } from './priceNormalization'

interface TrailInput {
  addedBy: string | null
  createdAt: string
  entries: ChartEntry[]
}

/**
 * The trail is a sentence, not a table. A history is read to answer "who put
 * this here, how often do we buy it, and what does it cost us" — three plain
 * statements, each dropped when there is nothing to say.
 */
export function itemTrail({
  addedBy,
  createdAt,
  entries,
}: TrailInput): string[] {
  const sentences: string[] = []

  if (addedBy) {
    sentences.push(`Lo añadió ${addedBy} el ${formatShortDate(createdAt)}.`)
  }

  const purchases = entries
    .filter((e): e is ChartEntry & { purchased_at: string } =>
      Boolean(e.purchased_at),
    )
    .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at))

  if (purchases.length > 0) {
    const first = purchases[0].purchased_at
    const last = purchases[purchases.length - 1].purchased_at
    const times =
      purchases.length === 1
        ? 'Comprado una vez'
        : `Comprado ${purchases.length} veces`
    sentences.push(
      `${times} desde ${formatMonth(first)}, la última el ${formatShortDate(last)}.`,
    )
  }

  // Only what somebody confirmed, and only when the two ends differ: "se paga
  // entre X y X" says less than the price already said.
  //
  // The two ends have to be on one scale. displayAmount is that scale: it holds
  // the recorded figure when the history did not convert anything, and €/kg for
  // every record that could convert when it did. Reading the recorded figures
  // instead would join a per-unit price and a per-kilo price with "entre", and
  // this sentence has no column heading to warn anyone.
  const comparable = entries.filter((e) => e.displayAmount !== null)
  const amounts = comparable.map((e) => e.displayAmount as number)
  if (amounts.length > 1) {
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    const pricePer = comparable[0].displayPricePer
    if (min !== max) {
      sentences.push(
        `Se paga entre ${formatPrice(min, pricePer)} y ${formatPrice(max, pricePer)}.`,
      )
    }
  }

  return sentences
}
