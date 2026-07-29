/** Parse a naive-UTC timestamp as the backend stamps it, into epoch ms.
 *
 *  The backend stores every instant as naive UTC — no offset, no `Z` — so
 *  handing one straight to `Date.parse` lets the JS engine guess the
 *  timezone, which is wrong everywhere the host isn't UTC. Appending `Z`
 *  before parsing tells the engine what's already true: the string is UTC.
 *
 *  Returns `null`, never `NaN`, for anything unparseable — the two call
 *  sites (`itemState`, `useTearOff`) each decide what to do with "unknown"
 *  in their own way, and `null` is easier to branch on than `Number.isNaN`.
 */
export function parseNaiveUtc(value: string): number | null {
  const at = Date.parse(`${value}Z`)
  return Number.isNaN(at) ? null : at
}
