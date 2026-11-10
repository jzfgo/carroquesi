import type { ListItem } from '../types'

/**
 * The store the price form starts on for a bought line.
 *
 * A price saved earlier keeps its store: someone chose it. Otherwise the
 * price belongs to the shop of the trip the line was bought on. The item's
 * store tags are only a plan made before the trip, so they come last.
 * Nothing carries over from the previous line priced: lines priced in a batch
 * often come from different trips.
 */
export function defaultPriceStore(item: ListItem): string | null {
  return item.price_store ?? item.purchase_store ?? item.stores[0] ?? null
}
