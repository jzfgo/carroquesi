/**
 * Sanity-checking the date the AI read off a receipt.
 *
 * The backend matches purchases against a +-3 day window centred on the
 * receipt date. A misread digit therefore puts the window away from the real
 * purchases: the candidate set comes back empty and a receipt that scanned
 * perfectly matches none of its items. The same value is then stamped onto
 * `purchased_at`, so a wrong date is persisted with the prices.
 *
 * We do not try to decide whether the date is wrong -- an old receipt is a
 * legitimate thing to scan, and guessing would break that flow. We only decide
 * whether it is worth *asking* about, which is a much cheaper judgement: a
 * false prompt costs the user one glance.
 *
 * That is why the threshold is the match window itself rather than something
 * looser. A misread can land in any component of the date, not just the year,
 * and "2026-07-14" for "2026-07-11" is as fatal to matching as "2020-07-11" --
 * it empties the same window. Any date the window would not already cover is
 * worth a question. Receipts dated in the future are handled upstream, in the
 * scanning prompt (lib/receiptAi.ts): a receipt is printed at the moment of
 * purchase, so a future date means a misread and the model returns null. The
 * check here is symmetric anyway, so one slipping through is still caught.
 *
 * ## Everything here works in the *viewer's* calendar, not UTC
 *
 * `receipt_date` is not a bare date by the time it reaches us. `receiptAi.ts`
 * merges the scanned date and time via `toReceiptInstant()`, which builds a
 * `Date` from **local** components. A receipt printed at 00:30 in Madrid is
 * one instant, but two different calendar days depending on who you ask:
 * the 25th to the person holding it, the 24th in UTC.
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
 *
 * ## The wire value carries its offset, and that is the point
 *
 * What leaves this module is written `2026-07-25T00:30:00+02:00`, not
 * `2026-07-24T22:30:00.000Z`. Both name the same instant, so as an instant the
 * choice is free -- but only one of them still says *which day the user
 * meant*, and that is the fact the backend needs. It has no timezone to
 * consult, so it centres its +-3 day match window on whatever day it can read
 * off this string. Handed the `Z` form it reads the 24th, and the window that
 * exists to catch a purchase marked up to three days *after* the receipt
 * silently becomes [-4, +2] for everyone east of Greenwich. The offset costs
 * six characters and closes that.
 */

/**
 * Mirrors RECEIPT_MATCH_WINDOW_DAYS in backend/app/routers/receipt.py. Widening
 * one without the other reintroduces the gap this prompt exists to close.
 */
export const RECEIPT_DATE_TOLERANCE_DAYS = 3

/** A zone-less calendar day, as the AI is asked to emit it. */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The calendar day an instant falls on *for the viewer*, as `YYYY-MM-DD`. */
function localDayIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * A moment written in the viewer's own calendar, with the offset that places
 * it: `2026-07-25T00:30:00+02:00`.
 *
 * This is the one format the receipt endpoints are sent, and the reason is in
 * the module docblock above: it is the only ISO 8601 form that carries the
 * user's calendar day and the instant at once. `Date.parse` and Python's
 * `datetime.fromisoformat` both read it, so nothing downstream needs to know
 * it changed.
 */
export function toLocalInstant(d: Date): string {
  // getTimezoneOffset counts minutes *behind* UTC, so Madrid reports -120.
  // The suffix states the opposite: minutes ahead. Hence the negation.
  const offset = -d.getTimezoneOffset()
  const magnitude = Math.abs(offset)
  const suffix = `${offset < 0 ? '-' : '+'}${pad(Math.floor(magnitude / 60))}:${pad(magnitude % 60)}`
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `${localDayIso(d)}T${clock}${suffix}`
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

/**
 * Whole days since the epoch for a `YYYY-MM-DD`.
 *
 * Fed through `Date.UTC` purely as a stable numbering of calendar days -- the
 * inputs are already zone-less by this point, so no offset is involved.
 */
function dayIndex(isoDay: string): number {
  const [y, m, d] = isoDay.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

/**
 * Whether the date is far enough from today to be worth querying.
 *
 * A missing or unparseable date is not: there is nothing to correct, and the
 * backend already treats it as "match against everything".
 */
export function isReceiptDateWorthConfirming(
  raw: string | null,
  now: Date = new Date(),
): boolean {
  const day = calendarDay(raw)
  if (!day) return false
  return (
    Math.abs(dayIndex(day) - dayIndex(localDayIso(now))) >
    RECEIPT_DATE_TOLERANCE_DAYS
  )
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
 * The time preserved is the *local* one, and the result is re-encoded the same
 * way `toReceiptInstant` does. Splicing the UTC time onto the new day instead
 * would re-introduce the offset: a 00:30 Madrid receipt is `T22:30Z`, so
 * pasting that onto the day the user picked lands them a day late — the
 * correction would silently miss by one.
 *
 * The day the user picked survives into the string that is sent, rather than
 * being dissolved into a UTC instant that no longer names it. See the module
 * docblock: this is the correction the backend's match window is centred on,
 * so it is the one value that must not drift.
 */
export function withDatePart(raw: string | null, isoDay: string): string {
  const original = parse(raw)
  // A bare date carries no time of day to preserve, so the answer stays bare.
  if (!original || !raw?.includes('T')) return isoDay
  const [y, m, d] = isoDay.split('-').map(Number)
  return toLocalInstant(
    new Date(
      y,
      m - 1,
      d,
      original.getHours(),
      original.getMinutes(),
      original.getSeconds(),
      0,
    ),
  )
}
