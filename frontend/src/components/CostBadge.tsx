import { formatPrice } from '../lib/formatPrice'
import type { CostSummary } from '../lib/itemCost'

/**
 * A money figure that says when it is only a floor.
 *
 * The mark means "there is more than this", and both screens that print it
 * owe the reader the same glyph. What is missing differs — a till adds things
 * no line ever held, a ticked row can be left out of a sum — but the promise
 * to the reader is identical, so the mark is drawn in one place.
 */
export function CostBadge({
  cost,
  className,
}: {
  cost: CostSummary
  className: string
}) {
  return (
    <span className={className}>
      {cost.partial ? '≥\u202f' : ''}
      {formatPrice(cost.total)}
    </span>
  )
}
