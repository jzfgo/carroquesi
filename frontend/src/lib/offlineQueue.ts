import type { PurchaseClosePayload } from '../types'

/** What the server answered when it refused the write. */
export interface QueueFailure {
  status: number
  at: number
}

/**
 * Held rather than refused: this op points at something an add was supposed to
 * create, and that add has not landed. Nothing was sent, so no server said
 * anything about it.
 *
 * Outside the HTTP range deliberately — no response can ever carry it, so it
 * cannot collide with a status somebody has to read as one.
 */
export const HELD_FOR_ADD = -1

export interface QueuedOp {
  id: string
  listId: string
  tempId?: string
  type: 'addItem' | 'updateItem' | 'deleteItem' | 'closePurchase'
  payload: unknown
  enqueuedAt: number
  /**
   * What the change was about, in the household's words, captured when the op
   * is queued. It has to be captured here: by the time anyone reads the queue
   * back, the item the op names may not exist to be asked.
   */
  label: string
  /**
   * Set when the server refused this op. An op that carries one is not sent
   * again until somebody says so, and it is never deleted on its own.
   */
  failure?: QueueFailure
}

/**
 * The id an optimistic add paints its row under until the server answers with
 * a real one.
 *
 * Minted and recognised in one place on purpose. The drain has to be able to
 * ask "is this id one the server has never seen?" before it sends anything,
 * and a prefix invented at the call site and re-invented at the check is two
 * halves of one convention that nothing keeps in step.
 */
export function newTempId(): string {
  // Not the clock. Two temp ids that collide are load-bearing in three places
  // at once: the drain's `tempIdMap` would hand the second add's real id to
  // the first add's dependents, `strandedOn` would keep only one of the two,
  // and the optimistic row replacement would collapse both into one item — an
  // edit meant for «Pan» landing on «Leche», quietly and on the wrong row.
  //
  // A temp id is only ever compared for equality, never ordered, so it does
  // not need the stamp's sequence — and a random one cannot collide with an id
  // still sitting in the queue from a session whose clock read differently.
  return `tmp-${crypto.randomUUID()}`
}

export function isTempId(id: string): boolean {
  return id.startsWith('tmp-')
}

/**
 * The items an op points at — none for an add, one for an edit or a delete,
 * and every line of a close.
 *
 * An add is not in here: its temp id is what it *creates*, not what it needs
 * to already exist. That asymmetry is the whole reason this function exists,
 * and it is what lets the drain, the retry and the sheet all ask "what does
 * this op depend on?" and get the same answer.
 */
export function targetsOf(op: QueuedOp): string[] {
  switch (op.type) {
    case 'updateItem':
    case 'deleteItem': {
      const payload = op.payload as { itemId?: string } | null
      return payload?.itemId ? [payload.itemId] : []
    }
    case 'closePurchase':
      return (op.payload as PurchaseClosePayload).lines.map(
        (line) => line.item_id,
      )
    case 'addItem':
      return []
  }
}

const DB_NAME = 'cqs_offline'
const STORE_NAME = 'offline_ops'
// Adding fields to the stored objects is not a schema change: the store is
// keyed on `id` and holds whatever shape it is given. Bumping this would run
// onupgradeneeded again and createObjectStore would throw on the store that is
// already there.
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/**
 * The last stamp handed out, so no two ops in this session can share one.
 *
 * `enqueuedAt` is the only thing that orders the queue, and `getAll()` comes
 * back in key order — random UUIDs — so a tie is not resolved by insertion
 * order but arbitrarily. Two writes in the same millisecond is not exotic:
 * adding something and immediately correcting its name is one gesture to the
 * person doing it, and inverting those two sends an edit against an id its own
 * add has not created yet.
 *
 * The drift this buys is usually a millisecond, and after `seedStamp` has
 * carried a backwards clock across a reload it can be much more: the first new
 * op takes the old maximum plus one, so «hoy 8:10» may read as «ayer 20:15»
 * for a change made a minute ago. That is the trade taken deliberately —
 * `whenLabel` being a few hours out is a wrong caption, and the order being
 * wrong is a write sent against an id its own add has not created yet.
 */
let lastStamp = 0

function stamp(): number {
  const now = Date.now()
  lastStamp = now > lastStamp ? now : lastStamp + 1
  return lastStamp
}

/**
 * Carry the order across a reload, once, before the first new op is stamped.
 *
 * `lastStamp` starts at 0 on every load, so without this the sequence is only
 * monotonic within a session and the wall clock decides again across one. A
 * clock that steps *backwards* between loads — an NTP correction on a phone
 * that booted wrong — would then stamp an edit before the add it depends on,
 * and the drain would hold that edit while its add lands and leaves.
 *
 * Kept as a promise rather than a flag so two enqueues racing on first use
 * both wait for the same read instead of one stamping ahead of it.
 */
let seeding: Promise<void> | null = null

