import type { ListItem } from '../types'

/** Three states, not two.
 *
 *  - `pending`  — on the list, not picked up. An empty circle.
 *  - `cart`     — in the cart on this trip. The progress bar counts these as
 *                 done: the shopping is what it measures, not the paying.
 *  - `bought`   — settled. The trip it belonged to has rolled over, and the
 *                 line is a record rather than an instruction.
 *
 *  None of this needs a column. `purchased` is already derived from
 *  `purchased_at`, and the boundary between the last two is the day: whatever
 *  is still in the cart at midnight tears off along the die-cut and becomes a
 *  purchase. Nothing is asked of anyone; the paper just gets torn.
 */
export type ItemState = 'pending' | 'cart' | 'bought'

/** The backend sends naive UTC timestamps, and the boundary that matters is
 *  **local** midnight — the one the person who marked the item lived through.
 *  Comparing the two as date strings gets that wrong by the size of the
 *  timezone offset, which in Spain means a late-evening shop reads as
 *  yesterday's. Compare instants against local midnight instead. */
function isToday(timestamp: string): boolean {
  const marked = new Date(`${timestamp}Z`)
  if (Number.isNaN(marked.getTime())) return false
  const now = new Date()
  return (
    marked.getFullYear() === now.getFullYear() &&
    marked.getMonth() === now.getMonth() &&
    marked.getDate() === now.getDate()
  )
}

/** The single place the cart rule lives. An item is only ever purchased or not;
 *  "in the cart" is context, read off the purchase date. Today that context is
 *  the day alone — at midnight every cart item becomes fully purchased, whether
 *  or not anyone gave it a price. When closing a trip early ("Cerrar compra")
 *  arrives with a real `Purchase`, it becomes a second way into `bought`, and
 *  this function is the only thing that has to change. */
export function itemState(item: ListItem): ItemState {
  if (!item.purchased_at) {
    // The backend derives `purchased` from `purchased_at`, so the two cannot
    // disagree — but if they ever did, calling a bought item "still to buy" is
    // the worse of the two mistakes. Undated means it cannot be this trip's.
    return item.purchased ? 'bought' : 'pending'
  }
  return isToday(item.purchased_at) ? 'cart' : 'bought'
}

/** What the progress bar counts. An item in the cart is shopping done. */
export function isInCart(item: ListItem): boolean {
  return itemState(item) === 'cart'
}
