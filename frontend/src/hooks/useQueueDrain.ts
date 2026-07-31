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
  resolveTempId,
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

  // Which read is the newest. Every remove, markFailed, clearFailure and
  // resolveTempId announces itself, so one drain starts a handful of these,
  // each on its own connection — and IndexedDB promises nothing about the
  // order separate connections settle in. Without this the snapshot that lands
  // last need not be the one taken last, and `ops` is what the band's count,
  // the row dots and the sheet's rows are all read from. The tail is where it
  // sticks: `discardRejected` fires its removals and then waits for one
  // refresh, so a stale read landing last leaves the sheet showing rows that
  // are gone, with nothing further coming to correct it.
  const reads = useRef(0)

  const refreshOps = useCallback(async () => {
    const mine = ++reads.current
    const all = await getAll()
    if (mine !== reads.current) return
    setOps(all.filter((op) => op.listId === listId))
  }, [listId])

  useEffect(() => {
    // The event system drops whatever a listener returns, so an async one that
    // rejects is an unhandled rejection on every queue event. Same shape as
    // the drain's own catch, one call site over.
    const onQueueChanged = () => {
      refreshOps().catch((err) =>
        console.warn('offline queue could not be read', err),
      )
    }
    onQueueChanged()
    window.addEventListener('cqs:queue-changed', onQueueChanged)
    return () => window.removeEventListener('cqs:queue-changed', onQueueChanged)
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
      // Whether the server has it. Everything after this point in the `try` is
      // local bookkeeping, and a store that fails there must not be reported
      // as a refusal — see the catch.
      let sent = false
      try {
        if (op.type === 'addItem') {
          const p = op.payload as Parameters<typeof createItem>[2]
          const created = (await createItem(getToken, op.listId, p)) as ListItem
          sent = true
          if (op.tempId) {
            tempIdMap.set(op.tempId, created.id)
            // The map covers the ops already read into this pass; the store
            // has to be told too, or a pass that ends before they are sent
            // leaves them naming an id whose add has landed and gone.
            await resolveTempId(op.tempId, created.id)
          }
        } else if (op.type === 'updateItem') {
          let p = op.payload as {
            itemId: string
            patch: Parameters<typeof updateItem>[3]
          }
          const realId = tempIdMap.get(p.itemId)
          if (realId) p = { ...p, itemId: realId }
          await updateItem(getToken, op.listId, p.itemId, p.patch)
          sent = true
        } else if (op.type === 'deleteItem') {
          let p = op.payload as { itemId: string }
          const realId = tempIdMap.get(p.itemId)
          if (realId) p = { ...p, itemId: realId }
          // A 404 is not a refusal here, for the same reason it is not one on
          // the online path: the row is gone, which is exactly what the tap
          // asked for. Somebody deletes a product in the shop with no signal,
          // a flatmate deletes the same one from home, and on reconnect this
          // answers 404 — nothing failed, and both are agreed.
          //
          // Called a refusal it is worse here than it ever was on a toast:
          // `isRetryable(404)` is false and `failureCause` reads «el producto
          // ya no existe», so the sheet holds a terminal row whose only door
          // is «Descartarlos» — a lost write reported, counted in the band,
          // and left for the household to dismiss by hand. A toast at least
          // leaves after six seconds.
          try {
            await deleteItem(getToken, op.listId, p.itemId)
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 404)) throw err
          }
          sent = true
        } else if (op.type === 'closePurchase') {
          const p = op.payload as PurchaseClosePayload
          // An item added offline is named by its temp id here, because the
          // sheet was closed before the add had ever reached the server.
          const lines = p.lines.map((line) => {
            const realId = tempIdMap.get(line.item_id)
            return realId ? { ...line, item_id: realId } : line
          })
          await closePurchase(getToken, op.listId, { ...p, lines })
          sent = true
        }
        await remove(op.id)
      } catch (err) {
        // The server took it and the store could not record that. Calling it a
        // refusal would be false twice over: «el servidor falló» about a write
        // the server accepted, and a «Reintentar» whose only effect is to send
        // it again — a second row on the list, or a second trip filed under
        // the same total, which the duplicate guard cannot catch because by
        // then the list genuinely does contain it.
        //
        // The op stays pending, so a later pass will re-send it and can still
        // duplicate. Closing that needs an idempotency key the API does not
        // have; what this stops is the app *inviting* the duplicate through a
        // button, and counting a landed write among the failures.
        if (sent) {
          console.warn('offline queue could not record a sent write', err)
          continue
        }
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
    chain.current = chain.current.then(runDrain, runDrain).catch((err) => {
      // Swallowing the rejection is right; swallowing the reason is not. A
      // store that cannot be opened at all shows nothing anywhere — the loud
      // failure on `enqueue` covers the write path and not this one — so at
      // least leave a trace of why the queue stopped moving.
      console.warn('offline queue drain failed', err)
    })
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
