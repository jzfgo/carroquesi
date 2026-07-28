import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListItem } from '../types'
import { isInCart, itemState } from './itemState'

const item = (purchased_at: string | null): ListItem =>
  ({ purchased_at, purchased: purchased_at !== null }) as ListItem

afterEach(() => {
  vi.useRealTimers()
})

describe('the three states', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('an unmarked item is pending', () => {
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
    expect(itemState(item(null))).toBe('pending')
  })

  it('purchased with no date is bought, not pending', () => {
    // Cannot happen — the backend derives one from the other — but calling a
    // bought item "still to buy" is the worse way to be wrong.
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
    expect(itemState({ purchased_at: null, purchased: true } as ListItem)).toBe(
      'bought',
    )
  })

  it('marked today is in the cart, not bought', () => {
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
    expect(itemState(item('2026-07-28T09:30:00'))).toBe('cart')
  })

  it('marked on an earlier day has been torn off and is bought', () => {
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
    expect(itemState(item('2026-07-27T21:00:00'))).toBe('bought')
  })

  it('an unparseable timestamp is not silently called today', () => {
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
    expect(itemState(item('not-a-date'))).toBe('bought')
  })
})

describe('the boundary is local midnight, not UTC midnight', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  /** The naive UTC timestamp the backend sends for a given instant. */
  const asBackendSends = (at: Date) => at.toISOString().slice(0, 19)

  it('a late-evening shop is settled once local midnight has passed', () => {
    // Built from local time so the test means the same thing in every zone.
    // "Now" is 01:00 local; the shop happened at 23:00 local the day before.
    // Two different local days, so two different trips — and in any zone east
    // of UTC those two instants share a UTC date, which is exactly the case a
    // date-string comparison gets wrong.
    const now = new Date()
    now.setHours(1, 0, 0, 0)
    vi.setSystemTime(now)

    const lastNight = new Date(now)
    lastNight.setHours(-1, 0, 0, 0) // 23:00 local, the previous day

    expect(itemState(item(asBackendSends(lastNight)))).toBe('bought')
  })

  it('a shop just after local midnight belongs to the new day', () => {
    const now = new Date()
    now.setHours(2, 0, 0, 0)
    vi.setSystemTime(now)

    const justAfterMidnight = new Date(now)
    justAfterMidnight.setHours(0, 30, 0, 0)

    expect(itemState(item(asBackendSends(justAfterMidnight)))).toBe('cart')
  })
})

describe('what the progress bar counts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
  })

  it('counts the cart — the shopping is done, the paying is not the point', () => {
    expect(isInCart(item('2026-07-28T09:00:00'))).toBe(true)
  })

  it('does not count a settled purchase from an earlier trip', () => {
    expect(isInCart(item('2026-07-20T09:00:00'))).toBe(false)
  })

  it('does not count something still on the list', () => {
    expect(isInCart(item(null))).toBe(false)
  })
})
