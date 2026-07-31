import { describe, expect, it } from 'vitest'
import { formatPrice } from './formatPrice'

// These read as trivial, but the format is a house rule and no locale produces
// it: es-ES puts the symbol last, en-US uses a dot. Before this guard existed
// the app took the machine's locale and printed "€5.34" everywhere.
describe('formatPrice', () => {
  it('puts the symbol first and uses a comma decimal', () => {
    expect(formatPrice(5.34)).toBe('€ 5,34')
  })

  it('always shows two decimals', () => {
    expect(formatPrice(5)).toBe('€ 5,00')
    expect(formatPrice(0.9)).toBe('€ 0,90')
  })

  it('groups thousands the Spanish way — a dot, and not at four digits', () => {
    expect(formatPrice(1234.5)).toBe('€ 1234,50')
    expect(formatPrice(12345.5)).toBe('€ 12.345,50')
  })

  it('appends the unit only for a per-kilo price', () => {
    expect(formatPrice(5.34, 'KILOGRAM')).toBe('€ 5,34/kg')
    expect(formatPrice(5.34, null)).toBe('€ 5,34')
  })
})
