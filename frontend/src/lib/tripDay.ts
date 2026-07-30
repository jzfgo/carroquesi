import { parseNaiveUtc } from './naiveUtc'

/** The calendar day a trip belongs to, and the way back from one.
 *
 *  A trip's day boundary is local midnight in Europe/Madrid. The backend
 *  stores every instant as naive UTC, and the two disagree for the first hour
 *  or two of every Madrid day: it is already the 30th in Madrid while the
 *  stored string still reads the 29th. Cutting the date off the front of a
 *  stored timestamp is therefore wrong during exactly the hours after a trip
 *  tears off — which is when someone sits down to write down last night's
 *  shop.
 *
 *  The backend learned this the expensive way. The same day comparison was
 *  written six times there, four of them in UTC, and they were wrong in
 *  different directions because the rule had no home. It has one there now,
 *  in services/trips.py, and this is the same rule's home on this side.
 */

// There is no per-user timezone anywhere. A trip is a household fact, so the
// household's zone decides it — the same choice the backend makes.
const TRIP_TIMEZONE = 'Europe/Madrid'

// en-CA writes a date as YYYY-MM-DD, which is what a date input reads and what
// the backend wants back.
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRIP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The Madrid calendar day containing a naive-UTC instant. */
export function madridDay(naiveUtc: string): string {
  const at = parseNaiveUtc(naiveUtc)
  // A string that is not a moment has no day. Empty rather than today: it
  // leaves the date field blank and the sheet unsavable, which asks the
  // household for the answer instead of inventing one.
  if (at === null) return ''
  return dayFormat.format(at)
}

/** How far Madrid is from UTC at an instant, in minutes, east-positive.
 *
 *  Asked of the platform rather than hard-coded, so summer and winter are both
 *  right without a timezone library.
 */
function madridOffsetMinutes(at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TRIP_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(at)
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const match = raw.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

/** The naive-UTC instant of 12:00 Madrid on a `YYYY-MM-DD` day.
 *
 *  Noon on purpose. It is at least two hours from either midnight, so no
 *  offset the zone can take pushes it into the day before or the day after.
 *  Which trip an item joins does not depend on this figure — the server
 *  resolves that from the trip it was handed — so the clock only has to name
 *  the right day.
 */
export function naiveUtcForMadridNoon(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const noonUtc = Date.UTC(year, month - 1, date, 12)
  // One probe is enough. Madrid changes offset at 01:00 UTC, and UTC noon is
  // never more than two hours from Madrid noon, so both sit on the same side
  // of any change.
  const at = new Date(noonUtc - madridOffsetMinutes(noonUtc) * 60_000)
  return at.toISOString().slice(0, 19)
}
