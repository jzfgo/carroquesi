import type {
  ListItem,
  PurchaseClosePayload,
  PurchaseLine,
  PurchaseNewItem,
} from '../types'
import { parseQuantityFactor } from './itemCost'
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
 * Everything not yet bought, cart first.
 *
 * Two kinds of row, and the difference is only where the tick starts. What is
 * in the cart was picked up, so it is ticked. What is still on the list was
 * not, so it is offered — that is the household that shops without marking
 * anything and sorts it out at home.
 */
export function buildLines(items: ListItem[], now?: number): CloseLine[] {
  const cart: CloseLine[] = []
  const pending: CloseLine[] = []
  for (const item of items) {
    const state = itemState(item, now)
    if (state === 'bought') continue
    const line: CloseLine = {
      key: item.id,
      itemId: item.id,
      name: item.name,
      brand: item.brand,
      quantity: item.purchased_quantity ?? item.quantity,
      price: item.price,
      pricePer: item.price_per === 'KILOGRAM' ? 'KILOGRAM' : null,
      included: state === 'cart',
      fromCart: state === 'cart',
    }
    ;(state === 'cart' ? cart : pending).push(line)
  }
  return [...cart, ...pending]
}

/**
 * The sum of the ticked lines, weighed by how much of each was bought — a
 * price is per unit or per kilo, never the amount the line came to.
 *
 * This is an estimate and the screen must say so. A till adds things no line
 * ever held: a bag, a deposit, a discount. Only a scanned receipt confirms
 * what a shop actually cost.
 *
 * A line whose amount cannot be worked out — no price, or a price per kilo
 * with no weight to apply it to — is left out rather than guessed at.
 */
export function linesTotal(lines: CloseLine[]): number | null {
  let total = 0
  let any = false
  for (const line of lines) {
    if (!line.included || line.price == null) continue
    const factor = parseQuantityFactor(line.quantity, line.pricePer)
    if (factor === null) continue
    total += line.price * factor
    any = true
  }
  return any ? total : null
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
    if (line.itemId) {
      existing.push({
        item_id: line.itemId,
        price: line.price,
        price_per: line.pricePer,
        quantity: line.quantity,
      })
    } else {
      created.push({
        name: line.name,
        brand: line.brand,
        ean: null,
        price: line.price,
        price_per: line.pricePer,
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
