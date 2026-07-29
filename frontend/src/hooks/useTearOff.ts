import { useEffect, useState } from 'react'
import { parseNaiveUtc } from '../lib/naiveUtc'
import type { ListItem } from '../types'

// Caps the scheduled delay, so a boundary further out than this yields a
// re-check rather than one long wait.
//
// The value comes from the domain rather than the platform. Tear-off
// boundaries are daily — `tears_off_at_for` stamps the next Madrid midnight —
// so a day is the natural scale of `next - clock`, and the coarsest cap that
// still bounds anything past it to a re-check or two.
//
// Deliberately *not* a claim about how long a `setTimeout` can be trusted.
// The ordinary path waits out a whole boundary uncapped: a trip opened at
// 00:01 schedules 23h59m and never re-checks. Any distrust of a day-long
// timer would condemn that too, and this cap would be the wrong instrument
// for it — it only ever engages past the daily scale, so it cannot be what
// makes the common case safe.
//
// 32-bit overflow is a distant backstop, not the reason: it bites at 2^31−1
// ms, about 24.9 days, some 25× beyond this.
//
// This used to say the cap "never engages for legitimate trips", and that
// sentence was wrong in a way that cost a bug: it is exactly why assigning
// `next` in the callback looked safe regardless of whether the timer had
// reached it. `tears_off_at_for` stamps the *next* Madrid midnight, so a trip
// opened at 00:01 local is already ~24h out on a correct clock — and
// `next - clock` is measured against the *client's* clock, which the server
// does not control. A phone lagging by a minute engages the cap on entirely
// valid data.
//
// So the cap is ordinary, not exceptional, and what keeps it harmless is that
// a capped timer declines to claim it arrived. See the `arrives` split below.
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
    // Selected against `now` — the instant callers are reading against — and
    // not against the live clock. A boundary can already be behind the live
    // clock without any timer of ours having fired, because a boundary can be
    // *replaced* by one in the past: closing a trip swaps its `tears_off_at`
    // for a `closed_at` stamped at server time, which the 5s poll can only
    // ever deliver after the fact. Selecting against `clock` would skip that
    // boundary and strand `now` short of it until the next one comes round —
    // and meanwhile the callers holding `now` say "in the cart" while every
    // caller reading the live clock says "bought", which is worse than either
    // answer on its own. Selecting against `now` makes it a wait of zero
    // instead of a special case, and the assignment then moves `now` past it.
    const next = key
      .split(',')
      .map(Number)
      .find((at) => at > now)
    if (next === undefined) return
    // Exactly as long as the boundary is away, no margin. One already behind
    // the live clock has nothing left to wait for, which is where the negative
    // comes from.
    //
    // The `max` states that intent rather than producing it. Every runtime
    // this ships to clamps a non-positive delay to "as soon as possible"
    // anyway (the web platform to 0, Node to 1ms), so removing the floor
    // changes nothing observable — the catch-up tests execute this line with
    // a negative input and pass either way. `never asks for a negative delay`
    // in the tests pins it at the only place the difference exists, which is
    // the argument handed to setTimeout rather than anything that comes back.
    const remaining = Math.max(next - clock, 0)
    const delay = Math.min(remaining, MAX_DELAY_MS)
    // The margin that used to sit in the delay lives here instead. Firing a
    // second late did give itemState's `>=` a safe landing, but it also left a
    // second in which this hook's `now` still said 'cart' while every caller
    // reading the live clock — ItemList, ItemCard — already said 'bought'.
    // That is the same two-clock split fixed in e7f0e71, just bounded at a
    // second instead of lasting until midnight.
    //
    // Taking the max against `next` gets the safe landing without the wait:
    // `now` sits exactly on the boundary even if the timer resolves a shade
    // early, rather than a shade short of it.
    //
    // Only when the schedule was *not* capped, though. A capped timer fires
    // short of `next` on purpose — it is a re-check, and it must not claim to
    // have arrived. Assigning `next` there would put `now` ahead of the live
    // clock by the whole overshoot, and since the next selection is
    // `find(at > now)` it would then find nothing, schedule nothing, and leave
    // the item reading 'bought' up to 24h early for good. That turns the cap
    // from a safety net into the bug it was guarding against.
    const arrives = remaining <= MAX_DELAY_MS
    const id = setTimeout(
      () => setNow(arrives ? Math.max(Date.now(), next) : Date.now()),
      delay,
    )
    return () => clearTimeout(id)
  }, [key, now])

  return now
}
