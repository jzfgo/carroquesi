import { describe, expect, it } from 'vitest'
import { parseServerInstant } from './serverInstant'

const INSTANT = Date.UTC(2026, 10, 4, 10, 0, 0)

describe('parseServerInstant', () => {
  it('reads a value with no offset as UTC', () => {
    expect(parseServerInstant('2026-11-04T10:00:00').getTime()).toBe(INSTANT)
  })

  it('reads a Z suffix as UTC', () => {
    expect(parseServerInstant('2026-11-04T10:00:00Z').getTime()).toBe(INSTANT)
  })

  it('honours an explicit offset', () => {
    expect(parseServerInstant('2026-11-04T11:00:00+01:00').getTime()).toBe(
      INSTANT,
    )
    expect(parseServerInstant('2026-11-04T05:00:00-05:00').getTime()).toBe(
      INSTANT,
    )
  })

  it('keeps fractional seconds', () => {
    expect(parseServerInstant('2026-11-04T10:00:00.250000').getTime()).toBe(
      INSTANT + 250,
    )
    expect(parseServerInstant('2026-11-04T10:00:00.250Z').getTime()).toBe(
      INSTANT + 250,
    )
  })
})
