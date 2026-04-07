import { clientSideSuggestions } from './suggestions'
import type { ListItem } from '../types'

const items: ListItem[] = [
  { id: '1', list_id: 'l1', name: 'Leche Entera', quantity: '2', brand: 'Hacendado', stores: ['Mercadona'], purchased: false, purchased_at: null, ean: null, added_by: 'u1', created_at: '', updated_at: '' },
  { id: '2', list_id: 'l1', name: 'Yogur', quantity: null, brand: 'Danone', stores: ['Carrefour'], purchased: false, purchased_at: null, ean: null, added_by: 'u1', created_at: '', updated_at: '' },
  { id: '3', list_id: 'l1', name: 'Queso', quantity: null, brand: 'Hacendado', stores: [], purchased: false, purchased_at: null, ean: null, added_by: 'u1', created_at: '', updated_at: '' },
]

test('returns values matching the partial for a field', () => {
  expect(clientSideSuggestions(items, 'brand', 'Hac')).toEqual(['Hacendado'])
})

test('is case-insensitive', () => {
  expect(clientSideSuggestions(items, 'brand', 'hac')).toEqual(['Hacendado'])
})

test('deduplicates values', () => {
  // Hacendado appears twice (Leche Entera and Queso)
  expect(clientSideSuggestions(items, 'brand', '')).toEqual(['Hacendado', 'Danone'])
})

test('returns empty array when no matches', () => {
  expect(clientSideSuggestions(items, 'stores', 'xyz')).toEqual([])
})

test('limits results to 5', () => {
  const many: ListItem[] = Array.from({ length: 8 }, (_, i) => ({
    ...items[0], id: String(i), brand: `Brand${i}`,
  }))
  expect(clientSideSuggestions(many, 'brand', 'B')).toHaveLength(5)
})

test('skips null values', () => {
  // store is null for Queso
  const result = clientSideSuggestions(items, 'stores', '')
  expect(result).not.toContain(null)
})
