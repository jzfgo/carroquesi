import { parseInput } from '../parseInput'
import type { ListItem } from '../types'

export function filterItems(items: ListItem[], query: string): ListItem[] {
  if (!query.trim()) return items

  const parsed = parseInput(query)
  const text = parsed.name.trim().toLowerCase()
  const stores = parsed.stores.map(s => s.toLowerCase())
  const brand = parsed.brand?.toLowerCase() ?? null

  return items.filter(item => {
    if (text && !item.name.toLowerCase().includes(text)) return false

    if (stores.length > 0) {
      const itemStores = item.stores.map(s => s.toLowerCase())
      if (itemStores.length > 0 && !itemStores.some(s => stores.includes(s))) return false
    }

    if (brand !== null && !item.brand?.toLowerCase().includes(brand)) return false

    return true
  })
}
