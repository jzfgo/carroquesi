import { describe, expect, it } from 'vitest'
import { parseNaiveUtc } from './naiveUtc'

describe('parseNaiveUtc', () => {
  it('parses a naive-UTC timestamp as UTC, not local time', () => {
    expect(parseNaiveUtc('2026-07-28T22:00:00')).toBe(
      new Date('2026-07-28T22:00:00Z').getTime(),
    )
  })

  it('returns null, not NaN, for an unparseable value', () => {
    expect(parseNaiveUtc('not-a-date')).toBeNull()
  })

  // The three consumers that read a trip boundary through this — itemState,
  // useTearOff and madridDay — all treat null as "unknown" and degrade. So the
  // shapes below are pinned here, where the rule lives, rather than only
  // through the display helper that happened to widen it.
  it('leaves a stamp that already names its zone alone', () => {
    // Appending a second Z parses to nothing, so this used to come back null.
    expect(parseNaiveUtc('2026-07-22T22:30:00Z')).toBe(
      Date.parse('2026-07-22T22:30:00Z'),
    )
    expect(parseNaiveUtc('2026-07-23T00:30:00+02:00')).toBe(
      Date.parse('2026-07-22T22:30:00Z'),
    )
  })

  it('reads a bare calendar day as UTC, without appending to it', () => {
    // The language already reads a date-only form as UTC, and "2026-07-22Z"
    // is not a form it reads at all.
    expect(parseNaiveUtc('2026-07-22')).toBe(Date.parse('2026-07-22T00:00:00Z'))
  })

  // The shape the rule exists for. A space where the T should be is what
  // Python's str(datetime) gives you as against .isoformat(), and the engine
  // reads that one as *local*. A predicate of "has no T" would let it past,
  // and it would come back a plausible wrong instant rather than nothing — on
  // the rule that decides whether an item is still in the cart.
  it('reads a space-separated stamp as UTC, not as local time', () => {
    expect(parseNaiveUtc('2026-07-22 22:30:00')).toBe(
      Date.parse('2026-07-22T22:30:00Z'),
    )
  })
})
