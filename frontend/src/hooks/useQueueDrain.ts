import { useCallback, useEffect, useRef, useState } from 'react'
import { createItem, deleteItem, updateItem } from '../lib/api'
import { isNetworkError } from '../lib/networkError'
import { getAll, remove } from '../lib/offlineQueue'
import type { ListItem } from '../types'

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
        }
        await remove(op.id)
      } catch (err) {
        if (isNetworkError(err)) break
        await remove(op.id)
        failures++
      }
    }

    onDrainedRef.current()
    if (failures > 0) {
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