function seedStamp(): Promise<void> {
  seeding ??= getAll()
    .then((all) => {
      for (const op of all) {
        if (op.enqueuedAt > lastStamp) lastStamp = op.enqueuedAt
      }
    })
    // An unreadable store is the drain's problem to report, not a reason to
    // refuse the write that is being queued right now. Clearing the cache is
    // what keeps one bad read from being the answer for the rest of the
    // session: the session that needs the seed is the one whose clock is
    // wrong, and it would go unseeded for good.
    .catch(() => {
      seeding = null
    })
  return seeding
}

export async function enqueue(
  op: Omit<QueuedOp, 'id' | 'enqueuedAt'>,
): Promise<QueuedOp> {
  await seedStamp()
  const full: QueuedOp = {
    ...op,
    id: crypto.randomUUID(),
    enqueuedAt: stamp(),
  }
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(full)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  window.dispatchEvent(new CustomEvent('cqs:queue-changed'))
  return full
}

export async function getAll(): Promise<QueuedOp[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result as QueuedOp[])
    req.onerror = () => reject(req.error)
  })
}

export async function remove(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  window.dispatchEvent(new CustomEvent('cqs:queue-changed'))
}

/**
 * Record that the server refused this op, keeping it in the store.
 *
 * The op used to be deleted here, which is how a rejected write became a
 * number in a toast and nothing else.
 */
export async function markFailed(
  id: string,
  failure: QueueFailure,
): Promise<void> {
  await patchOp(id, (op) => ({ ...op, failure }))
}

/**
 * Write a landed add's real id into every op that was waiting for it.
 *
 * The drain's temp-id map lives for one pass and in memory; removing the add
 * that filled it is durable. So a pass that ends in between — the connection
 * dropping, or the very next op coming back 500 and waiting in the sheet —
 * leaves those ops naming an id whose add has *already landed*. The next pass
 * finds nothing to resolve it with, holds them, and the sheet says the product
 * was never created, which by then is false.
 *
 * Making the resolution as durable as the removal is what keeps
 * `waitsOnAnAdd` true only of an add that genuinely has not landed.
 */
export async function resolveTempId(
  tempId: string,
  realId: string,
): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const read = store.getAll()
    read.onsuccess = () => {
      for (const op of read.result as QueuedOp[]) {
        const rewritten = withRealId(op, tempId, realId)
        if (rewritten) store.put(rewritten)
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  window.dispatchEvent(new CustomEvent('cqs:queue-changed'))
}

/** The same fields `targetsOf` reads, written back. Null when none match. */
function withRealId(
  op: QueuedOp,
  tempId: string,
  realId: string,
): QueuedOp | null {
  if (!targetsOf(op).includes(tempId)) return null

  const rewritten = rewriteTarget(op, tempId, realId)
  if (!rewritten) return null

  // A hold whose only reason was the unresolved id has just had that reason
  // removed, so it goes with it. Left on, the op would be read as *orphaned*
  // the moment the rewrite stopped `targetsOf` returning a temp id — terminal,
  // and «el producto no llegó a crearse» about one that now exists.
  //
  // Asked of the *rewritten* op, because «only reason» is a claim about all of
  // them and a close names one id per line. Resolving one of two and lifting
  // the hold anyway produces an op that is pending and unsendable at once: the
  // band counts it and promises «se enviarán solos» about something that can
  // never go, `discardRejected` cannot reach it because it is no longer
  // marked, and every later pass holds it again and counts it again — a toast
  // saying «1 cambio no se pudo enviar» about a change that was already there.
  if (
    op.failure?.status === HELD_FOR_ADD &&
    !targetsOf(rewritten).some(isTempId)
  ) {
    delete rewritten.failure
  }
  return rewritten
}

/** The rewrite itself, with the failure left exactly as it was found. */
function rewriteTarget(
  op: QueuedOp,
  tempId: string,
  realId: string,
): QueuedOp | null {
  switch (op.type) {
    case 'updateItem':
    case 'deleteItem': {
      const payload = op.payload as { itemId: string }
      return { ...op, payload: { ...payload, itemId: realId } }
    }
    case 'closePurchase': {
      const payload = op.payload as PurchaseClosePayload
      return {
        ...op,
        payload: {
          ...payload,
          lines: payload.lines.map((line) =>
            line.item_id === tempId ? { ...line, item_id: realId } : line,
          ),
        },
      }
    }
    // Unreachable: targetsOf answers «nothing» for an add, so the guard in
    // `withRealId` has already returned. Answered anyway rather than left to
    // fall through.
    case 'addItem':
      return null
  }
}

/** Make the op sendable again, so the next drain picks it up. */
export async function clearFailure(id: string): Promise<void> {
  await patchOp(id, (op) => {
    const next = { ...op }
    delete next.failure
    return next
  })
}

async function patchOp(
  id: string,
  change: (op: QueuedOp) => QueuedOp,
): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const read = store.get(id)
    read.onsuccess = () => {
      const op = read.result as QueuedOp | undefined
      // Gone already — drained, or discarded from the sheet while this was in
      // flight. Nothing to write back, and inventing the row would resurrect a
      // change the household has already dealt with.
      if (op) store.put(change(op))
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  window.dispatchEvent(new CustomEvent('cqs:queue-changed'))
}
