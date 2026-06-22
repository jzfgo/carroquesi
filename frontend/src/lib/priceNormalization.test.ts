import { describe, expect, it } from 'vitest'
import type { PriceEntry } from '../types'
import { normalizeEntries } from './priceNormalization'

function entry(
  overrides: Partial<PriceEntry> & { amount: number },
): PriceEntry {
  return {
    price_per: null,
    store: null,
    purchased_at: null,
    quantity: null,
    ...overrides,
  }
}

describe('normalizeEntries', () => {
  it('passes through unchanged when all entries are per-unit with no SI quantity', () => {
    const entries = [entry({ amount: 0.89 }), entry({ amount: 0.95 })]
    const result = normalizeEntries(entries)
    expect(result.isNormalized).toBe(false)
    expect(result.hasGaps).toBe(false)
    expect(result.entries[0].displayAmount).toBe(0.89)
    expect(result.entries[0].displayPricePer).toBeNull()
    expect(result.entries[0].originalAmount).toBe(0.89)
  })

  it('passes through unchanged when all entries are already per-kg (no conversion needed)', () => {
    const entries = [
      entry({ amount: 1.2, price_per: 'KILOGRAM' }),
      entry({ amount: 1.3, price_per: 'KILOGRAM' }),
    ]
    const result = normalizeEntries(entries)
    expect(result.isNormalized).toBe(false)
    expect(result.hasGaps).toBe(false)
    expect(result.entries[0].displayAmount).toBe(1.2)
    expect(result.entries[0].displayPricePer).toBe('KILOGRAM')
  })

  it('normalizes all-per-unit entries to €/kg when they have SI quantities', () => {
    const entries = [
      entry({ amount: 0.6, quantity: '500g' }),
      entry({ amount: 2.8, quantity: '1 kg' }),
    ]
    const result = normalizeEntries(entries)
    expect(result.isNormalized).toBe(true)
    expect(result.hasGaps).toBe(false)
    expect(result.entries[0].displayAmount).toBeCloseTo(1.2) // 0.60 / 0.5
    expect(result.entries[1].displayAmount).toBeCloseTo(2.8) // 2.80 / 1.0
    expect(result.entries[0].displayPricePer).toBe('KILOGRAM')
  })

  it('normalizes per-unit entry to €/kg when history mixes per-unit and per-kg', () => {
    const entries = [
      entry({ amount: 0.6, quantity: '500g' }), // per-unit, 500g pack
      entry({ amount: 1.2, price_per: 'KILOGRAM' }), // already €/kg
    ]
    const result = normalizeEntries(entries)
    expect(result.isNormalized).toBe(true)
    expect(result.hasGaps).toBe(false)
    expect(result.entries[0].displayAmount).toBeCloseTo(1.2)
    expect(result.entries[1].displayAmount).toBeCloseTo(1.2)
    expect(result.entries[0].displayPricePer).toBe('KILOGRAM')
  })

  it('yields displayAmount=null for a per-unit entry with no parseable SI quantity when normalization mode is active', () => {
    const entries = [
      entry({ amount: 0.6, quantity: null }), // can't normalize
      entry({ amount: 1.2, price_per: 'KILOGRAM' }), // triggers normalization mode
    ]
    const result = normalizeEntries(entries)
    expect(result.isNormalized).toBe(false) // no successful per-unit→€/kg conversion
    expect(result.hasGaps).toBe(true)
    expect(result.entries[0].displayAmount).toBeNull()
    expect(result.entries[1].displayAmount).toBe(1.2)
  })

  it('sets isNormalized=true only when a per-unit entry was actually converted', () => {
    // One convertible + one gap
    const entries = [
      entry({ amount: 0.6, quantity: '500g' }),
      entry({ amount: 0.8, quantity: null }),
      entry({ amount: 1.2, price_per: 'KILOGRAM' }),
    ]
    const result = normalizeEntries(entries)
    expect(result.isNormalized).toBe(true)
    expect(result.hasGaps).toBe(true)
  })

  it('preserves originalAmount and originalPricePer on each entry', () => {
    const entries = [entry({ amount: 0.6, quantity: '500g' })]
    const result = normalizeEntries(entries)
    expect(result.entries[0].originalAmount).toBe(0.6)
    expect(result.entries[0].originalPricePer).toBeNull()
  })

  it('handles comma decimal separator in quantity (e.g. "500,5g")', () => {
    const entries = [
      entry({ amount: 1.0, quantity: '500,5g' }),
      entry({ amount: 2.0, price_per: 'KILOGRAM' }),
    ]
    const result = normalizeEntries(entries)
    expect(result.entries[0].displayAmount).toBeCloseTo(1.0 / 0.5005)
  })

  it('returns entries in the same order as the input', () => {
    const entries = [
      entry({ amount: 1.0, purchased_at: '2026-01-01' }),
      entry({ amount: 2.0, purchased_at: '2026-02-01' }),
    ]
    const result = normalizeEntries(entries)
    expect(result.entries[0].purchased_at).toBe('2026-01-01')
    expect(result.entries[1].purchased_at).toBe('2026-02-01')
  })
})
