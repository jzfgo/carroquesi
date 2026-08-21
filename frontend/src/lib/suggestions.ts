import type { ListItem } from '../types'
import { storeKey } from './storeKey'

export function clientSideSuggestions(
  items: ListItem[],
  field: 'brand' | 'stores',
  partial: string,
): string[] {
  // Stores match and dedupe by key so a spelling variant is offered
  // instead of silently birthing a new one ("ahorram" must suggest
  // "Ahorra Más" even though the space breaks startsWith). Brands keep
  // plain lowercase matching.
  const matches =
    field === 'stores'
      ? (val: string) => storeKey(val).startsWith(storeKey(partial))
      : (val: string) => val.toLowerCase().startsWith(partial.toLowerCase())
  const dedupeKey = field === 'stores' ? storeKey : (val: string) => val
  const seen = new Set<string>()
  const results: string[] = []
  for (const item of items) {
    const vals: (string | null)[] =
      field === 'stores' ? item.stores : [item[field]]
    for (const val of vals) {
      if (val && matches(val) && !seen.has(dedupeKey(val))) {
        seen.add(dedupeKey(val))
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

// The recency phrase for an inline suggestion's meta line (handoff 20b). It
// reads as a caption of the row above it — «la última hace un mes» — so it
// keeps the days granularity longer than a bare figure would but folds the
// month into a word, the way the frame writes it («cada 3 semanas · la última
// hace un mes»). The singular months bucket mirrors formatFrequency's «cada
// mes» cutoff at 60 days; a caller uppercases it in CSS.
export function formatLastPurchase(days: number): string {
  if (days < 2) return 'la última hace un día'
  if (days < 14) return `la última hace ${Math.round(days)} días`
  if (days < 28) return `la última hace ${Math.round(days / 7)} semanas`
  if (days < 60) return 'la última hace un mes'
  return `la última hace ${Math.round(days / 30)} meses`
}
