import { toLocalInstant } from './receiptDate'

/**
 * These run in whatever zone the machine is set to — CEST locally, UTC in CI —
 * so every assertion has to hold in both. The offset assertions are the ones
 * that discriminate: in UTC a local instant and a UTC instant name the same
 * wall-clock time and no test could tell them apart, but `toISOString()` ends
 * in 'Z' where this ends in '+00:00'. That difference survives the zone.
 */
describe('toLocalInstant', () => {
  const smallHours = new Date(2026, 6, 25, 0, 30, 0, 0)

  test("writes the viewer's own day, whatever UTC would call it", () => {
    expect(toLocalInstant(smallHours).slice(0, 10)).toBe('2026-07-25')
  })

  test('writes the wall-clock time, not the UTC one', () => {
    expect(toLocalInstant(smallHours).slice(11, 19)).toBe('00:30:00')
  })

  test('states the offset rather than folding it away', () => {
    // The whole point: a 'Z' string has already lost the day it was written
    // on, and the backend has no timezone to recover it from.
    expect(toLocalInstant(smallHours)).toMatch(/[+-]\d{2}:\d{2}$/)
  })

  test('still names the same instant it was given', () => {
    expect(new Date(toLocalInstant(smallHours)).getTime()).toBe(
      smallHours.getTime(),
    )
  })
})
