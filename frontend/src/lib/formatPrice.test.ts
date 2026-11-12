import {
  formatAmount,
  formatFigure,
  formatUnitPrice,
  parseAmount,
  unitPriceSuffix,
} from './formatPrice'

const NBSP = ' '

test('a figure is bare — comma decimal, no symbol', () => {
  expect(formatFigure(8.15)).toBe('8,15')
  expect(formatFigure(1.9)).toBe('1,90')
  expect(formatFigure(5.34)).toBe('5,34')
})

test('a four-figure amount groups its thousands, as a receipt does', () => {
  expect(formatFigure(1234.5)).toBe('1.234,50')
  expect(formatAmount(12345.6)).toBe(`12.345,60${NBSP}€`)
})

test('a grouped figure parses back whole', () => {
  expect(parseAmount('1.234,50')).toBe(1234.5)
  expect(parseAmount('8,15')).toBe(8.15)
  expect(parseAmount('8.15')).toBe(8.15)
})

test('an amount puts the euro sign after the figure, joined by a no-break space', () => {
  expect(formatAmount(3.05)).toBe(`3,05${NBSP}€`)
  expect(formatAmount(0)).toBe(`0,00${NBSP}€`)
})

test('a unit price carries the sign and the unit symbol', () => {
  expect(formatUnitPrice(8.82, 'KILOGRAM')).toBe(`8,82${NBSP}€/kg`)
  expect(formatUnitPrice(0.89, null)).toBe(`0,89${NBSP}€/ud`)
  expect(formatUnitPrice(0.89, undefined, true)).toBe(`0,89${NBSP}€/UD`)
  expect(formatUnitPrice(8.82, 'KILOGRAM', true)).toBe(`8,82${NBSP}€/KG`)
})

test('the suffix alone names the unit', () => {
  expect(unitPriceSuffix('KILOGRAM')).toBe('€/kg')
  expect(unitPriceSuffix(null, true)).toBe('€/UD')
})
