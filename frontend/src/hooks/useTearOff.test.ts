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
  const now = useTearOff(items)
  // Rendered rather than stashed in a module variable: assigning to an outer
  // binding during render is the side effect `react-hooks/globals` rejects.
  return createElement('span', { 'data-testid': 'now' }, String(now))
}

const renderHarness = (items: ListItem[]) =>
  render(createElement(Harness, { items }))

/** The instant the hook is currently handing its caller. */
const currentNow = () =>
  Number(document.querySelector('[data-testid="now"]')?.textContent)

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

  it('advances the clock it returns past the boundary, not just the render', () => {
    // The re-render alone is not the useful part. A caller memoising anything
    // derived from itemState keys that memo on `items`, and no item changes at
    // a tear-off — only the time does. The returned instant is the dependency
    // that moves, so it has to land on the far side of the boundary.
    const endsAt = '2026-07-28T12:00:05'
    const boundary = Date.parse(`${endsAt}Z`)
    renderHarness([makeItem({ purchase_ends_at: endsAt })])
    expect(currentNow()).toBeLessThan(boundary)

    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(currentNow()).toBeGreaterThanOrEqual(boundary)
  })

  it('catches up when a boundary is replaced by one already in the past', () => {
    // The transition none of the other tests make: no timer fires, and the
    // boundary set changes to one that is *behind* the live clock. That is
    // what closing a trip looks like from here — the server swaps
    // `tears_off_at` for a `closed_at` it stamped a poll interval ago — and
    // selecting "the next boundary after now" skips it, stranding the clock
    // this hook hands out on the far side of an event that already happened.
    const view = renderHarness([
      makeItem({ purchase_ends_at: '2026-07-29T00:00:00' }), // tomorrow
    ])
    const mounted = Date.parse('2026-07-28T12:00:00Z')
    expect(currentNow()).toBe(mounted)

    // Three hours with the tab open. Tomorrow's timer has not fired, so the
    // returned instant is still the mount instant — correct, so far.
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60 * 1000)
    })
    expect(currentNow()).toBe(mounted)

    // "Cerrar compra", or a receipt applied. The poll delivers a boundary an
    // hour behind us. Nothing is left to wait for; the clock must move anyway.
    act(() => {
      view.rerender(
        createElement(Harness, {
          items: [makeItem({ purchase_ends_at: '2026-07-28T14:00:00' })],
        }),
      )
    })
    // Scheduled rather than applied on the spot: setting state straight from
    // an effect is a cascading render. The wait is zero, so one tick is all
    // it takes — a frame, not a poll interval.
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(currentNow()).toBeGreaterThanOrEqual(
      Date.parse('2026-07-28T14:00:00Z'),
    )
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
