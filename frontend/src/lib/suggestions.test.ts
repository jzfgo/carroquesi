import type { ListItem } from '../types'
import {
  clientSideSuggestions,
  formatFrequency,
  formatLastPurchase,
  formatRecency,
} from './suggestions'

const items: ListItem[] = [
  {
    id: '1',
    list_id: 'l1',
    name: 'Leche Entera',
    quantity: '2',
    purchased_quantity: null,
    brand: 'Hacendado',
    stores: ['Mercadona'],
    purchased: false,
    purchased_at: null,
    purchase_has_receipt: false,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: '',
    updated_at: '',
  },
  {
    id: '2',
    list_id: 'l1',
    name: 'Yogur',
    quantity: null,
    purchased_quantity: null,
    brand: 'Danone',
    stores: ['Carrefour'],
    purchased: false,
    purchased_at: null,
    purchase_has_receipt: false,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: '',
    updated_at: '',
  },
  {
    id: '3',
    list_id: 'l1',
    name: 'Queso',
    quantity: null,
    purchased_quantity: null,
    brand: 'Hacendado',
    stores: [],
    purchased: false,
    purchased_at: null,
    purchase_has_receipt: false,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: '',
    updated_at: '',
  },
]

test('returns values matching the partial for a field', () => {
  expect(clientSideSuggestions(items, 'brand', 'Hac')).toEqual(['Hacendado'])
})

test('is case-insensitive', () => {
  expect(clientSideSuggestions(items, 'brand', 'hac')).toEqual(['Hacendado'])
})

test('deduplicates values', () => {
  // Hacendado appears twice (Leche Entera and Queso)
  expect(clientSideSuggestions(items, 'brand', '')).toEqual([
    'Hacendado',
    'Danone',
  ])
})

test('returns empty array when no matches', () => {
  expect(clientSideSuggestions(items, 'stores', 'xyz')).toEqual([])
})

test('limits results to 5', () => {
  const many: ListItem[] = Array.from({ length: 8 }, (_, i) => ({
    ...items[0],
    id: String(i),
    brand: `Brand${i}`,
  }))
  expect(clientSideSuggestions(many, 'brand', 'B')).toHaveLength(5)
})

test('skips null values', () => {
  // store is null for Queso
  const result = clientSideSuggestions(items, 'stores', '')
  expect(result).not.toContain(null)
})

test('stores: matches across spacing and accents by key', () => {
  const variants: ListItem[] = [
    { ...items[0], id: 'v1', stores: ['Ahorra Más'] },
  ]
  // The space in the stored value breaks a plain startsWith.
  expect(clientSideSuggestions(variants, 'stores', 'ahorram')).toEqual([
    'Ahorra Más',
  ])
})

test('stores: dedupes spelling variants, first typed form wins', () => {
  const variants: ListItem[] = [
    { ...items[0], id: 'v1', stores: ['Ahorramás'] },
    { ...items[0], id: 'v2', stores: ['AHORRA MAS'] },
    { ...items[0], id: 'v3', stores: ['Lidl'] },
  ]
  expect(clientSideSuggestions(variants, 'stores', '')).toEqual([
    'Ahorramás',
    'Lidl',
  ])
})

test('brands: keep plain lowercase matching, no accent folding', () => {
  const branded: ListItem[] = [{ ...items[0], id: 'b1', brand: 'Días' }]
  expect(clientSideSuggestions(branded, 'brand', 'dia')).toEqual([])
  expect(clientSideSuggestions(branded, 'brand', 'día')).toEqual(['Días'])
})

describe('formatFrequency', () => {
  test('< 2 days → cada día', () => expect(formatFrequency(1)).toBe('cada día'))
  test('2 days → cada 2 días', () =>
    expect(formatFrequency(2)).toBe('cada 2 días'))
  test('6 days → cada 6 días', () =>
    expect(formatFrequency(6)).toBe('cada 6 días'))
  test('7 days → cada semana', () =>
    expect(formatFrequency(7)).toBe('cada semana'))
  test('13 days → cada semana', () =>
    expect(formatFrequency(13)).toBe('cada semana'))
  test('14 days → cada 2 semanas', () =>
    expect(formatFrequency(14)).toBe('cada 2 semanas'))
  test('21 days → cada 3 semanas', () =>
    expect(formatFrequency(21)).toBe('cada 3 semanas'))
  test('28 days → cada mes', () => expect(formatFrequency(28)).toBe('cada mes'))
  test('59 days → cada mes', () => expect(formatFrequency(59)).toBe('cada mes'))
  test('60 days → cada 2 meses', () =>
    expect(formatFrequency(60)).toBe('cada 2 meses'))
  test('90 days → cada 3 meses', () =>
    expect(formatFrequency(90)).toBe('cada 3 meses'))
})

describe('formatRecency', () => {
  test('1 day → hace 1 día', () => expect(formatRecency(1)).toBe('hace 1 día'))
  test('3 days → hace 3 días', () =>
    expect(formatRecency(3)).toBe('hace 3 días'))
  test('13 days → hace 13 días', () =>
    expect(formatRecency(13)).toBe('hace 13 días'))
  test('14 days → hace 2 semanas', () =>
    expect(formatRecency(14)).toBe('hace 2 semanas'))
  test('21 days → hace 3 semanas', () =>
    expect(formatRecency(21)).toBe('hace 3 semanas'))
  test('60 days → hace 2 meses', () =>
    expect(formatRecency(60)).toBe('hace 2 meses'))
})

// The suggestion meta line's recency phrase (20b) — singular words for the
// day/month buckets, plural numerals in between, matching the frame verbatim
// («LA ÚLTIMA HACE 9 DÍAS» / «LA ÚLTIMA HACE UN MES»).
describe('formatLastPurchase', () => {
  test('1 day → la última hace un día', () =>
    expect(formatLastPurchase(1)).toBe('la última hace un día'))
  test('9 days → la última hace 9 días (the frame example)', () =>
    expect(formatLastPurchase(9)).toBe('la última hace 9 días'))
  test('13 days → la última hace 13 días', () =>
    expect(formatLastPurchase(13)).toBe('la última hace 13 días'))
  test('14 days → la última hace 2 semanas', () =>
    expect(formatLastPurchase(14)).toBe('la última hace 2 semanas'))
  test('21 days → la última hace 3 semanas', () =>
    expect(formatLastPurchase(21)).toBe('la última hace 3 semanas'))
  test('28 days → la última hace un mes', () =>
    expect(formatLastPurchase(28)).toBe('la última hace un mes'))
  test('59 days → la última hace un mes (the frame example)', () =>
    expect(formatLastPurchase(59)).toBe('la última hace un mes'))
  test('60 days → la última hace 2 meses', () =>
    expect(formatLastPurchase(60)).toBe('la última hace 2 meses'))
  test('90 days → la última hace 3 meses', () =>
    expect(formatLastPurchase(90)).toBe('la última hace 3 meses'))
})
