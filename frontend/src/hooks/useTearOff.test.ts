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

    // Comfortably past the boundary. The hook now schedules exactly on it,
    // so 5000 would do — the extra second only keeps this from doubling as a
    // test of the schedule, which `never asks for a negative delay` owns.
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

  it('lands on the boundary even when the timer resolves early', () => {
    // The other half of moving the margin out of the delay. While the hook
    // fired a second late, `Date.now()` was always past `next` and the
    // assignment could not be wrong; now the schedule is exact and the `max`
    // carries that guarantee by itself.
    //
    // Nothing else here can see it. `advanceTimersByTime` lands the clock on
    // exactly `next`, which makes `Math.max(Date.now(), next)` a no-op — so
    // every other test passes with the max removed, the same blind spot the
    // `delay` floor has. An early resolution has to be built rather than
    // waited for: take the hook's own callback, put the clock a millisecond
    // short of the boundary, and fire it by hand.
    //
    // A millisecond short is not hypothetical. The margin existed because
    // `itemState` compares with `>=`, so a `now` even fractionally short of
    // `next` reads as 'cart' — and then this hook's callers disagree with
    // every caller reading the live clock, which is the bug the margin was
    // there to prevent and this line now prevents instead.
    const endsAt = '2026-07-28T12:00:05'
    const next = Date.parse('2026-07-28T12:00:05Z')
    const spy = vi.spyOn(globalThis, 'setTimeout')
    renderHarness([makeItem({ purchase_ends_at: endsAt })])

    // Picked by its delay rather than by position: RTL schedules through
    // setTimeout too, so `.at(-1)` would be a guess about whose call came last.
    //
    // A range rather than `=== 5000`, because `fakeTimers.shouldAdvanceTime`
    // is on globally (vite.config.ts) — the faked clock keeps moving with real
    // time, so a few milliseconds can elapse between `setSystemTime` and the
    // effect reading `Date.now()`, and the delay comes out just under. Nothing
    // else in this render schedules anywhere near 5s.
    const scheduled = spy.mock.calls.find(
      (call) =>
        typeof call[1] === 'number' && call[1] > 4000 && call[1] <= 5000,
    )?.[0]
    expect(typeof scheduled).toBe('function')

    vi.setSystemTime(next - 1)
    act(() => {
      ;(scheduled as () => void)()
    })

    expect(currentNow()).toBe(next)
    spy.mockRestore()
  })

  it('re-checks rather than arriving when the boundary is past the cap', () => {
    // MAX_DELAY_MS exists so a boundary further out than 24h yields a harmless
    // re-check instead of racing a 32-bit setTimeout overflow. "Harmless"
    // depends entirely on the callback declining to claim it arrived: a capped
    // timer fires short of `next`, so assigning `next` would put `now` in the
    // future — and then `find(at > now)` returns undefined, nothing
    // reschedules, and the item reads 'bought' up to 24h early and stays that
    // way. The cap would have turned a far boundary from harmless into
    // permanent.
    //
    // Reachable with valid data, not just a corrupt row: `tears_off_at_for`
    // stamps the next Madrid midnight, so a trip opened just after midnight is
    // already ~24h out, and `next - clock` is measured against the *client's*
    // clock — a device running slow by a minute tips it over.
    const endsAt = '2026-07-29T18:00:00' // 30h past the 12:00 mount
    const next = Date.parse('2026-07-29T18:00:00Z')
    const mounted = Date.parse('2026-07-28T12:00:00Z')
    const DAY = 24 * 60 * 60 * 1000
    renderHarness([makeItem({ purchase_ends_at: endsAt })])

    act(() => {
      vi.advanceTimersByTime(DAY)
    })
    // Two assertions because one of them cannot tell the two failures apart.
    // `toBeLessThan(next)` alone is satisfied just as well by *no timer having
    // fired* — which is what deleting the `Math.min` produces — so on its own
    // it pins "did not arrive" while leaving the cap itself unpinned. Verified:
    // with the cap removed and `arrives` untouched, this test stayed green.
    //
    // The lower bound is what says the capped schedule actually fired early.
    // It is safe against `shouldAdvanceTime` drift because the drift only ever
    // pushes the schedule later: the effect reads `clock >= mounted`, so the
    // timer fires at `>= mounted + DAY`.
    expect(currentNow()).toBeGreaterThanOrEqual(mounted + DAY)
    // ...and it did not pretend to have arrived.
    expect(currentNow()).toBeLessThan(next)

    // And it is still ticking: the effect re-ran and scheduled the remainder.
    act(() => {
      vi.advanceTimersByTime(6 * 60 * 60 * 1000)
    })
    expect(currentNow()).toBeGreaterThanOrEqual(next)
  })

  it('keeps re-checking a boundary more than two caps away', () => {
    // The capped branch is a loop, not a single retry, and nothing above walks
    // it twice. It only makes progress because `now` can never run ahead of
    // the live clock in this branch — the overshoot the `arrives` max can
    // introduce is bounded by a timer's early-resolution slack — so each pass
    // advances a full cap and `setNow` never hands React the value it already
    // holds. If it did, React would bail out, no effect would re-run, and the
    // clock would stop silently two days short.
    //
    // 60h, not 48h. `arrives` is `remaining <= MAX_DELAY_MS`, so a boundary
    // exactly two caps out takes the *arriving* branch on its second pass —
    // making the walk capped → arriving, which is what the 30h test above
    // already covers. A remainder is what forces a second capped pass.
    // Confirmed by throwing on the second capped entry: at 48h it never
    // fires, at 60h it does.
    const endsAt = '2026-07-31T00:00:00' // 60h out: two full caps, then 12h
    const next = Date.parse('2026-07-31T00:00:00Z')
    const mounted = Date.parse('2026-07-28T12:00:00Z')
    const DAY = 24 * 60 * 60 * 1000
    renderHarness([makeItem({ purchase_ends_at: endsAt })])

    act(() => {
      vi.advanceTimersByTime(DAY)
    })
    expect(currentNow()).toBeGreaterThanOrEqual(mounted + DAY)
    expect(currentNow()).toBeLessThan(next)

    // The second capped pass — the one this test exists for. A stall here
    // (`setNow` handed the value React already holds, so React bails out and
    // no effect re-runs) leaves `now` parked on the first cap, and only this
    // lower bound can see it.
    act(() => {
      vi.advanceTimersByTime(DAY)
    })
    expect(currentNow()).toBeGreaterThanOrEqual(mounted + 2 * DAY)
    expect(currentNow()).toBeLessThan(next)

    act(() => {
      vi.advanceTimersByTime(12 * 60 * 60 * 1000)
    })
    expect(currentNow()).toBeGreaterThanOrEqual(next)
  })

  it('never asks for a negative delay', () => {
    // The floor on `delay` is invisible through the DOM: a negative delay and
    // a zero one both fire on the next tick, so the catch-up case above passes
    // with the floor removed. It covers the line without being able to tell
    // the two apart. This asserts what the hook *asked for* rather than what
    // came back, which is the only place the difference exists.
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const view = renderHarness([
      makeItem({ purchase_ends_at: '2026-07-29T00:00:00' }),
    ])
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60 * 1000)
    })
    spy.mockClear()

    act(() => {
      view.rerender(
        createElement(Harness, {
          items: [makeItem({ purchase_ends_at: '2026-07-28T14:00:00' })],
        }),
      )
    })

    const delays = spy.mock.calls
      .map((call) => call[1])
      .filter((d): d is number => typeof d === 'number')
    // One assertion rather than a non-vacuity guard plus a filter, because
    // that pair could both go vacuous together: any stray captured call
    // satisfied `not.toHaveLength(0)`, and the filter is empty when the
    // hook's own call is missing just as it is when the call was floored. A
    // React or jsdom bump that introduced one stray setTimeout inside this
    // `act()` would leave the test green while it pinned nothing.
    //
    // `Math.min` is strictly stronger on all three: the floored call is
    // exactly 0, an unfloored one is negative, and `Math.min()` of an empty
    // array is Infinity. It also pins the *selection* — reverting `find` to
    // compare against `clock` skips this already-past boundary, and the only
    // delay left is the positive wait for the next one.
    expect(Math.min(...delays)).toBe(0)
    spy.mockRestore()
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
    // the last thing that happens — `now` in the effect's deps is what makes
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
