import { parseQuantityFactor, computeCostSummary, purchasedDateLabel } from './itemCost'
import type { ListItem } from '../types'

// ---------------------------------------------------------------------------
// parseQuantityFactor
// ---------------------------------------------------------------------------

describe('parseQuantityFactor — price_per = KILOGRAM', () => {
  test('null quantity → null', () => expect(parseQuantityFactor(null, 'KILOGRAM')).toBeNull())
  test('plain number without unit → null', () => expect(parseQuantityFactor('3', 'KILOGRAM')).toBeNull())
  test('unrecognised unit → null', () => expect(parseQuantityFactor('2 bolsas', 'KILOGRAM')).toBeNull())

  test('grams', () => expect(parseQuantityFactor('500g', 'KILOGRAM')).toBeCloseTo(0.5))
  test('grams with dot abbreviation', () => expect(parseQuantityFactor('500g.', 'KILOGRAM')).toBeCloseTo(0.5))
  test('grams with space', () => expect(parseQuantityFactor('500 g', 'KILOGRAM')).toBeCloseTo(0.5))
  test('kilograms', () => expect(parseQuantityFactor('2kg', 'KILOGRAM')).toBeCloseTo(2))
  test('kilograms with dot and comma decimal', () => expect(parseQuantityFactor('1,5 kg.', 'KILOGRAM')).toBeCloseTo(1.5))

  test('millilitres', () => expect(parseQuantityFactor('750ml', 'KILOGRAM')).toBeCloseTo(0.75))
  test('centilitres', () => expect(parseQuantityFactor('33cl', 'KILOGRAM')).toBeCloseTo(0.33))
  test('decilitres', () => expect(parseQuantityFactor('2dl', 'KILOGRAM')).toBeCloseTo(0.2))
  test('litres', () => expect(parseQuantityFactor('1,5l', 'KILOGRAM')).toBeCloseTo(1.5))
  test('litres uppercase', () => expect(parseQuantityFactor('1L', 'KILOGRAM')).toBeCloseTo(1))
})

describe('parseQuantityFactor — price_per = null', () => {
  test('null quantity → 1', () => expect(parseQuantityFactor(null, null)).toBe(1))
  test('plain integer → numeric count', () => expect(parseQuantityFactor('3', null)).toBe(3))
  test('decimal with dot → numeric count', () => expect(parseQuantityFactor('2.5', null)).toBeCloseTo(2.5))
  test('decimal with comma → numeric count', () => expect(parseQuantityFactor('2,5', null)).toBeCloseTo(2.5))
  test('number + unrecognised text → numeric count', () => expect(parseQuantityFactor('3 bolsas', null)).toBe(3))
  test('number + SI unit → pack descriptor (×1)', () => expect(parseQuantityFactor('500g', null)).toBe(1))
  test('number + kg → pack descriptor (×1)', () => expect(parseQuantityFactor('2 kg', null)).toBe(1))
  test('number + litre → pack descriptor (×1)', () => expect(parseQuantityFactor('1,5l', null)).toBe(1))
  test('non-numeric text → 1', () => expect(parseQuantityFactor('una bolsa', null)).toBe(1))
})

// ---------------------------------------------------------------------------
// computeCostSummary
// ---------------------------------------------------------------------------

const makeItem = (overrides: Partial<ListItem> = {}): ListItem => ({
  id: '1', list_id: 'l1', name: 'item', quantity: null,
  brand: null, stores: [], purchased: false, purchased_at: null, ean: null,
  price: null, price_per: null, price_store: null,
  added_by: 'u1', created_at: '', updated_at: '',
  ...overrides,
})

describe('computeCostSummary', () => {
  test('empty array → null', () => expect(computeCostSummary([])).toBeNull())

  test('all items without price → null', () => {
    expect(computeCostSummary([makeItem(), makeItem()])).toBeNull()
  })

  test('all per-kg items without unit quantity → null', () => {
    const items = [makeItem({ price: 2, price_per: 'KILOGRAM', quantity: '3' })]
    expect(computeCostSummary(items)).toBeNull()
  })

  test('single priced item, no quantity → total = price, partial = false', () => {
    const result = computeCostSummary([makeItem({ price: 1.5 })])
    expect(result).toEqual({ total: 1.5, partial: false })
  })

  test('quantity multiplier applied for non-per-unit item', () => {
    const result = computeCostSummary([makeItem({ price: 2, quantity: '3' })])
    expect(result?.total).toBeCloseTo(6)
    expect(result?.partial).toBe(false)
  })

  test('per-kg item with gram quantity contributes', () => {
    const result = computeCostSummary([makeItem({ price: 10, price_per: 'KILOGRAM', quantity: '500g' })])
    expect(result?.total).toBeCloseTo(5)
    expect(result?.partial).toBe(false)
  })

  test('mixed: some priced, some not → partial = true', () => {
    const items = [makeItem({ price: 2 }), makeItem()]
    const result = computeCostSummary(items)
    expect(result?.total).toBeCloseTo(2)
    expect(result?.partial).toBe(true)
  })

  test('mixed: per-kg with unit + per-kg without unit → partial = true', () => {
    const items = [
      makeItem({ price: 10, price_per: 'KILOGRAM', quantity: '1kg' }),
      makeItem({ price: 10, price_per: 'KILOGRAM', quantity: '3' }), // no unit
    ]
    const result = computeCostSummary(items)
    expect(result?.total).toBeCloseTo(10)
    expect(result?.partial).toBe(true)
  })

  test('total zero even with prices → null (nothing to render)', () => {
    // Contrived: price=0
    expect(computeCostSummary([makeItem({ price: 0 })])).toBeNull()
  })

  test('all items contribute → partial = false', () => {
    const items = [makeItem({ price: 1 }), makeItem({ price: 2, quantity: '2' })]
    const result = computeCostSummary(items)
    expect(result?.total).toBeCloseTo(5)
    expect(result?.partial).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// purchasedDateLabel
// ---------------------------------------------------------------------------

describe('purchasedDateLabel', () => {
  test('null → Fecha desconocida', () => {
    expect(purchasedDateLabel(null)).toBe('Fecha desconocida')
  })

  test('ISO string → localised es date', () => {
    // 2024-03-15 UTC → "15 mar 2024" in es locale
    const label = purchasedDateLabel('2024-03-15T10:00:00')
    expect(label).toMatch(/2024/)
  })
})
