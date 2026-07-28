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
 * Past this many shops the heading stops naming them and counts them instead.
 *
 * Two, measured rather than guessed. Rendered in the written hand at 17px
 * uppercase, against the 294px a Pixel 10 leaves between the side margins,
 * every one of the 144 headings the real chain list can produce fits under
 * this rule — the widest, "BM Supermercados u otras 7 tiendas", comes to
 * 288px. Naming three overflows 42 of them, because "BM Supermercados, El
 * Corte Inglés o Mercadona" is 379px on its own: the spelled-out triple was
 * always the widest thing here, not the counted form, so a rule that only
 * starts counting above three never touches the case that wraps.
 *
 * And a wrapped heading is not a cosmetic problem: the underline is drawn on
 * the name, so wrapping breaks it into two underlined fragments, which reads
 * as two headings.
 */
const NAMED_LIMIT = 2

/**
 * How many are still named once the heading gives up on naming them all.
 *
 * One. The tail costs a fixed ~18 characters, so a second name is what pushes
 * the counted form past the width it was introduced to save.
 */
const NAMED_BEFORE_COUNT = 1

/**
 * The shops of a group, written the way you would say them.
 *
 * One shop is its own name; two are joined by the conjunction — "Dia o
 * Mercadona". No Oxford comma anywhere; Spanish does not use one.
 *
 * Beyond two the heading names the first and counts the rest: "Dia u otras 3
 * tiendas". Naming five shops is not information anyone reads — it is a wall
 * of proper nouns wide enough to wrap — and what the line actually says is
 * "this one is easy to find". The count says that in a breath. Which shops
 * they are is still one tap away, in the item.
 *
 * The remainder is a numeral rather than a word: it is the shortest thing that
 * can be read at a glance, and length is the whole reason this branch exists.
 *
 * The conjunction is computed rather than hard-coded even though `otra(s)`
 * always begins with /o/ and therefore always takes `u`: the rule lives in one
 * place, so it cannot drift out of step here.
 */
export function formatShops(shops: string[]): string {
  if (shops.length === 0) return ''
  if (shops.length === 1) return shops[0]

  if (shops.length > NAMED_LIMIT) {
    const named = shops.slice(0, NAMED_BEFORE_COUNT)
    const left = shops.length - NAMED_BEFORE_COUNT
    // Guarded rather than assumed: with the constants above `left` is never 1,
    // but the singular is one word away and a "1 tiendas" would be a bug in
    // Spanish, not a rounding detail.
    const tail = left === 1 ? 'otra tienda' : `otras ${left} tiendas`
    return `${named.join(', ')} ${conjunction(tail)} ${tail}`
  }

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
