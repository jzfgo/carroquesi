import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  closePurchase,
  createItem,
  deleteItem,
  updateItem,
} from '../lib/api'
import { isNetworkError } from '../lib/networkError'
import {
  clearFailure,
  getAll,
  HELD_FOR_ADD,
  isTempId,
  markFailed,
  remove,
  targetsOf,
  type QueuedOp,
} from '../lib/offlineQueue'
import type { ListItem, PurchaseClosePayload } from '../types'
import type { ShowToast } from './useToast'

interface Params {
  listId: string
  getToken: () => Promise<string>
  onDrained: () => void
  showToast: ShowToast
  /** Opens «Cambios sin enviar». The miel toast is one of its two doors. */
  onShowRejected: () => void
}

/** The item a queued op is about, under whatever id the screen paints it. */
function opItemId(op: QueuedOp): string | null {
  if (op.tempId) return op.tempId
  const payload = op.payload as { itemId?: string } | null
  return payload?.itemId ?? null
}

/**
 * Whether this op points at something no add has created yet, in this pass or
 * any earlier one.
 *
 * Sending it anyway is not a harmless miss. An edit or a delete against a
 * `tmp-…` id is a clean 404 (`items.py` looks the id up and finds nothing),
 * and 404 is the one answer that means «el producto ya no existe» — false,
 * since it was never created, and permanent, since `isRetryable` reads a 404
 * as a fact about the data. The op reaches the sheet already unrecoverable,
 * where the guard written to rescue it never gets to see it.
 *
 * A close is worse than a 404. `purchases.py` skips a line whose item it
 * cannot find rather than refusing the call, so a close one line short comes
 * back 200: the trip is filed under a total covering items it never filed, and
 * the op is deleted as sent. Nothing anywhere would say so.
 */
function waitsOnAnAdd(op: QueuedOp, resolved: Map<string, string>): boolean {
  return targetsOf(op).some((id) => isTempId(id) && !resolved.has(id))
}

