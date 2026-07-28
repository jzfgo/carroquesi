import { act, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListItem } from '../types'
import { useTearOff } from './useTearOff'

const makeItem = (overrides: Partial<ListItem> = {}): ListItem => ({
  id: 'a',
  list_id: 'l1',
  name: 'Item',
  quantity: null,
  brand: null,
  stores: [],
  purchased: true,
  purchased_at: '2026-07-28T10:00:00',
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
  ...overrides,
})

let renderCount: number
function Harness({ items }: { items: ListItem[] }) {
  renderCount++
  useTearOff(items)
  return null
}

const renderHarness = (items: ListItem[]) =>
  render(createElement(Harness, { items }))

describe('useTearOff', () => {
  beforeEach(() => {
    renderCount = 0
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-renders once the soonest open trip tears off', () => {
    const endsAt = '2026-07-28T12:00:05' // naive-UTC, 5s from "now"
    const items = [makeItem({ purchase_ends_at: endsAt })]
    renderHarness(items)
    expect(renderCount).toBe(1)

    // Boundary + the 1s safety margin baked into the hook.
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(renderCount).toBe(2)
  })

  it('schedules nothing when every trip has already ended', () => {
    const items = [
      makeItem({ purchase_ends_at: '2026-07-28T11:00:00' }), // an hour ago
      makeItem({ id: 'b', purchase_ends_at: '2020-01-01T00:00:00' }),
    ]
    renderHarness(items)
    expect(renderCount).toBe(1)

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    })
    expect(renderCount).toBe(1)
  })

  it('schedules nothing for an empty list', () => {
    renderHarness([])
    expect(renderCount).toBe(1)

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    })
    expect(renderCount).toBe(1)
  })

  it('treats a trip ending exactly now as already torn off (<=, not <)', () => {
    // A boundary aligned to the instant "now" resolves at construction time,
    // not by a timer: itemState's own `>=` already calls it bought, so there
    // is nothing left to wait for. `at <= now` must skip it up front.
    const items = [makeItem({ purchase_ends_at: '2026-07-28T12:00:00' })]
    renderHarness(items)
    expect(renderCount).toBe(1)

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    })
    expect(renderCount).toBe(1)
  })

  it('reschedules for a second, later trip after the first tears off', () => {
    // Two trips, five and fifteen seconds out. Firing the first must not be
    // the last thing that happens — `tick` in the effect's deps is what makes
    // it look again and schedule the second, rather than going quiet after
    // one boundary because the sorted boundary list itself never changed.
    const items = [
      makeItem({ purchase_ends_at: '2026-07-28T12:00:05' }),
      makeItem({ id: 'b', purchase_ends_at: '2026-07-28T12:00:15' }),
    ]
    renderHarness(items)
    expect(renderCount).toBe(1)

    act(() => {
      vi.advanceTimersByTime(6000) // past the first boundary + 1s margin
    })
    expect(renderCount).toBe(2)

    act(() => {
      vi.advanceTimersByTime(10000) // past the second boundary + 1s margin
    })
    expect(renderCount).toBe(3)
  })
})
