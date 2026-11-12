import type { ListItem, PriceEntry } from '../types'
import { formatFigure, unitPriceSuffix } from './formatPrice'
import { formatChartDate } from './priceChart'

const FULL_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Just enough of the members map for the "who added it" clause. */
interface MemberLookup {
  get(id: string): { displayName: string } | undefined
}

/**
 * A piece of the sentence. A plain string prints as-is; a `{ b }` piece prints
 * emphasised. The renderer decides how — bold in the ficha — while the text
 * stays the single source of truth (`buildRastro` joins the same pieces).
 */
export type RastroSegment = string | { b: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function datePart(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = iso.slice(0, 10)
  return DATE_RE.test(d) ? d : null
}

/**
 * The "Rastro" sentence, as segments: who added the product and when, how often
 * it has been bought and over what span, and the price range paid. Every fact
 * comes from the item and its own price history, so the line needs no extra
 * fetch. The product's adder and the price figures come back emphasised.
 *
 * Each clause drops out when its facts are missing — an adder who has since
 * left the list takes the name with them, never leaving an "undefined", and a
 * product bought once or never skips the span it does not have. Dates are read
 * off the ISO string directly, so the sentence reads the same in every zone.
 */
export function buildRastroSegments(
  item: ListItem,
  members: MemberLookup,
  entries: PriceEntry[],
): RastroSegment[] {
  const clauses: RastroSegment[][] = []

  const adder = members.get(item.added_by)
  const added = datePart(item.created_at)
  if (added) {
    clauses.push(
      adder?.displayName
        ? [
            'Lo añadió ',
            { b: adder.displayName },
            ` el ${formatChartDate(added)}.`,
          ]
        : [`Añadido el ${formatChartDate(added)}.`],
    )
  }

  const purchases = entries
    .map((e) => datePart(e.purchased_at))
    .filter((d): d is string => d !== null)
    .sort()
  if (purchases.length === 1) {
    clauses.push([`Comprado una vez el ${formatChartDate(purchases[0])}.`])
  } else if (purchases.length > 1) {
    const firstMonth = FULL_MONTHS[parseInt(purchases[0].slice(5, 7), 10) - 1]
    const last = formatChartDate(purchases[purchases.length - 1])
    clauses.push([
      `Comprado ${purchases.length} veces desde ${firstMonth}, la última el ${last}.`,
    ])
  }

  const allPriced = entries.filter(
    (e): e is PriceEntry & { amount: number } => e.amount !== null,
  )
  // A reduced price is a one-off, not what the product costs, so the range
  // leaves it out and says so.
  const priced = allPriced.filter((e) => !e.reduced)
  const skipped = priced.length < allPriced.length
  // A per-kilo and a per-unit price can't share a range, so prices kept on
  // two bases drop the clause.
  const bases = new Set(priced.map((e) => e.price_per))
  if (priced.length > 0 && bases.size === 1) {
    const amounts = priced.map((e) => e.amount)
    const min = Math.min(...amounts)
    const max = Math.max(...amounts)
    // A range names its unit once, at the end.
    const unit = unitPriceSuffix(priced[0].price_per)
    const end = skipped ? ', sin contar precios bajados.' : '.'
    clauses.push(
      min === max
        ? ['Siempre a ', { b: `${formatFigure(min)}\u00a0${unit}` }, end]
        : [
            'Se paga entre ',
            { b: formatFigure(min) },
            ' y ',
            { b: `${formatFigure(max)}\u00a0${unit}` },
            end,
          ],
    )
  }

  // Join the clauses with a plain space between them.
  return clauses.flatMap((clause, i) => (i === 0 ? clause : [' ', ...clause]))
}

/** The sentence as plain text — the segments joined, emphasis dropped. */
export function buildRastro(
  item: ListItem,
  members: MemberLookup,
  entries: PriceEntry[],
): string {
  return buildRastroSegments(item, members, entries)
    .map((s) => (typeof s === 'string' ? s : s.b))
    .join('')
}
