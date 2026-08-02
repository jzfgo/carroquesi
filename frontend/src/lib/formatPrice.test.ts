import { formatRowAmount } from './formatPrice'

test('a row amount is bare — comma decimal, no symbol', () => {
  expect(formatRowAmount(8.15)).toBe('8,15')
  expect(formatRowAmount(1.9)).toBe('1,90')
})

test('a per-kg unit price keeps its /kg', () => {
  expect(formatRowAmount(2.5, 'KILOGRAM')).toBe('2,50/kg')
})
