/**
 * Calendar-day helpers for the date read off a receipt.
 *
 * The date is checked server-side when the scan is matched: a misread year is
 * repaired, and a date that cannot be trusted comes back null, so the review
 * asks for it. Nothing here judges the date; it only renders and edits it.
 *
 * ## Everything here works in the *viewer's* calendar, not UTC
 *
 * `receipt_date` is not a bare date by the time it reaches us. `receiptAi.ts`
 * merges the scanned date and time via `toReceiptInstant()`, which builds a
 * `Date` from **local** components and returns `toISOString()` -- a UTC
 * instant. A receipt printed at 00:30 in Madrid is therefore stored as
 * `...T22:30:00.000Z` on the *previous* UTC day.
 *
 * So reducing that instant to a UTC day answers the wrong question. The sheet
 * renders the date with `toLocaleDateString` and `<input type="date">` shows
 * the viewer's own calendar, so a UTC-day reduction disagrees with both: the
 * button would read "25 jul" while the editor pre-filled the 24th. Every day
 * extracted here is the local one for that reason.
 *
 * A bare `YYYY-MM-DD` is the exception and passes through untouched: it is
 * already a zone-less calendar day, and parsing it would pin it to UTC
 * midnight and shift it a day backwards for every viewer west of Greenwich.
 */

/** A zone-less calendar day, as the AI is asked to emit it. */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The calendar day an instant falls on *for the viewer*, as `YYYY-MM-DD`. */
function localDayIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parse(raw: string | null): Date | null {
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * The calendar day `raw` denotes, or null when there isn't one.
 *
 * Bare dates are already calendar days; instants are reduced to the viewer's.
 */
function calendarDay(raw: string | null): string | null {
  if (!raw) return null
  if (BARE_DATE.test(raw)) return raw
  const parsed = parse(raw)
  return parsed ? localDayIso(parsed) : null
}

/** `YYYY-MM-DD` for an `<input type="date">`, or '' when there is no date. */
export function toDateInputValue(raw: string | null): string {
  return calendarDay(raw) ?? ''
}

/**
 * Today in the viewer's calendar, for the picker's `max`.
 *
 * A receipt cannot be printed in the future, so the picker refuses one. This
 * has to be the *local* day: pinning `max` to the UTC day locks the viewer out
 * of selecting their own "today" for the hours either side of local midnight.
 */
export function todayInputValue(now: Date = new Date()): string {
  return localDayIso(now)
}

/**
 * Swap the day out of `raw`, keeping its time of day when it had one.
 *
 * The user is correcting the *date*, not the time — a receipt read as
 * "2026-07-14T17:42:00Z" was still printed at 17:42, so preserving it keeps
 * `purchased_at` meaningful instead of collapsing every correction to
 * midnight.
 *
 * The time preserved is the *local* one, and the result is re-encoded as an
 * instant the same way `toReceiptInstant` does. Splicing the UTC time onto the
 * new day instead would re-introduce the offset: a 00:30 Madrid receipt is
 * `T22:30Z`, so pasting that onto the day the user picked lands them a day
 * late — the correction would silently miss by one.
 */
export function withDatePart(raw: string | null, isoDay: string): string {
  const original = parse(raw)
  // A bare date carries no time of day to preserve, so the answer stays bare.
  if (!original || !raw?.includes('T')) return isoDay
  const [y, m, d] = isoDay.split('-').map(Number)
  return new Date(
    y,
    m - 1,
    d,
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    0,
  ).toISOString()
}
