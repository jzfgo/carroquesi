import { formatRowAmount } from './formatPrice'

test('a row amount is bare — comma decimal, no symbol', () => {
  expect(formatRowAmount(8.15)).toBe('8,15')
  expect(formatRowAmount(1.9)).toBe('1,90')
  expect(formatRowAmount(5.34)).toBe('5,34')
})
