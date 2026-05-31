import { clientSideSuggestions, formatFrequency, formatRecency } from './suggestions'
import type { ListItem } from '../types'

const items: ListItem[] = [
  { id: '1', list_id: 'l1', name: 'Leche Entera', quantity: '2', brand: 'Hacendado', stores: ['Mercadona'], purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null, added_by: 'u1', created_at: '', updated_at: '' },
  { id: '2', list_id: 'l1', name: 'Yogur', quantity: null, brand: 'Danone', stores: ['Carrefour'], purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null, added_by: 'u1', created_at: '', updated_at: '' },
  { id: '3', list_id: 'l1', name: 'Queso', quantity: null, brand: 'Hacendado', stores: [], purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null, added_by: 'u1', created_at: '', updated_at: '' },
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

describe('formatFrequency', () => {
  test('< 2 days → cada día', () => expect(formatFrequency(1)).toBe('cada día'))
  test('2 days → cada 2 días', () => expect(formatFrequency(2)).toBe('cada 2 días'))
  test('6 days → cada 6 días', () => expect(formatFrequency(6)).toBe('cada 6 días'))
  test('7 days → cada semana', () => expect(formatFrequency(7)).toBe('cada semana'))
  test('13 days → cada semana', () => expect(formatFrequency(13)).toBe('cada semana'))
  test('14 days → cada 2 semanas', () => expect(formatFrequency(14)).toBe('cada 2 semanas'))
  test('21 days → cada 3 semanas', () => expect(formatFrequency(21)).toBe('cada 3 semanas'))
  test('28 days → cada mes', () => expect(formatFrequency(28)).toBe('cada mes'))
  test('59 days → cada mes', () => expect(formatFrequency(59)).toBe('cada mes'))
  test('60 days → cada 2 meses', () => expect(formatFrequency(60)).toBe('cada 2 meses'))
  test('90 days → cada 3 meses', () => expect(formatFrequency(90)).toBe('cada 3 meses'))
})

describe('formatRecency', () => {
  test('1 day → hace 1 día', () => expect(formatRecency(1)).toBe('hace 1 día'))
  test('3 days → hace 3 días', () => expect(formatRecency(3)).toBe('hace 3 días'))
  test('13 days → hace 13 días', () => expect(formatRecency(13)).toBe('hace 13 días'))
  test('14 days → hace 2 semanas', () => expect(formatRecency(14)).toBe('hace 2 semanas'))
  test('21 days → hace 3 semanas', () => expect(formatRecency(21)).toBe('hace 3 semanas'))
  test('60 days → hace 2 meses', () => expect(formatRecency(60)).toBe('hace 2 meses'))
})
