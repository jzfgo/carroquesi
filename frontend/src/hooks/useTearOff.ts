import { useEffect, useState } from 'react'
import { parseNaiveUtc } from '../lib/naiveUtc'
import type { ListItem } from '../types'

// Caps the scheduled delay so a garbage `purchase_ends_at` (some bad row far
// in the future) yields a harmless re-check instead of racing a 32-bit
// `setTimeout` overflow. Real boundaries are always under 24h away, so this
// never engages for legitimate trips.
const MAX_DELAY_MS = 24 * 60 * 60 * 1000

/** The clock the cart rule is read against, advanced at each tear-off.
 *
 *  `itemState` compares against an instant, and nothing else would wake the
 *  screen at midnight: the 5s poll re-fetches only when the list's
 *  `updated_at` moves, and a tear-off changes nothing server-side.
 *
 *  This is only schedulable because the boundary is a *stamped instant*. A
 *  value computed at read time can be polled for; a stored one can be waited on.
 *
 *  Returning the instant rather than nothing is what makes the wake-up useful
 *  to a memoised caller. A re-render alone is not enough: anything deriving
 *  from `itemState` inside a `useMemo` keyed on `items` cache-hits straight
 *  through the boundary, because no item changed — only the time did. Callers
 *  pass this value to `itemState` and list it as a dependency, and then the
 *  memo has the one input that actually moved.
 *
 *  Render stays pure — it only parses timestamps. Reading the clock and
 *  choosing which boundary is next happens in the effect, where impurity is
 *  allowed. `now` is in the deps so that after one boundary fires the effect
 *  re-runs and schedules the *next* one; without it a list with two trips
 *  ending at different times would tear off once and then stop.
 */
export function useTearOff(items: ListItem[]): number {
  const [now, setNow] = useState(() => Date.now())

  // Pure: parse only. Sorted and joined into a primitive so the effect has a
  // stable dependency that does not change identity on every render.
  const key = items
    .map((item) => item.purchase_ends_at)
    .filter((ends): ends is string => Boolean(ends))
    .map((ends) => parseNaiveUtc(ends))
    .filter((at): at is number => at !== null)
    .sort((a, b) => a - b)
    .join(',')

  useEffect(() => {
    if (!key) return
    // Deliberately the live clock, not the `now` this hook returns. That one
    // only moves at boundaries, so on a list that had no open trip at mount it
    // is still the mount instant — and sizing the delay against it would fire
    // the timer as many hours late as the tab has been open.
    const clock = Date.now()
    const next = key
      .split(',')
      .map(Number)
      .find((at) => at > clock)
    if (next === undefined) return
    // A second past the boundary, so itemState's comparison lands safely on
    // the far side of it rather than racing the timer's own resolution.
    const delay = Math.min(next - clock + 1000, MAX_DELAY_MS)
    const id = setTimeout(() => setNow(Date.now()), delay)
    return () => clearTimeout(id)
  }, [key, now])

  return now
}
