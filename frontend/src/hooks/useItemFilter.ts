import { foldText } from '../lib/foldText'
import { parseInput } from '../lib/parseInput'
import { storeKey } from '../lib/storeKey'
import type { ListItem } from '../types'

export function filterItems(
  items: ListItem[],
  query: string,
  options?: { strictStore?: boolean },
): ListItem[] {
  if (!query.trim()) return items

  const parsed = parseInput(query)
  const text = foldText(parsed.name.trim())
  const stores = parsed.stores.map((s) => storeKey(s))
  const brand = parsed.brand != null ? foldText(parsed.brand) : null
  const strictStore = options?.strictStore ?? false

  return items.filter((item) => {
    if (text && !foldText(item.name).includes(text)) return false

    if (stores.length > 0) {
      const itemStores = item.stores.map((s) => storeKey(s))
      // chip filter: items with no store assigned pass through
      // search filter (strictStore): items with no store are excluded
      if (
        strictStore
          ? !itemStores.some((s) => stores.includes(s))
          : itemStores.length > 0 && !itemStores.some((s) => stores.includes(s))
      )
        return false
    }

    if (
      brand !== null &&
      !(item.brand != null && foldText(item.brand).includes(brand))
    )
      return false

    return true
  })
}
