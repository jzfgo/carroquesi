import { ApiError } from './api'

/**
 * What to say when the server refused a write, in the language of the house.
 *
 * Lives beside `isRetryable`, below, rather than inside `useListItems`,
 * because the two halves of one rule belong at the same reach: the button is
 * decided by `isRetryable` and the sentence by these, and every caller of one
 * is a caller of the other. Private to the hook, the price toast could import
 * the button rule and had to re-type the sentences — which is the shape that
 * produced three of that phase's findings. The two were split across files
 * only because `isRetryable` was born in the offline queue's copy module;
 * that module is gone and they are together.
 *
 * The **scope is per status, not per call site**. A 403 is about the *list*
 * and is true of every write; a 404 means «el producto ya no existe» only
 * where the write names a product — on `addItem` the missing thing is the
 * list, and the sheet says so differently. Excluding `addItem` wholesale on
 * account of the 404 cost it the 403 it should have had, so the two are asked
 * separately.
 */
export function refusalMessage(err: unknown, fallback: string): string {
  const status = err instanceof ApiError ? err.status : 0
  if (status === 403) return 'Sin permiso en esa lista'
  return fallback
}

/** `refusalMessage` plus the 404 only a write that names a product can say. */
export function itemRefusal(err: unknown, fallback: string): string {
  const status = err instanceof ApiError ? err.status : 0
  if (status === 404) return 'El producto ya no existe'
  return refusalMessage(err, fallback)
}

/**
 * Whether sending the same thing again could ever end differently.
 *
 * One rule: a status that states a fact about the data will say the same thing
 * to the same request, and a status about how busy the server is — or about a
 * credential that can be refreshed — will not. So a line the server can never
 * accept is drawn without a retry: offering one there is a control that is
 * known in advance to fail.
 *
 * **401 is here and 403 is not**, which looks inconsistent and is not. A 401 is
 * answered by the next call carrying a fresh token. Every 403 this backend
 * raises is a standing fact about the caller — not a member, not the owner, not
 * an admin, still on the waitlist, the feature flag off, the invite addressed
 * to somebody else — and none of them is changed by asking again. Being removed
 * from a list would otherwise put a *Reintentar* on every write, forever.
 *
 * This is asked of a live button under a thumb as well as of a row in a sheet,
 * so a status has to be wrong in only one of those places to be wrong here.
 */
export function isRetryable(status: number): boolean {
  if (status === 401 || status === 408 || status === 429) {
    return true
  }
  // Below 400 is the failure that threw without an HTTP answer to read. Not
  // knowing why is not the same as knowing it can never work, and foreclosing
  // on it would strand a write over a bug on this side.
  return status < 400 || status >= 500
}
