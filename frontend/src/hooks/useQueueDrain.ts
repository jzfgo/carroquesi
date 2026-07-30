import { useCallback, useEffect, useRef, useState } from 'react'
import { closePurchase, createItem, deleteItem, updateItem } from '../lib/api'
import { isNetworkError } from '../lib/networkError'
import { getAll, remove } from '../lib/offlineQueue'
import type { ListItem, PurchaseClosePayload } from '../types'

interface Params {
  listId: string
  getToken: () => Promise<string>
  onDrained: () => void
  showToast: (msg: string) => void
}

export function useQueueDrain({
  listId,
  getToken,
  onDrained,
  showToast,
}: Params) {
  const [pendingCount, setPendingCount] = useState(0)

  const onDrainedRef = useRef(onDrained)
  const showToastRef = useRef(showToast)
  useEffect(() => {
    onDrainedRef.current = onDrained
  }, [onDrained])
  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])

  const refreshCount = useCallback(async () => {
    const ops = await getAll()
    setPendingCount(ops.filter((op) => op.listId === listId).length)
  }, [listId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCount()
    window.addEventListener('cqs:queue-changed', refreshCount)
    return () => window.removeEventListener('cqs:queue-changed', refreshCount)
  }, [refreshCount])

  const drain = useCallback(async () => {
    const ops = await getAll()
    const myOps = ops
      .filter((op) => op.listId === listId)
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)

    const tempIdMap = new Map<string, string>()
    let failures = 0
    let lostShops = 0

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
        await remove(op.id)
        failures++
        // A dropped row is one row, and it is still on screen. A dropped
        // close is the whole shop — the store, the date, every price typed
        // and everything added by hand — and after this it exists nowhere.
        // Counting it as "1 change" tells the household almost nothing about
        // what they just lost.
        if (op.type === 'closePurchase') lostShops++
      }
    }

    onDrainedRef.current()
    if (lostShops > 0) {
      // The shops are the bigger loss and get the sentence, but they must not
      // swallow the count of everything else that went with them. Two shops in
      // one evening is a case this app is built for, so two lost ones must not
      // read as one.
      const others = failures - lostShops
      const shops = lostShops === 1 ? 'una compra' : `${lostShops} compras`
      showToastRef.current(
        others > 0
          ? `No se pudo guardar ${shops}, ni ${others} ${
              others === 1 ? 'cambio más' : 'cambios más'
            }`
          : `No se pudo guardar ${shops}. Vuelve a cerrarla`,
      )
    } else if (failures > 0) {
      showToastRef.current(
        `${failures} ${failures === 1 ? 'cambio no se pudo' : 'cambios no se pudieron'} sincronizar`,
      )
    }
  }, [listId, getToken])

  useEffect(() => {
    if (navigator.onLine) void drain()
    const handleOnline = () => void drain()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [drain])

  return { pendingCount }
}
