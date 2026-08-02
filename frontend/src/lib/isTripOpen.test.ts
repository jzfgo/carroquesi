import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isTripOpen } from './isTripOpen'

// The instant under the clock is arbitrary but pinned, so the comparisons
// against the trip boundary are deterministic in every zone the suite runs
// in: both sides of the comparison are UTC instants, never calendar days.
const NOW = Date.UTC(2026, 6, 25, 10, 30, 0)

// The API serializes naive UTC, so fixtures shed the Z the same way the
// backend does.
function naiveUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, -1)
}

describe('isTripOpen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a trip whose end is still ahead is open', () => {
    expect(isTripOpen(naiveUtc(NOW + 60_000))).toBe(true)
  })

  it('a trip whose end has passed is closed, however recently', () => {
    expect(isTripOpen(naiveUtc(NOW - 60_000))).toBe(false)
  })

  it('the exact boundary instant is closed', () => {
    expect(isTripOpen(naiveUtc(NOW))).toBe(false)
  })

  it('an item without a trip is never blocked', () => {
    // An optimistic write has no trip yet; the server enforces the real
    // rule, so the mirror stays permissive.
    expect(isTripOpen(null)).toBe(true)
    expect(isTripOpen(undefined)).toBe(true)
  })

  it('parses a string that already carries a Z without doubling it', () => {
    expect(isTripOpen(new Date(NOW + 60_000).toISOString())).toBe(true)
    expect(isTripOpen(new Date(NOW - 60_000).toISOString())).toBe(false)
  })

  it('an unparseable instant is closed, not open', () => {
    expect(isTripOpen('not-a-date')).toBe(false)
  })
})
