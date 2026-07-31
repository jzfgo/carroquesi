/** What the server answered when it refused the write. */
export interface QueueFailure {
  status: number
  at: number
}

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

export async function enqueue(
  op: Omit<QueuedOp, 'id' | 'enqueuedAt'>,
): Promise<QueuedOp> {
  const full: QueuedOp = {
    ...op,
    id: crypto.randomUUID(),
    enqueuedAt: Date.now(),
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
