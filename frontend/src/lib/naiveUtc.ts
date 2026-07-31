/** A `Z`, or a `+hh:mm` / `-hhmm`, at the end of a timestamp. */
const NAMES_A_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/

/** Parse a naive-UTC timestamp as the backend stamps it, into epoch ms.
 *
 *  The backend stores every instant as naive UTC — no offset, no `Z` — so
 *  handing one straight to `Date.parse` lets the JS engine guess the
 *  timezone, which is wrong everywhere the host isn't UTC. Appending `Z`
 *  before parsing tells the engine what's already true: the string is UTC.
 *
 *  A string that already names its zone is parsed as it stands. Appending a
 *  second `Z` produces nothing at all, and this is the one rule in the app for
 *  reading a stored instant — a display helper that quietly kept its own,
 *  tolerant copy is how two answers to this question came to exist.
 *
 *  A date with no time is left alone too: `2026-07-22Z` is not a form the
 *  language admits, so appending there would turn a readable date into
 *  nothing. A bare date has no hour to misplace, which is why it needs no help.
 *
 *  Returns `null`, never `NaN`, for anything unparseable — every call site
 *  decides what to do with "unknown" in its own way, and `null` is easier to
 *  branch on than `Number.isNaN`.
 */
export function parseNaiveUtc(value: string): number | null {
  const needsZone = value.includes('T') && !NAMES_A_ZONE.test(value)
  const at = Date.parse(needsZone ? `${value}Z` : value)
  return Number.isNaN(at) ? null : at
}