export function useQueueDrain({
  listId,
  getToken,
  onDrained,
  showToast,
  onShowRejected,
}: Params) {
  const [ops, setOps] = useState<QueuedOp[]>([])

  const onDrainedRef = useRef(onDrained)
  const showToastRef = useRef(showToast)
  const onShowRejectedRef = useRef(onShowRejected)
  useEffect(() => {
    onDrainedRef.current = onDrained
  }, [onDrained])
  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])
  useEffect(() => {
    onShowRejectedRef.current = onShowRejected
  }, [onShowRejected])

  const refreshOps = useCallback(async () => {
    const all = await getAll()
    setOps(all.filter((op) => op.listId === listId))
  }, [listId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshOps()
    window.addEventListener('cqs:queue-changed', refreshOps)
    return () => window.removeEventListener('cqs:queue-changed', refreshOps)
  }, [refreshOps])

  // Still going out. A refused op is not counted here and does not wear the
  // row dot: the band promises these will send themselves, and that one won't.
  const pending = useMemo(() => ops.filter((op) => !op.failure), [ops])
  const rejected = useMemo(() => ops.filter((op) => op.failure), [ops])

  const pendingItemIds = useMemo(() => {
    const ids = new Set<string>()
    for (const op of pending) {
      const id = opItemId(op)
      if (id) ids.add(id)
    }
    return ids
  }, [pending])

  // Drains run one at a time. Reconnecting while a retry is in flight would
  // otherwise send the same op twice, and the second send answers about a
  // change the first one already made.
  const chain = useRef<Promise<void>>(Promise.resolve())

  const runDrain = useCallback(async () => {
    const all = await getAll()
    const myOps = all
      .filter((op) => op.listId === listId && !op.failure)
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)

    const tempIdMap = new Map<string, string>()
    let failures = 0

    for (const op of myOps) {
      // Held, not sent. Its add failed earlier in this pass, or failed in an
      // earlier one and is sitting in the sheet — either way the id it names
      // is one the server has never seen. It is marked rather than left
      // pending because `discardRejected` only reaches what is marked: left
      // pending, throwing away the dead add would leave this behind for good,
      // counted in the band and shown nowhere.
      if (waitsOnAnAdd(op, tempIdMap)) {
        await markFailed(op.id, { status: HELD_FOR_ADD, at: Date.now() })
        failures++
        continue
      }
      try {
        if (op.type === 'addItem') {
          const p = op.payload as Parameters<typeof createItem>[2]
          const created = (await createItem(getToken, op.listId, p)) as ListItem
          if (op.tempId) tempIdMap.set(op.tempId, created.id)
        } else if (op.type === 'updateItem') {
          let p = op.payload as {
            itemId: string
            patch: Parameters<typeof updateItem>[3]
          }
          const realId = tempIdMap.get(p.itemId)
          if (realId) p = { ...p, itemId: realId }
          await updateItem(getToken, op.listId, p.itemId, p.patch)
        } else if (op.type === 'deleteItem') {
          let p = op.payload as { itemId: string }
          const realId = tempIdMap.get(p.itemId)
          if (realId) p = { ...p, itemId: realId }
          await deleteItem(getToken, op.listId, p.itemId)
        } else if (op.type === 'closePurchase') {
          const p = op.payload as PurchaseClosePayload
          // An item added offline is named by its temp id here, because the
          // sheet was closed before the add had ever reached the server.
          const lines = p.lines.map((line) => {
            const realId = tempIdMap.get(line.item_id)
            return realId ? { ...line, item_id: realId } : line
          })
          await closePurchase(getToken, op.listId, { ...p, lines })
        }
        await remove(op.id)
      } catch (err) {
        if (isNetworkError(err)) break
        // The write stays. Deleting it here is what used to turn a refusal
        // into a number in a notice that left after three seconds.
        await markFailed(op.id, {
          status: err instanceof ApiError ? err.status : 0,
          at: Date.now(),
        })
        failures++
      }
    }

    onDrainedRef.current()
    await refreshOps()
    if (failures > 0) {
      showToastRef.current(
        `${failures} ${failures === 1 ? 'cambio no se pudo' : 'cambios no se pudieron'} enviar`,
        {
          label: 'Ver cuáles',
          tone: 'miel',
          onAct: () => onShowRejectedRef.current(),
        },
      )
    }
  }, [listId, getToken, refreshOps])

  const drain = useCallback(() => {
    // `getAll` can fail on its own — IndexedDB is unavailable in some private
    // modes — and every caller either uses `void` or awaits from a `finally`.
    // An escaping rejection would be unhandled, and would leave `chain`
    // rejected for the next pass to inherit.
    chain.current = chain.current.then(runDrain, runDrain).catch(() => {})
    return chain.current
  }, [runDrain])

  useEffect(() => {
    if (navigator.onLine) void drain()
    const handleOnline = () => void drain()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [drain])

  /**
   * Send refused ops again.
   *
   * Retrying is a normal drain pass and never a second way to send one op.
   * `runDrain` builds the map from temp ids to real ones inside a single pass,
   * so an edit to something added offline is only correct when the add ran in
   * the same pass it did.
   */
  const retryRejected = useCallback(
    async (ids: string[]) => {
      // An add carries whatever was done to its row afterwards, even when the
      // sheet only asked for the add. Retrying it alone would land it and
      // delete it, and the edit behind it would be left naming a temp id
      // nothing can resolve — with its add gone, the sheet would no longer see
      // anything to wait for and would start offering a retry that can only
      // ever hold it again.
      //
      // Only an add has a tempId, so what it carries never carries anything in
      // turn. One level is the whole of it.
      const carried = new Set(ids)
      const adds = new Set(
        rejected
          .filter((op) => carried.has(op.id) && op.tempId)
          .map((op) => op.tempId as string),
      )
      if (adds.size > 0) {
        for (const op of rejected) {
          if (targetsOf(op).some((id) => adds.has(id))) carried.add(op.id)
        }
      }

      await Promise.all([...carried].map((id) => clearFailure(id)))
      await drain()
    },
    [rejected, drain],
  )

  const discardRejected = useCallback(async () => {
    await Promise.all(rejected.map((op) => remove(op.id)))
    await refreshOps()
  }, [rejected, refreshOps])

  return {
    pendingCount: pending.length,
    pendingItemIds,
    rejected,
    retryRejected,
    discardRejected,
  }
}
