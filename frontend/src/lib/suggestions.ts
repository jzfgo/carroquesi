import type { ListItem } from '../types'

export function clientSideSuggestions(
  items: ListItem[],
  field: 'brand' | 'stores',
  partial: string,
): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  for (const item of items) {
    const vals: (string | null)[] =
      field === 'stores' ? item.stores : [item[field]]
    for (const val of vals) {
      if (val && val.toLowerCase().startsWith(partial.toLowerCase()) && !seen.has(val)) {
        seen.add(val)
        results.push(val)
      }
    }
  }
  return results.slice(0, 5)
}

export function formatFrequency(days: number): string {
  if (days < 2) return 'cada día'
  if (days < 7) return `cada ${Math.round(days)} días`
  if (days < 14) return 'cada semana'
  if (days < 28) return `cada ${Math.round(days / 7)} semanas`
  if (days < 60) return 'cada mes'
  return `cada ${Math.round(days / 30)} meses`
}

export function formatRecency(days: number): string {
  if (days < 2) return 'hace 1 día'
  if (days < 14) return `hace ${Math.round(days)} días`
  if (days < 60) return `hace ${Math.round(days / 7)} semanas`
  return `hace ${Math.round(days / 30)} meses`
}
