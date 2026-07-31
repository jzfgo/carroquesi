import { formatPrice } from './formatPrice'
import type { ChartEntry } from './priceNormalization'

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
}

function month(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { month: 'long' })
}

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
    sentences.push(`Lo añadió ${addedBy} el ${shortDate(createdAt)}.`)
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
      purchases.length === 1 ? 'Comprado una vez' : `Comprado ${purchases.length} veces`
    sentences.push(
      `${times} desde ${month(first)}, la última el ${shortDate(last)}.`,
    )
  }

  // Only what somebody confirmed, and only when the two ends differ: "se paga
  // entre X y X" says less than the price already said.
  const amounts = entries
    .map((e) => e.originalAmount)
    .filter((a): a is number => a !== null)
  if (amounts.length > 1) {
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    if (min !== max) {
      sentences.push(`Se paga entre ${formatPrice(min)} y ${formatPrice(max)}.`)
    }
  }

  return sentences
}
