/** A `Z`, or a `+hh:mm` / `-hhmm`, at the end of a timestamp. */
const NAMES_A_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/

/** A calendar day and nothing else. */
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Parse a naive-UTC timestamp as the backend stamps it, into epoch ms.
 *
 *  The backend stores every instant as naive UTC — no offset, no `Z` — so
 *  handing one straight to `Date.parse` lets the JS engine guess the
 *  timezone, which is wrong everywhere the host isn't UTC. Appending `Z`
 *  before parsing tells the engine what's already true: the string is UTC.
 *
 *  Two shapes are left alone, and only those two.
 *
 *  A string that already names its zone is parsed as it stands, because a
 *  second `Z` produces nothing at all. This is the one rule in the app for
 *  reading a stored instant, and a display helper that quietly kept its own
 *  tolerant copy is how two answers to this question came to exist.
 *
 *  A bare calendar day is parsed as it stands too: the language already reads
 *  `2026-07-22` as UTC, while `2026-07-22Z` is not a form it reads at all.
 *
 *  Everything else gets the `Z`, and the shape that makes this worth spelling
 *  out is `2026-07-22 22:30:00` — a space where the `T` should be, which is
 *  what Python's `str(datetime)` gives you as against `.isoformat()`. The
 *  engine reads that one as **local** time. Testing for "no `T`" would let it
 *  past, and it would come back a plausible wrong number rather than nothing,
 *  on the rule that decides whether an item is still in the cart.
 *
 *  Returns `null`, never `NaN`, for anything unparseable — every call site
 *  decides what to do with "unknown" in its own way, and `null` is easier to
 *  branch on than `Number.isNaN`.
 */
export function parseNaiveUtc(value: string): number | null {
  const needsZone = !DATE_ONLY.test(value) && !NAMES_A_ZONE.test(value)
  const at = Date.parse(needsZone ? `${value}Z` : value)
  return Number.isNaN(at) ? null : at
}
