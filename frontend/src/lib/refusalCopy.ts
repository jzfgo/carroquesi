import { ApiError } from './api'

/**
 * What to say when the server refused a write, in the language of the house.
 *
 * Lives beside `queueCopy`'s `isRetryable` rather than inside `useListItems`
 * because the two halves of one rule belong at the same reach: the button is
 * decided by `isRetryable` and the sentence by these, and every caller of one
 * is a caller of the other. Private to the hook, the price toast could import
 * the button rule and had to re-type the sentences — which is the shape that
 * produced three of this branch's findings.
 *
 * The **scope is per status, not per call site**. A 403 is about the *list*
 * and is true of every write; a 404 means «el producto ya no existe» only
 * where the write names a product — on `addItem` the missing thing is the
 * list, and the sheet says so differently. Excluding `addItem` wholesale on
 * account of the 404 cost it the 403 it should have had, so the two are asked
 * separately.
 */
/**
 * Said when a write is refused for want of a signal — the one refusal no
 * server had a hand in.
 *
 * It carries no action. A *Reintentar* would be a control known in advance to
 * fail: the network is the reason and pressing it again cannot change that.
 * The band is what states the condition; this only says the tap did nothing,
 * and it should only ever be reached by a control pressed in the instant
 * between the `offline` event and React rendering it disabled.
 *
 * The wording is the one the list-level gates have used since they were
 * written — «no disponible», not «no se pudo», because nothing was attempted
 * and «no se pudo» would blame a server that never heard about it. Naming it
 * here is what stops the fifteen-odd gates this now covers from drifting into
 * fifteen sentences about one fact.
 */
export const OFFLINE_REFUSAL = 'No disponible sin conexión'

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
