import { describe, expect, it } from 'vitest'

import { toReceiptInstant } from './receiptAi'

describe('toReceiptInstant', () => {
  it('returns null without a date', () => {
    expect(toReceiptInstant(null, '17:42')).toBeNull()
    expect(toReceiptInstant(null, null)).toBeNull()
  })

  it('combines date and time as local wall-clock', () => {
    const iso = toReceiptInstant('2026-07-12', '17:42')
    const parsed = new Date(iso as string)
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(6)
    expect(parsed.getDate()).toBe(12)
    expect(parsed.getHours()).toBe(17)
    expect(parsed.getMinutes()).toBe(42)
  })

  it('uses local midnight when no time was extracted', () => {
    const parsed = new Date(toReceiptInstant('2026-07-12', null) as string)
    expect(parsed.getDate()).toBe(12)
    expect(parsed.getHours()).toBe(0)
  })

  it('round-trips a late-evening receipt to the same local date', () => {
    const parsed = new Date(toReceiptInstant('2026-07-12', '23:30') as string)
    expect(parsed.getDate()).toBe(12)
    expect(parsed.getHours()).toBe(23)
  })

  it('emits a UTC instant, not a naive local string', () => {
    expect(toReceiptInstant('2026-07-12', '17:42')).toMatch(/Z$/)
  })

  it('ignores a malformed time rather than throwing', () => {
    const parsed = new Date(toReceiptInstant('2026-07-12', '99:99') as string)
    expect(parsed.getDate()).toBe(12)
    expect(parsed.getHours()).toBe(0)
  })

  it('rejects an out-of-range day rather than rolling into the next month', () => {
    expect(toReceiptInstant('2026-01-32', null)).toBeNull()
  })

  it('rejects an out-of-range month rather than rolling into the next year', () => {
    expect(toReceiptInstant('2026-13-01', null)).toBeNull()
  })

  it('returns null instead of throwing on an absurd year', () => {
    expect(() => toReceiptInstant('999999-01-01', null)).not.toThrow()
    expect(toReceiptInstant('999999-01-01', null)).toBeNull()
  })

  it('still accepts a real leap day', () => {
    expect(toReceiptInstant('2028-02-29', null)).not.toBeNull()
  })

  it('passes a future date through for the server to judge', () => {
    // A misread year like 2062 is repaired server-side; dropping it here
    // would throw away the day and month the repair keeps.
    expect(toReceiptInstant('2062-10-30', null)).not.toBeNull()
  })

  it('accepts boundary hours and minutes 00:00 and 23:59', () => {
    const start = new Date(toReceiptInstant('2026-07-12', '00:00') as string)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)

    const end = new Date(toReceiptInstant('2026-07-12', '23:59') as string)
    expect(end.getHours()).toBe(23)
    expect(end.getMinutes()).toBe(59)
  })

  it('degrades negative or non-integer time components to 00:00', () => {
    const neg = new Date(toReceiptInstant('2026-07-12', '-1:-5') as string)
    expect(neg.getHours()).toBe(0)
    expect(neg.getMinutes()).toBe(0)

    const frac = new Date(toReceiptInstant('2026-07-12', '12.5:30.5') as string)
    expect(frac.getHours()).toBe(0)
    expect(frac.getMinutes()).toBe(0)
  })

  it('rejects non-leap Feb 29, month 0, year 0, and non-numeric dates', () => {
    expect(toReceiptInstant('2026-02-29', null)).toBeNull()
    expect(toReceiptInstant('2026-00-01', null)).toBeNull()
    expect(toReceiptInstant('0000-01-01', null)).toBeNull()
    expect(toReceiptInstant('not-a-date', null)).toBeNull()
  })
})
