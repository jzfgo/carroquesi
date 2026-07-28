import { useEffect, useReducer } from 'react'
import type { ListItem } from '../types'

// Caps the scheduled delay so a garbage `purchase_ends_at` (some bad row far
// in the future) yields a harmless re-check instead of racing a 32-bit
// `setTimeout` overflow. Real boundaries are always under 24h away, so this
// never engages for legitimate trips.
const MAX_DELAY_MS = 24 * 60 * 60 * 1000

/** Re-render when the soonest open trip tears off.
 *
 *  `itemState` compares against `Date.now()`, and nothing else would wake the
 *  screen at midnight: the 5s poll re-fetches only when the list's
 *  `updated_at` moves, and a tear-off changes nothing server-side.
 *
 *  This is only schedulable because the boundary is a *stamped instant*. A
 *  value computed at read time can be polled for; a stored one can be waited on.
 *
 *  Render stays pure — it only parses timestamps. Reading the clock and
 *  choosing which boundary is next happens in the effect, where impurity is
 *  allowed. `tick` is in the deps so that after one boundary fires the effect
 *  re-runs and schedules the *next* one; without it a list with two trips
 *  ending at different times would tear off once and then stop.
 */
export function useTearOff(items: ListItem[]): void {
  const [tick, bump] = useReducer((n: number) => n + 1, 0)

  // Pure: parse only. Sorted and joined into a primitive so the effect has a
  // stable dependency that does not change identity on every render.
  const key = items
    .map((item) => item.purchase_ends_at)
    .filter((ends): ends is string => Boolean(ends))
    .map((ends) => Date.parse(`${ends}Z`))
    .filter((at) => !Number.isNaN(at))
    .sort((a, b) => a - b)
    .join(',')

  useEffect(() => {
    if (!key) return
    const now = Date.now()
    const next = key
      .split(',')
      .map(Number)
      .find((at) => at > now)
    if (next === undefined) return
    // A second past the boundary, so itemState's comparison lands safely on
    // the far side of it rather than racing the timer's own resolution.
    const delay = Math.min(next - now + 1000, MAX_DELAY_MS)
    const id = setTimeout(bump, delay)
    return () => clearTimeout(id)
  }, [key, tick])
}
