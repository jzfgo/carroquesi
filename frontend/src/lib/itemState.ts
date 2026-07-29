import type { ListItem } from '../types'
import { parseNaiveUtc } from './naiveUtc'

/** Three states, not two.
 *
 *  - `pending`  — on the list, not picked up. An empty circle.
 *  - `cart`     — in the cart on this trip. The progress bar counts these as
 *                 done: the shopping is what it measures, not the paying.
 *  - `bought`   — settled. The trip it belonged to has ended, and the line is
 *                 a record rather than an instruction.
 */
export type ItemState = 'pending' | 'cart' | 'bought'

/** The single place the cart rule lives.
 *
 *  There is no date arithmetic here, and that is the point. A trip carries
 *  `purchase_ends_at` — `closed_at ?? tears_off_at`, stamped by the backend in
 *  the household's timezone — so both ways out of the cart are one comparison:
 *  the trip was closed early with "Cerrar compra", or it tore off at midnight.
 *
 *  This used to compare local calendar days, and five other places in the
 *  codebase compared them too, four of them in UTC. The trip owns the
 *  boundary now.
 *
 *  `now` is a parameter rather than a hidden `Date.now()` read because this
 *  answer changes on its own, with no input to the caller having changed. A
 *  caller that memoises the result needs the clock in its dependency list, and
 *  it can only put it there if the clock is something it holds — see
 *  `useTearOff`, which owns the instant the answer flips.
 */
export function itemState(item: ListItem, now: number = Date.now()): ItemState {
  if (!item.purchased_at) {
    // The backend derives `purchased` from `purchased_at`, so the two cannot
    // disagree — but if they ever did, calling a bought item "still to buy" is
    // the worse of the two mistakes.
    return item.purchased ? 'bought' : 'pending'
  }
  if (!item.purchase_ends_at) {
    // Toggled offline and not yet synced: the server has not said which trip
    // this joined. It stays in the cart, because the paper has not been filed.
    return 'cart'
  }
  const ends = parseNaiveUtc(item.purchase_ends_at)
  if (ends === null) return 'cart'
  return now >= ends ? 'bought' : 'cart'
}
