import type {
  ListItem,
  MatchedLine,
  PurchaseClosePayload,
  PurchaseLine,
  PurchaseNewItem,
  ReceiptScanResult,
  UnmatchedLine,
} from '../types'
import { parseQuantityFactor, type CostSummary } from './itemCost'
import { itemState } from './itemState'

/**
 * One row of the close sheet.
 *
 * The receipt-only fields are declared now and populated by nobody. Phase 3c
 * lays a scan's data over this same row rather than replacing the model, so
 * the two modes cannot drift into different shapes before they meet.
 */
export interface CloseLine {
  /** React's key. Separate from `itemId` because a row the household adds by
   *  hand has no item yet and still needs a stable identity. */
  key: string
  /** Null for something bought that was never on the list. */
  itemId: string | null
  name: string
  brand: string | null
  quantity: string | null
  price: number | null
  pricePer: 'KILOGRAM' | null
  included: boolean
  fromCart: boolean
  /** 3c: the line as the paper printed it. */
  receiptLine?: string
  /** 3c: whether the match was literal or interpreted. */
  matchState?: 'literal' | 'guess'
}

/**
 * The rows of a close sheet: the trip's own lines first, ticked, then whatever
 * is still on the list, offered unticked.
 *
 * Two kinds of row, and the difference is only where the tick starts. What the
 * trip already holds was picked up, so it is ticked. What is still on the list
 * was not, so it is offered — that is the household that shops without marking
 * anything and sorts it out at home.
 *
 * `purchaseId` names the trip being written down. Absent, it is the one still
 * open and its lines are the cart. Named, it is a trip that already tore off,
 * and its lines read as bought — so they cannot be found by asking which items
 * are in the cart, because none of them are. They have to be found by asking
 * which items are *its*.
 *
 * Either way, a line belonging to some other trip is left out rather than
 * offered. The server builds its cart from the trip it was handed and refuses
 * anything outside it, and it refuses the whole sheet rather than the one row.
 */
export function buildLines(
  items: ListItem[],
  now?: number,
  purchaseId?: string | null,
): CloseLine[] {
  const mine: CloseLine[] = []
  const pending: CloseLine[] = []
  for (const item of items) {
    const state = itemState(item, now)
    const isPending = state === 'pending'
    const belongsToThisTrip =
      purchaseId == null ? state === 'cart' : item.purchase_id === purchaseId
    if (!isPending && !belongsToThisTrip) continue
    const line: CloseLine = {
      key: item.id,
      itemId: item.id,
      name: item.name,
      brand: item.brand,
      quantity: item.purchased_quantity ?? item.quantity,
      price: item.price,
      pricePer: item.price_per === 'KILOGRAM' ? 'KILOGRAM' : null,
      included: !isPending,
      fromCart: !isPending,
    }
    ;(isPending ? pending : mine).push(line)
  }
  return [...mine, ...pending]
}

/**
 * The amount the paper printed for one line, written the way the sheet's
 * quantity field reads it.
 *
 * A weight is shown in grams below a kilo and in kilos above it, because that
 * is how the scale prints it. A line sold several at a time gives a count, and
 * anything else is one.
 */
function paperQuantity(line: MatchedLine | UnmatchedLine): string {
  if (line.price_type === 'KILOGRAM' && line.quantity != null) {
    return line.quantity < 1
      ? `${Math.round(line.quantity * 1000)}g`
      : `${line.quantity}kg`
  }
  if (line.price_type === 'MULTI' && line.quantity != null) {
    return String(Math.round(line.quantity))
  }
  return '1'
}

/** One line of the paper, already in the sheet's own vocabulary. */
interface PaperLine {
  index: number
  receiptLine: string
  /** The item the matcher named, or null when it named none. */
  itemId: string | null
  price: number
  pricePer: 'KILOGRAM' | null
  quantity: string
}

function toPaperLine(line: MatchedLine | UnmatchedLine): PaperLine {
  return {
    index: line.index,
    receiptLine: line.receipt_name,
    itemId: 'item_id' in line ? line.item_id : null,
    // A price on a row is per unit or per kilo, never what the line came to.
    price: line.unit_price,
    pricePer: line.price_type === 'KILOGRAM' ? 'KILOGRAM' : null,
    quantity: paperQuantity(line),
  }
}

/** A row with no product yet — the household has to say what the line was. */
function unassignedRow(line: PaperLine): CloseLine {
  return {
    key: `receipt-${line.index}`,
    itemId: null,
    name: '',
    brand: null,
    quantity: line.quantity,
    price: line.price,
    pricePer: line.pricePer,
    included: false,
    fromCart: false,
    receiptLine: line.receiptLine,
  }
}

/**
 * Lays a scan over the sheet's rows and returns the rows that result.
 *
 * The order is the paper's, because the raw line is the only thing a person
 * can check against what they are holding. The response splits the lines into
 * two arrays and each carries the position it was submitted at, so the order
 * is put back from those rather than from the arrays.
 *
 * Rows the paper never named come after, in the order they already had, and
 * unticked. The scan did not tick them, and a row the paper never printed must
 * not count toward what the paper says the shop cost.
 *
 * A match this sheet has no row for is dropped rather than shown. The matcher
 * looks at every item bought within a few days and has no idea which trip is
 * being closed, so it routinely names an item filed under an older ticket.
 * Naming it would let somebody pick an item the server refuses, and the server
 * refuses the whole sheet rather than the one row. The line still arrives, with
 * its raw string and its amounts, and the household says what it was.
 *
 * Every match is a guess. The response carries nothing that tells a fresh guess
 * apart from a string the household already resolved for this shop; that
 * distinction arrives with confirmed name mappings.
 */
