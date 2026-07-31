import { parseNaiveUtc } from './naiveUtc'

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
  return at === null ? '—' : new Date(at).toLocaleDateString('es-ES', options)
}

/** "22 jul" — the form every date in the item sheet takes. */
export function formatShortDate(iso: string): string {
  return format(iso, { day: 'numeric', month: 'short' })
}

/** "julio" — the month a run of purchases started in. */
export function formatMonth(iso: string): string {
  return format(iso, { month: 'long' })
}
