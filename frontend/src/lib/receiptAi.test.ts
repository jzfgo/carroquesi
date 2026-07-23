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
})
