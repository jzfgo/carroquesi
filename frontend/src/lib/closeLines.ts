import type {
  ListItem,
  PurchaseClosePayload,
  PurchaseLine,
  PurchaseNewItem,
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
 * What the ticked lines add up to.
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
