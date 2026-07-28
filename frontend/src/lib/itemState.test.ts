import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListItem } from '../types'
import { isInCart, itemState } from './itemState'

const item = (overrides: Partial<ListItem> = {}): ListItem =>
  ({
    purchased_at: null,
    purchased: false,
    purchase_id: null,
    purchase_ends_at: null,
    ...overrides,
  }) as ListItem

afterEach(() => {
  vi.useRealTimers()
})

describe('the three states', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
  })

  it('an unmarked item is pending', () => {
    expect(itemState(item())).toBe('pending')
  })

  it('purchased with no date is bought, not pending', () => {
    // Cannot happen — the backend derives one from the other — but calling a
    // bought item "still to buy" is the worse way to be wrong.
    expect(itemState(item({ purchased_at: null, purchased: true }))).toBe(
      'bought',
    )
  })

  it('purchased, trip not ended, is in the cart', () => {
    expect(
      itemState(
        item({
          purchased_at: '2026-07-28T09:30:00',
          purchased: true,
          purchase_ends_at: '2026-07-28T23:00:00',
        }),
      ),
    ).toBe('cart')
  })

  it('purchased, trip torn off at midnight, is bought', () => {
    expect(
      itemState(
        item({
          purchased_at: '2026-07-27T21:00:00',
          purchased: true,
          purchase_ends_at: '2026-07-28T00:00:00',
        }),
      ),
    ).toBe('bought')
  })

  it('trip closed early on the same day it was purchased is bought — the case a day-comparison could never express', () => {
    expect(
      itemState(
        item({
          purchased_at: '2026-07-28T09:00:00',
          purchased: true,
          // "Cerrar compra" fired minutes after the item went in, same day.
          purchase_ends_at: '2026-07-28T09:05:00',
        }),
      ),
    ).toBe('bought')
  })

  it('unsynced — purchased offline, trip not yet known — stays in the cart', () => {
    expect(
      itemState(
        item({
          purchased_at: '2026-07-28T09:00:00',
          purchased: true,
          purchase_ends_at: null,
        }),
      ),
    ).toBe('cart')
  })

  it('an unparseable purchase_ends_at does not crash and stays in the cart', () => {
    expect(
      itemState(
        item({
          purchased_at: '2026-07-28T09:00:00',
          purchased: true,
          purchase_ends_at: 'not-a-date',
        }),
      ),
    ).toBe('cart')
  })
})

describe('the exact boundary', () => {
  const ENDS = '2026-07-28T22:00:00'

  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('one second before purchase_ends_at is still cart', () => {
    vi.setSystemTime(new Date(`${ENDS}Z`).getTime() - 1000)
    expect(
      itemState(
        item({
          purchased_at: '2026-07-28T09:00:00',
          purchased: true,
          purchase_ends_at: ENDS,
        }),
      ),
    ).toBe('cart')
  })

  it('exactly at purchase_ends_at is bought', () => {
    vi.setSystemTime(new Date(`${ENDS}Z`))
    expect(
      itemState(
        item({
          purchased_at: '2026-07-28T09:00:00',
          purchased: true,
          purchase_ends_at: ENDS,
        }),
      ),
    ).toBe('bought')
  })
})

describe('what the progress bar counts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
  })

  it('counts the cart — the shopping is done, the paying is not the point', () => {
    expect(
      isInCart(
        item({
          purchased_at: '2026-07-28T09:00:00',
          purchased: true,
          purchase_ends_at: '2026-07-28T23:00:00',
        }),
      ),
    ).toBe(true)
  })

  it('does not count a settled purchase from an earlier trip', () => {
    expect(
      isInCart(
        item({
          purchased_at: '2026-07-20T09:00:00',
          purchased: true,
          purchase_ends_at: '2026-07-20T23:00:00',
        }),
      ),
    ).toBe(false)
  })

  it('does not count something still on the list', () => {
    expect(isInCart(item())).toBe(false)
  })
})
