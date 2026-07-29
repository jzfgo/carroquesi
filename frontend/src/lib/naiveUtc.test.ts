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
})
