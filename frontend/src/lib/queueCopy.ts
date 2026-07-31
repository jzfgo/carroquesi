import { HELD_FOR_ADD, type QueuedOp } from './offlineQueue'

/**
 * Turning a queued operation into a line somebody can read.
 *
 * Three questions per line — what it was, when it was, why it did not go in —
 * kept here as pure functions so they are tested directly rather than through
 * a sheet. Same arrangement as lib/pushCopy.ts.
 */

/** What the household did, said as a past fact and not as an API verb. */
export function opKind(op: QueuedOp): string {
  switch (op.type) {
    case 'addItem':
      return 'Añadido'
    case 'deleteItem':
      return 'Eliminado'
    case 'closePurchase':
      return 'Compra'
    case 'updateItem':
      return updateKind(op.payload)
  }
}

function updateKind(payload: unknown): string {
  const patch = (payload as { patch?: Record<string, unknown> } | null)?.patch
  if (!patch) return 'Editado'
  // The patch's keys are the only thing that tells crossing something off
  // apart from renaming it — both are updateItem, and they are not the same
  // change to the person who has to recognise it here.
  // The handoff says «Tachado» here, from before the three states existed. The
  // redesign deleted the strikethrough, and this app's purchased flag now means
  // in the cart, so the row says what the tap actually did.
  if ('purchased' in patch) {
    return patch.purchased ? 'En el carro' : 'Sacado del carro'
  }
  if ('name' in patch) return 'Renombrado'
  if ('price' in patch) return 'Precio'
  if ('quantity' in patch) return 'Cantidad'
  if ('brand' in patch) return 'Marca'
  if ('stores' in patch) return 'Tienda'
  return 'Editado'
}

/**
 * Why the server refused it, in the language of the house.
 *
 * The op type is part of the answer: a 404 on an add means the list is gone,
 * and on an edit it means the product is.
 */
export function failureCause(status: number, type: QueuedOp['type']): string {
  const onAList = type === 'addItem' || type === 'closePurchase'
  switch (status) {
    // Not a refusal at all — it was never sent, because what it points at does
    // not exist yet. Falling through to the default would blame a server that
    // never answered, which is the same lie as telling somebody the product
    // was deleted when it was never created.
    case HELD_FOR_ADD:
      return 'espera a que se añada el producto'
    case 400:
    case 422:
      return 'el servidor no lo aceptó'
    case 401:
      return 'hubo que volver a entrar'
    case 403:
      return 'sin permiso en esa lista'
    case 404:
      return onAList ? 'la lista ya no existe' : 'el producto ya no existe'
    case 409:
      return onAList ? 'ya estaba en la lista' : 'la compra ya está archivada'
    default:
      return 'el servidor falló'
  }
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

const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/**
 * When it happened, as somebody would say it: «hoy 8:10», «ayer 19:42»,
 * «12 jul 19:42».
 *
 * `now` is a parameter so a test can build both ends from local date parts.
 * The unit suite runs at the machine's zone, not Madrid, so a date helper has
 * to be zone-less itself rather than lean on the Playwright pin.
 */
export function whenLabel(at: number, now: number): string {
  const then = new Date(at)
  const today = new Date(now)
  const time = `${then.getHours()}:${String(then.getMinutes()).padStart(2, '0')}`

  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime()
  const startOfThen = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  ).getTime()
  const daysBack = Math.round((startOfToday - startOfThen) / 86_400_000)

  if (daysBack === 0) return `hoy ${time}`
  if (daysBack === 1) return `ayer ${time}`
  return `${then.getDate()} ${MONTHS[then.getMonth()]} ${time}`
}

/** A row that was queued before the label existed still has to say something. */
export const UNLABELLED = 'Un cambio'

/**
 * Held on an add that is not here any more — landed and gone, or discarded.
 *
 * «espera a que se añada el producto» would be a promise nothing is left to
 * keep: there is no add in the sheet to carry this one, and sending it alone
 * only names a temp id again. So the row says the truth and carries no retry.
 */
export const ORPHANED = 'el producto no llegó a crearse'
