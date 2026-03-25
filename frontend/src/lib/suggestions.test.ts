import { clientSideSuggestions } from './suggestions'
import type { ListItem } from '../types'

const items: ListItem[] = [
  { id: '1', list_id: 'l1', name: 'Leche', quantity: '2', variety: 'Entera', brand: 'Hacendado', store: 'Mercadona', purchased: false, added_by: 'u1', created_at: '', updated_at: '' },
  { id: '2', list_id: 'l1', name: 'Yogur', quantity: null, variety: 'Entera', brand: 'Danone', store: 'Carrefour', purchased: false, added_by: 'u1', created_at: '', updated_at: '' },
  { id: '3', list_id: 'l1', name: 'Queso', quantity: null, variety: null, brand: 'Hacendado', store: null, purchased: false, added_by: 'u1', created_at: '', updated_at: '' },
]

test('returns values matching the partial for a field', () => {
  expect(clientSideSuggestions(items, 'brand', 'Hac')).toEqual(['Hacendado'])
})

test('is case-insensitive', () => {
  expect(clientSideSuggestions(items, 'brand', 'hac')).toEqual(['Hacendado'])
})

test('deduplicates values', () => {
  // Entera appears twice (variety of Leche and Yogur)
  expect(clientSideSuggestions(items, 'variety', '')).toEqual(['Entera'])
})

test('returns empty array when no matches', () => {
  expect(clientSideSuggestions(items, 'store', 'xyz')).toEqual([])
})

test('limits results to 5', () => {
  const many: ListItem[] = Array.from({ length: 8 }, (_, i) => ({
    ...items[0], id: String(i), brand: `Brand${i}`,
  }))
  expect(clientSideSuggestions(many, 'brand', 'B')).toHaveLength(5)
})

test('skips null values', () => {
  // store is null for Queso
  const result = clientSideSuggestions(items, 'store', '')
  expect(result).not.toContain(null)
})
