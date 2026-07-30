import { describe, expect, it } from 'vitest'
import { madridDay, naiveUtcForMadridNoon } from './tripDay'

// Nothing here reads the machine clock, and nothing here depends on the zone
// the suite runs in. Both are the point: the rule is about one named zone, so
// a test that borrows the runner's would only ever prove where it ran.
describe('madridDay', () => {
  it('reads an afternoon instant as the day it is in Madrid', () => {
    expect(madridDay('2026-07-30T18:00:00')).toBe('2026-07-30')
  })

  it('is already tomorrow in Madrid while the stored day says today', () => {
    // 00:30 Madrid on the 30th of July, which is 22:30 UTC on the 29th. This
    // is the hour a torn-off trip gets written down in, so getting it wrong
    // would show the wrong day precisely when it matters.
    expect(madridDay('2026-07-29T22:30:00')).toBe('2026-07-30')
  })

  it('crosses at one hour ahead in winter, not two', () => {
    // Madrid is +1 in January. 23:30 UTC is 00:30 on the next day there, and
    // 22:30 UTC is still the same day — which a fixed +2 would get wrong.
    expect(madridDay('2026-01-14T23:30:00')).toBe('2026-01-15')
    expect(madridDay('2026-01-14T22:30:00')).toBe('2026-01-14')
  })

  it('crosses at two hours ahead in summer', () => {
    expect(madridDay('2026-07-29T21:30:00')).toBe('2026-07-29')
    expect(madridDay('2026-07-29T22:30:00')).toBe('2026-07-30')
  })

  it('has no day for a string that is not a moment', () => {
    expect(madridDay('')).toBe('')
    expect(madridDay('not a date')).toBe('')
  })
})

describe('naiveUtcForMadridNoon', () => {
  it('is 11:00 UTC in winter', () => {
    expect(naiveUtcForMadridNoon('2026-01-15')).toBe('2026-01-15T11:00:00')
  })

  it('is 10:00 UTC in summer', () => {
    expect(naiveUtcForMadridNoon('2026-07-29')).toBe('2026-07-29T10:00:00')
  })

  it('lands on the day it was asked for, on both days the clocks move', () => {
    // The two probes that would fail a wrong choice of instant: Madrid springs
    // forward on 29 March 2026 and falls back on 25 October 2026.
    expect(naiveUtcForMadridNoon('2026-03-29')).toBe('2026-03-29T10:00:00')
    expect(naiveUtcForMadridNoon('2026-10-25')).toBe('2026-10-25T11:00:00')
  })

  it('round-trips: the day it produces reads back as the day asked for', () => {
    for (const day of [
      '2026-01-01',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-06-15',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-12-31',
    ]) {
      expect(madridDay(naiveUtcForMadridNoon(day))).toBe(day)
    }
  })
})
