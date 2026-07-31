import { DATE_ONLY, parseNaiveUtc } from './naiveUtc'

/**
 * Read a stored instant for display.
 *
 * The rule for reading one lives in `naiveUtc`, and this asks for it rather
 * than keeping a copy: the backend stamps every instant as naive UTC, and a
 * bare parse lets the engine call that local time, so a purchase late in the
 * UTC evening prints the day before the one it happened on for every reader
 * east of Greenwich.
 *
 * An unreadable stamp formats as an em dash — the same mark the record list
 * already shows for a date it does not have, and better than printing the
 * words "Invalid Date" into a sheet.
 */
function format(iso: string, options: Intl.DateTimeFormatOptions): string {
  const at = parseNaiveUtc(iso)
  if (at === null) return '—'
  // An instant is shown in the reader's zone, which is where they were when it
  // happened. A bare day is not an instant and has no hour to move: read as
  // midnight UTC and then rendered locally, it would print as the day before
  // for every reader west of Greenwich. Rendering it in UTC hands back the day
  // it was given.
  const zone = DATE_ONLY.test(iso) ? { timeZone: 'UTC' } : undefined
  return new Date(at).toLocaleDateString('es-ES', { ...options, ...zone })
}

/** "22 jul" — the form every date in the item sheet takes. */
export function formatShortDate(iso: string): string {
  return format(iso, { day: 'numeric', month: 'short' })
}

/** "julio" — the month a run of purchases started in. */
export function formatMonth(iso: string): string {
  return format(iso, { month: 'long' })
}
