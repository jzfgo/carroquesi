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
 */

/**
 * Mirrors RECEIPT_MATCH_WINDOW_DAYS in backend/app/routers/receipt.py. Widening
 * one without the other reintroduces the gap this prompt exists to close.
 */
export const RECEIPT_DATE_TOLERANCE_DAYS = 3

/**
 * Whole days since the epoch, in UTC.
 *
 * Both sides of the comparison are reduced to UTC days on purpose. A bare
 * "2026-04-11" parses as UTC midnight, so comparing it against a local-time
 * `now` would drift by a day either side of midnight depending on the
 * viewer's timezone -- and that drift would flip the verdict for any receipt
 * sitting exactly on the threshold.
 */
function utcDay(d: Date): number {
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000,
  )
}

function parse(raw: string | null): Date | null {
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
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
  const parsed = parse(raw)
  if (!parsed) return false
  return Math.abs(utcDay(parsed) - utcDay(now)) > RECEIPT_DATE_TOLERANCE_DAYS
}

/** `YYYY-MM-DD` for an `<input type="date">`, or '' when there is no date. */
export function toDateInputValue(raw: string | null): string {
  const parsed = parse(raw)
  return parsed ? parsed.toISOString().slice(0, 10) : ''
}

/**
 * Swap the day out of `raw`, keeping its time-of-day when it had one.
 *
 * The user is correcting the *date*, not the time — a receipt read as
 * "2026-07-14T17:42:00Z" was still printed at 17:42, so preserving it keeps
 * `purchased_at` meaningful instead of collapsing every correction to
 * midnight.
 */
export function withDatePart(raw: string | null, isoDay: string): string {
  const timePart = raw?.includes('T') ? raw.slice(raw.indexOf('T')) : ''
  return `${isoDay}${timePart}`
}
