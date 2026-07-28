/**
 * Grouping what is still to buy by the shops that can supply it.
 *
 * A line naming two shops used to be filed under both, so it appeared twice.
 * That read as two things to buy when it is one: the household is not saying
 * "get eggs at Dia and eggs at Mercadona", they are saying "get eggs, either
 * place will do". So the group is the *set* of shops, named after all of them
 * — "Dia o Mercadona" — and the line appears once, under it.
 *
 * ## The set is the identity, not the order
 *
 * `stores` is a free-order array server-side: one item can hold
 * `["Mercadona", "Dia"]` and the next `["Dia", "Mercadona"]` for the same pair.
 * Keying on the written order would file those apart and reinstate the
 * fragmentation this exists to remove, so the key is the sorted set and the
 * heading is written from the same sorted array. One comparator, one order,
 * no way for the key and the label to disagree.
 *
 * ## Widest choice first
 *
 * Groups come out in order of narrowing constraint: what can be bought
 * anywhere, then the shops-plural groups from most choices to fewest, then the
 * single shops. Walking down the list, the further you go the more it matters
 * where you are. Ties keep the order they first appear in, so within one band
 * the list stays the list.
 */
import type { ListItem } from '../types'

/** Spanish collation, so accented shop names sort where a reader expects. */
const collate = (a: string, b: string) => a.localeCompare(b, 'es')

/**
 * `o` becomes `u` before a word that *sounds* like it starts with /o/ —
 * "Dia u Opencor", "siete u ocho", "mujer u hombre". The silent h is why the
 * test is on the sound and not the letter.
 *
 * Only the shop after the conjunction matters, and sorting has already made
 * that the last one.
 */
function conjunction(next: string): string {
  const normalised = next
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return /^h?o/.test(normalised) ? 'u' : 'o'
}

/**
 * The shops of a group, written the way you would say them.
 *
 * One shop is its own name; two are joined by the conjunction; three or more
 * take commas until the last. No Oxford comma — Spanish does not use one.
 */
export function formatShops(shops: string[]): string {
  if (shops.length === 0) return ''
  if (shops.length === 1) return shops[0]
  const last = shops[shops.length - 1]
  const rest = shops.slice(0, -1)
  return `${rest.join(', ')} ${conjunction(last)} ${last}`
}

export interface ShopGroup {
  /** Sorted and de-duplicated. Empty for the group that can be bought anywhere. */
  shops: string[]
  items: ListItem[]
}

/**
 * Split items into shop groups, in the order they should be read.
 *
 * Items naming no shop come first and unheaded: they belong to every trip.
 */
export function groupByShops(items: ListItem[]): ShopGroup[] {
  // The insertion index is kept explicitly rather than leaning on sort
  // stability: the comparator below reorders across the no-shop split, and
  // "the order it first appeared" has to survive that.
  const groups = new Map<string, ShopGroup & { seen: number }>()

  for (const item of items) {
    const shops = [...new Set(item.stores)].sort(collate)
    // Joined on a NUL, which no shop name can contain. A printable separator
    // would collide: one shop named "Dia, Mercadona" would key the same as
    // the pair of them.
    const key = shops.join('\u0000')
    let group = groups.get(key)
    if (!group) {
      group = { shops, items: [], seen: groups.size }
      groups.set(key, group)
    }
    group.items.push(item)
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        // Buy-anywhere first, whenever it was first seen.
        Number(b.shops.length === 0) - Number(a.shops.length === 0) ||
        b.shops.length - a.shops.length ||
        a.seen - b.seen,
    )
    .map(({ shops, items }) => ({ shops, items }))
}
