import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isSameCalendarDay } from './isSameCalendarDay'

// Fixtures are built from local components on purpose: these assertions are
// about the viewer's calendar, so they must hold in whatever zone the suite
// runs. The instant under the clock is just past local midnight — the hour
// where a UTC reduction and the viewer's calendar disagree in every zone
// east of Greenwich. In a zone at UTC exactly, local and UTC days coincide
// and no behavioural test can tell the two reductions apart; the backend's
// client-day unit tests pin both signs of that mismatch explicitly.
const NOW = new Date(2026, 6, 25, 0, 30, 0)

// The API serializes naive UTC, so the fixture sheds the Z the same way the
// backend does.
function naiveUtc(local: Date): string {
  return local.toISOString().slice(0, -1)
}

describe('isSameCalendarDay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('a purchase earlier the same local day is today', () => {
    expect(isSameCalendarDay(naiveUtc(new Date(2026, 6, 25, 0, 10)))).toBe(true)
  })

  it('a purchase later the same local day is today', () => {
    expect(isSameCalendarDay(naiveUtc(new Date(2026, 6, 25, 22, 0)))).toBe(
      true,
    )
  })

  it('a purchase before local midnight is not today, however near', () => {
    expect(isSameCalendarDay(naiveUtc(new Date(2026, 6, 24, 23, 50)))).toBe(
      false,
    )
  })

  it('an unpurchased item is never blocked', () => {
    expect(isSameCalendarDay(null)).toBe(true)
  })
})
