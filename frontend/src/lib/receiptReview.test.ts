import { describe, expect, test } from 'vitest'
import type { UnmatchedLine } from '../types'
import {
  effectiveLineTotal,
  effectivePricePer,
  effectiveQuantity,
  effectiveQuantityDisplay,
  effectiveUnitPrice,
  isDiscountLine,
  type LineState,
  sameQuantityText,
  unitPriceToTotal,
} from './receiptReview'

const line = (over: Partial<UnmatchedLine> = {}): UnmatchedLine => ({
  receipt_name: 'BEBIDA DE COCO',
  price_type: 'UNIT',
  unit_price: 4.58,
  quantity: null,
  line_total: 4.58,
  ...over,
})

const state = (over: Partial<LineState> = {}): LineState => ({
  included: true,
  resolution: { kind: 'unassigned' },
  ...over,
})

test('without a correction the effective figures are the read ones', () => {
  const l = line({
    price_type: 'MULTI',
    quantity: 2,
    unit_price: 2.29,
    line_total: 4.58,
  })
  expect(effectiveLineTotal(l, state())).toBe(4.58)
  // The as-read unit price is the parse's own, never re-derived.
  expect(effectiveUnitPrice(l, state())).toBe(2.29)
})

test('a corrected total drives both figures on a UNIT line', () => {
  const s = state({ lineTotal: 3.38 })
  expect(effectiveLineTotal(line(), s)).toBe(3.38)
  expect(effectiveUnitPrice(line(), s)).toBe(3.38)
})

test('a corrected MULTI total re-derives the unit price from the quantity', () => {
  const l = line({
    price_type: 'MULTI',
    quantity: 2,
    unit_price: 2.29,
    line_total: 4.58,
  })
  const s = state({ lineTotal: 3.38 })
  expect(effectiveUnitPrice(l, s)).toBeCloseTo(1.69)
})

test('a corrected KILOGRAM total re-derives the per-kilo price from the weight', () => {
  const l = line({
    price_type: 'KILOGRAM',
    quantity: 0.5,
    unit_price: 9,
    line_total: 4.5,
  })
  const s = state({ lineTotal: 4 })
  expect(effectiveUnitPrice(l, s)).toBeCloseTo(8)
})

test('a missing or zero quantity falls back to the corrected total itself', () => {
  const s = state({ lineTotal: 3 })
  expect(
    effectiveUnitPrice(line({ price_type: 'MULTI', quantity: null }), s),
  ).toBe(3)
  expect(
    effectiveUnitPrice(line({ price_type: 'MULTI', quantity: 0 }), s),
  ).toBe(3)
})

test('missing state reads as no correction', () => {
  expect(effectiveLineTotal(line())).toBe(4.58)
  expect(effectiveUnitPrice(line())).toBe(4.58)
})

test('a negative amount marks a discount line; a normal one does not', () => {
  expect(isDiscountLine(line({ line_total: -1.2, unit_price: -1.2 }))).toBe(
    true,
  )
  expect(isDiscountLine(line({ line_total: -1.2, unit_price: 1.2 }))).toBe(true)
  expect(isDiscountLine(line())).toBe(false)
  expect(isDiscountLine(line({ line_total: 0, unit_price: 0 }))).toBe(false)
})

describe('quantity override', () => {
  const weighed = line({
    price_type: 'KILOGRAM',
    quantity: 0.202,
    unit_price: 9.9,
    line_total: 2,
  })
  const unit = line({ unit_price: 3.05, line_total: 3.05 })

  test('a typed unit price wins over the derived one', () => {
    const state = {
      included: true,
      resolution: { kind: 'unassigned' as const },
      quantity: '0,346 kg',
      lineTotal: 3.04,
      unitPrice: 8.8,
    }
    expect(effectiveUnitPrice(unit, state)).toBe(8.8)
  })

  test('effectiveQuantity falls back to the line', () => {
    expect(effectiveQuantity(weighed)).toBe('202g')
  })

  test('sameQuantityText compares by factor and unit', () => {
    expect(sameQuantityText('202 g', '202g')).toBe(true)
    expect(sameQuantityText('0,202 kg', '202g')).toBe(true)
    expect(sameQuantityText('1', '1')).toBe(true)
    expect(sameQuantityText('2', '1')).toBe(false)
    expect(sameQuantityText('1', '1 kg')).toBe(false)
  })

  test('effectivePricePer follows the override', () => {
    expect(effectivePricePer(unit, state({ quantity: '346 g' }))).toBe(
      'KILOGRAM',
    )
    expect(effectivePricePer(unit, state())).toBeNull()
  })

  test('quantity change keeps the total', () => {
    const s = state({ quantity: '0,346 kg' })
    expect(effectiveLineTotal(unit, s)).toBe(3.05)
    expect(effectiveUnitPrice(unit, s)).toBeCloseTo(8.815, 3)
  })

  test('unitPriceToTotal rounds to cents', () => {
    expect(unitPriceToTotal(8.82, '0,346 kg')).toBe(3.05)
    expect(unitPriceToTotal(3.5, '1')).toBe(3.5)
    expect(unitPriceToTotal(2, 'abc kg')).toBe(2)
    expect(unitPriceToTotal(2, '')).toBe(2)
  })

  test('effectiveQuantityDisplay shows the override trimmed', () => {
    expect(effectiveQuantityDisplay(weighed)).toBe('202 g')
    expect(
      effectiveQuantityDisplay(weighed, state({ quantity: '  346 g ' })),
    ).toBe('346 g')
  })
})
