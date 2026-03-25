import type { ListItem } from '../types'

export function clientSideSuggestions(
  items: ListItem[],
  field: 'variety' | 'brand' | 'store',
  partial: string,
): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  for (const item of items) {
    const val = item[field]
    if (val && val.toLowerCase().startsWith(partial.toLowerCase()) && !seen.has(val)) {
      seen.add(val)
      results.push(val)
    }
  }
  return results.slice(0, 5)
}