export function receiptToLines(
  result: ReceiptScanResult,
  rows: CloseLine[],
): CloseLine[] {
  const byItem = new Map<string, CloseLine>()
  for (const r of rows) {
    if (r.itemId != null) byItem.set(r.itemId, r)
  }

  const paper: PaperLine[] = [
    ...result.matched.map(toPaperLine),
    ...result.unmatched.map(toPaperLine),
  ].sort((a, b) => a.index - b.index)

  const claimed = new Set<string>()
  const fromPaper: CloseLine[] = []
  for (const line of paper) {
    const existing = line.itemId != null ? byItem.get(line.itemId) : undefined
    // One row cannot hold two lines, and a receipt repeats a product freely.
    // The first line to claim the row keeps it; the next one asks.
    if (!existing || claimed.has(existing.key)) {
      fromPaper.push(unassignedRow(line))
      continue
    }
    claimed.add(existing.key)
    fromPaper.push({
      ...existing,
      quantity: line.quantity,
      price: line.price,
      pricePer: line.pricePer,
      included: true,
      receiptLine: line.receiptLine,
      matchState: 'guess',
    })
  }

  const rest = rows
    .filter((r) => !claimed.has(r.key))
    .map((r) => ({ ...r, included: false }))

  return [...fromPaper, ...rest]
}

/**
 * What the ticked lines add up to — the question the primary button asks,
 * because what is ticked is what is about to enter price history. It is not
 * what the paper says the shop cost; that is a different sum.
 *
 * Each price is multiplied by how much was bought, because a price here is per
 * unit or per kilo — never the amount the line came to. The sheet shows the
 * two fields with a `×` between them, so the sum has to agree with that.
 *
 * This is an estimate even when nothing is missing, and the screen must say
 * so. A till adds things no line ever held: a bag, a deposit, a discount. Only
 * a scanned receipt confirms what a shop actually cost.
 *
 * A line whose amount cannot be worked out is left out rather than guessed at,
 * and `partial` says so. Two ways that happens: no price at all, or a price
 * per kilo with no readable weight to apply it to. The second one is why this
 * flag exists — a count of priceless lines would not mention it, so the sheet
 * would print a confident figure with a row silently missing from it.
 *
 * Null when nothing ticked contributes, which keeps "no total" apart from
 * "a total of zero".
 */
export function linesTotal(lines: CloseLine[]): CostSummary | null {
  let total = 0
  let partial = false
  let any = false
  for (const line of lines) {
    if (!line.included) continue
    if (line.price == null) {
      partial = true
      continue
    }
    const factor = parseQuantityFactor(line.quantity, line.pricePer)
    if (factor === null) {
      partial = true
      continue
    }
    total += line.price * factor
    any = true
  }
  return any ? { total, partial } : null
}

/**
 * What every line the paper printed adds up to — the question the
 * reconciliation check asks, because it is this figure that is compared with
 * the total printed on the paper.
 *
 * A line the household did not tick still counts. It is on the paper either
 * way, and leaving it out would make the two figures disagree for a reason
 * nobody can see.
 *
 * The arithmetic and the partial flag are `linesTotal`'s, and mean the same
 * thing here. Null when no row came from a paper, which is every close written
 * by hand.
 */
export function receiptTotal(lines: CloseLine[]): CostSummary | null {
  let total = 0
  let partial = false
  let any = false
  for (const line of lines) {
    if (line.receiptLine == null) continue
    if (line.price == null) {
      partial = true
      continue
    }
    const factor = parseQuantityFactor(line.quantity, line.pricePer)
    if (factor === null) {
      partial = true
      continue
    }
    total += line.price * factor
    any = true
  }
  return any ? { total, partial } : null
}

/**
 * Takes the paper's authority off the rows and keeps what it read.
 *
 * Names, amounts and ticks are ordinary typed values from here on, so they
 * stay. What goes is the raw line standing behind each name and the claim that
 * the app's guess came from anywhere. The sheet is back in hand mode.
 */
export function discardPaper(lines: CloseLine[]): CloseLine[] {
  return lines.map((line) => {
    const kept = { ...line }
    delete kept.receiptLine
    delete kept.matchState
    return kept
  })
}

interface CloseMeta {
  store: string
  purchasedAt: string
  purchaseId: string | null
  /** The paper's figure. Null for a close written by hand. */
  total: number | null
}

export function toPayload(
  lines: CloseLine[],
  meta: CloseMeta,
): PurchaseClosePayload {
  const existing: PurchaseLine[] = []
  const created: PurchaseNewItem[] = []
  for (const line of lines) {
    if (!line.included) continue
    // A unit with no amount to apply it to is refused by the server, and it
    // refuses the whole sheet, not the one row. No path builds that pair
    // today, but the rule lives on the other side of the network where this
    // code cannot see it, so the sheet does not rely on staying lucky.
    const pricePer = line.price == null ? null : line.pricePer
    if (line.itemId) {
      existing.push({
        item_id: line.itemId,
        price: line.price,
        price_per: pricePer,
        quantity: line.quantity,
      })
    } else {
      created.push({
        name: line.name,
        brand: line.brand,
        ean: null,
        price: line.price,
        price_per: pricePer,
        quantity: line.quantity,
      })
    }
  }
  return {
    purchase_id: meta.purchaseId,
    store: meta.store,
    purchased_at: meta.purchasedAt,
    total: meta.total,
    lines: existing,
    new_items: created,
  }
}
