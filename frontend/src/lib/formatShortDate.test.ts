import { describe, expect, it } from 'vitest'
import { formatMonth, formatShortDate } from './formatShortDate'

// Playwright pins the browser's zone; nothing pins the one vitest runs in. So
// none of these name a day outright — each compares a bare stamp against the
// same instant written with its zone spelled out, which is the rule under test
// and holds wherever the suite runs.
describe('formatShortDate', () => {
  it('reads a stamp with no zone as UTC, not as local time', () => {
    // Late in the UTC evening: the hour where a bare parse changes the day for
    // every reader east of Greenwich, and the app stores instants exactly here.
    const naive = '2026-07-22T22:30:00'
    expect(formatShortDate(naive)).toBe(
      new Date(`${naive}Z`).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
      }),
    )
  })

  it('leaves a stamp that already names its zone alone', () => {
    // A second Z parses to nothing, so this is not a case to append blindly.
    expect(formatShortDate('2026-07-22T22:30:00Z')).toBe(
      formatShortDate('2026-07-22T22:30:00'),
    )
    expect(formatShortDate('2026-07-22T22:30:00Z')).not.toMatch(/invalid/i)
  })

  it('respects an explicit offset rather than overriding it', () => {
    // 00:30 on the 23rd in Madrid is 22:30 on the 22nd in UTC — the same
    // instant, and the one the stored stamp would hold.
    expect(formatShortDate('2026-07-23T00:30:00+02:00')).toBe(
      formatShortDate('2026-07-22T22:30:00'),
    )
  })

  // A day has no hour to misplace, so it needs no zone appending — and
  // "2026-07-22Z" is not a form the language reads at all.
  it('reads a date with no time on it', () => {
    expect(formatShortDate('2026-07-22')).toBe('22 jul')
  })

  it('says nothing rather than "Invalid Date" for a stamp it cannot read', () => {
    expect(formatShortDate('not a date')).toBe('—')
  })
})

describe('formatMonth', () => {
  it('reads a stamp with no zone as UTC', () => {
    // The last minutes of a month in UTC, where the bare parse names the next
    // one — which is how a trail comes to say it started in the wrong month.
    const naive = '2026-06-30T23:30:00'
    expect(formatMonth(naive)).toBe(
      new Date(`${naive}Z`).toLocaleDateString('es-ES', { month: 'long' }),
    )
  })
})
