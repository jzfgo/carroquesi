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
  markFailed,
  remove,
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
    chain.current = chain.current.then(runDrain, runDrain)
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
      await Promise.all(ids.map((id) => clearFailure(id)))
      await drain()
    },
    [drain],
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
