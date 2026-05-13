import { parseInput } from '../parseInput'
import type { ListItem } from '../types'

export function filterItems(
  items: ListItem[],
  query: string,
  options?: { strictStore?: boolean },
): ListItem[] {
  if (!query.trim()) return items

  const parsed = parseInput(query)
  const text = parsed.name.trim().toLowerCase()
  const stores = parsed.stores.map(s => s.toLowerCase())
  const brand = parsed.brand?.toLowerCase() ?? null
  const strictStore = options?.strictStore ?? false

  return items.filter(item => {
    if (text && !item.name.toLowerCase().includes(text)) return false

    if (stores.length > 0) {
      const itemStores = item.stores.map(s => s.toLowerCase())
      // chip filter: items with no store assigned pass through
      // search filter (strictStore): items with no store are excluded
      if (strictStore
        ? !itemStores.some(s => stores.includes(s))
        : itemStores.length > 0 && !itemStores.some(s => stores.includes(s))
      ) return false
    }

    if (brand !== null && !item.brand?.toLowerCase().includes(brand)) return false

    return true
  })
}
