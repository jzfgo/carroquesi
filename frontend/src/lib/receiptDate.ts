/**
 * Writing the receipt date in a form the backend can center its match window on.
 *
 * The backend matches purchases against a +-3 day window centred on the
 * receipt date. A misread digit therefore puts the window away from the real
 * purchases: the candidate set comes back empty and a receipt that scanned
 * perfectly matches none of its items. The same value is then stamped onto
 * `purchased_at`, so a wrong date is persisted with the prices.
 *
 * ## Everything here works in the *viewer's* calendar, not UTC
 *
 * `receipt_date` is not a bare date by the time it reaches us. `receiptAi.ts`
 * merges the scanned date and time via `toReceiptInstant()`, which builds a
 * `Date` from **local** components. A receipt printed at 00:30 in Madrid is
 * one instant, but two different calendar days depending on who you ask:
 * the 25th to the person holding it, the 24th in UTC.
 *
 * So reducing that instant to a UTC day answers the wrong question: it names
 * a different day than the one the receipt was printed on for the person
 * holding it. Every day extracted here is the local one for that reason.
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
