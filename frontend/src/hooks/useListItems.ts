import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  createItem,
  deleteItem,
  deletePrice,
  getListItems,
  getListMembers,
  getListUpdatedAt,
  logPrice,
  updateItem,
  updatePrice,
} from '../lib/api'
import { AVATAR_COLOURS } from '../mockData'
import type { ListItem, Member, ParsedInput, TagField } from '../types'

const DUPLICATE_TOAST = 'Ya está en la lista'

type Status = 'loading' | 'error' | 'success'

interface BackendMember {
  id: string
  user_id: string
  list_id: string
  display_name: string
  photo_url: string | null
  created_at: string
}

function toMember(m: BackendMember, index: number): Member {
  return {
    id: m.user_id,
    displayName: m.display_name,
    initial: m.display_name ? m.display_name[0].toUpperCase() : '?',
    colour: AVATAR_COLOURS[index % AVATAR_COLOURS.length],
    photoUrl: m.photo_url,
  }
}

export function useListItems(
  listId: string,
  getToken: () => Promise<string>,
  showToast: (msg: string) => void,
) {
  const [status, setStatus] = useState<Status>('loading')
  const [items, setItems] = useState<ListItem[]>([])
  const [members, setMembers] = useState<Map<string, Member>>(new Map())
  const lastUpdatedAt = useRef<string | null>(null)
  const itemsRef = useRef<ListItem[]>(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const fetchAll = useCallback(async () => {
    setStatus('loading')
    try {
      const [rawItems, rawMembers, updatedAtData] = await Promise.all([
        getListItems(getToken, listId) as Promise<ListItem[]>,
        getListMembers(getToken, listId) as Promise<BackendMember[]>,
        getListUpdatedAt(getToken, listId) as Promise<{ updated_at: string }>,
      ])
      setItems(rawItems)
      const map = new Map<string, Member>()
      rawMembers.forEach((m, i) => map.set(m.user_id, toMember(m, i)))
      setMembers(map)
      lastUpdatedAt.current = updatedAtData.updated_at
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }, [listId, getToken])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()
  }, [fetchAll])

  // 5-second polling: re-fetch items only when updated_at changes.
  // Skips requests while the tab is hidden to avoid unnecessary load;
  // triggers an immediate catch-up poll when the tab becomes visible again.
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const data = (await getListUpdatedAt(getToken, listId)) as {
          updated_at: string
        }
        if (
          lastUpdatedAt.current !== null &&
          data.updated_at !== lastUpdatedAt.current
        ) {
          const raw = (await getListItems(getToken, listId)) as ListItem[]
          setItems(raw)
        }
        lastUpdatedAt.current = data.updated_at
      } catch {
        // polling failures are silent
      }
    }

    const id = setInterval(poll, 5000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [listId, getToken])

  const togglePurchased = useCallback(
    async (itemId: string) => {
      const snapshot = itemsRef.current
      const targetItem = snapshot.find((i) => i.id === itemId)
      const prevPurchased = targetItem?.purchased ?? false

      // Prevent unpurchasing items purchased on a previous calendar day
      if (prevPurchased && targetItem?.purchased_at) {
        const purchasedDate = new Date(targetItem.purchased_at + 'Z')
        const today = new Date()
        const sameDay =
          purchasedDate.getFullYear() === today.getFullYear() &&
          purchasedDate.getMonth() === today.getMonth() &&
          purchasedDate.getDate() === today.getDate()
        if (!sameDay) {
          showToast('No se puede desmarcar un producto comprado en otro día')
          return
        }
      }

      const nowStr = !prevPurchased
        ? new Date().toISOString().slice(0, -1)
        : null
      setItems(
        snapshot.map((i) =>
          i.id === itemId
            ? {
                ...i,
                purchased: !prevPurchased,
                purchased_at: nowStr,
              }
            : i,
        ),
      )
      try {
        await updateItem(getToken, listId, itemId, {
          purchased: !prevPurchased,
        })
      } catch {
        setItems(snapshot)
        showToast('No se pudo actualizar el producto')
      }
    },
    [getToken, listId, showToast],
  )

  const addItem = useCallback(
    async (parsed: ParsedInput) => {
      const nameLower = parsed.name.trim().toLowerCase()
      const isDuplicate = itemsRef.current.some(
        (i) => !i.purchased && (i.name.trim().toLowerCase() === nameLower || (parsed.ean != null && i.ean === parsed.ean)),
      )
      if (isDuplicate) {
        showToast(DUPLICATE_TOAST)
        return
      }
      const tempId = `tmp-${Date.now()}`
      const temp: ListItem = {
        id: tempId,
        list_id: listId,
        name: parsed.name,
        quantity: parsed.quantity,
        brand: parsed.brand,
        stores: parsed.stores,
        purchased: false,
        purchased_at: null,
        ean: null,
        price: null,
        price_per: null,
        price_store: null,
        added_by: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setItems((prev) => {
        const firstPurchasedIdx = prev.findIndex((i) => i.purchased)
        if (firstPurchasedIdx === -1) return [...prev, temp]
        return [
          ...prev.slice(0, firstPurchasedIdx),
          temp,
          ...prev.slice(firstPurchasedIdx),
        ]
      })
      try {
        const created = (await createItem(getToken, listId, {
          name: parsed.name,
          quantity: parsed.quantity,
          brand: parsed.brand,
          stores: parsed.stores,
          ean: parsed.ean ?? null,
          price: null,
          price_per: null,
          price_store: null,
        })) as ListItem
        setItems((prev) => prev.map((i) => (i.id === tempId ? created : i)))
      } catch (err) {
        setItems((prev) => prev.filter((i) => i.id !== tempId))
        if (err instanceof ApiError && err.status === 409) {
          showToast(DUPLICATE_TOAST)
        } else {
          showToast('No se pudo añadir el producto')
        }
      }
    },
    [getToken, listId, showToast],
  )

  const updateTag = useCallback(
    async (itemId: string, field: TagField, value: string | null) => {
      const snapshot = itemsRef.current
      setItems(
        snapshot.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)),
      )
      try {
        await updateItem(getToken, listId, itemId, { [field]: value })
      } catch {
        setItems(snapshot)
        showToast('No se pudo actualizar el producto')
      }
    },
    [getToken, listId, showToast],
  )

  const updateStores = useCallback(
    async (itemId: string, stores: string[]) => {
      const snapshot = itemsRef.current
      setItems(snapshot.map((i) => (i.id === itemId ? { ...i, stores } : i)))
      try {
        await updateItem(getToken, listId, itemId, { stores })
      } catch {
        setItems(snapshot)
        showToast('No se pudo actualizar el producto')
      }
    },
    [getToken, listId, showToast],
  )

  const renameItem = useCallback(
    async (itemId: string, name: string) => {
      const snapshot = itemsRef.current
      setItems(snapshot.map((i) => (i.id === itemId ? { ...i, name } : i)))
      try {
        await updateItem(getToken, listId, itemId, { name })
      } catch {
        setItems(snapshot)
        showToast('No se pudo renombrar el producto')
      }
    },
    [getToken, listId, showToast],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      try {
        await deleteItem(getToken, listId, itemId)
        setItems((prev) => prev.filter((i) => i.id !== itemId))
      } catch {
        showToast('No se pudo eliminar el producto')
      }
    },
    [getToken, listId, showToast],
  )

  const savePrice = useCallback(
    async (
      itemId: string,
      amount: number,
      pricePer: 'KILOGRAM' | null,
      store: string | null,
    ) => {
      const item = itemsRef.current.find((i) => i.id === itemId)
      const payload = { amount, price_per: pricePer, store }
      const fn = item?.price != null ? updatePrice : logPrice
      await fn(getToken, listId, itemId, payload)
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, price: amount, price_per: pricePer, price_store: store }
            : i,
        ),
      )
    },
    [getToken, listId],
  )

  const clearItemPrice = useCallback(
    async (itemId: string) => {
      await deletePrice(getToken, listId, itemId)
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, price: null, price_per: null, price_store: null }
            : i,
        ),
      )
    },
    [getToken, listId],
  )

  return {
    status,
    items,
    members,
    togglePurchased,
    addItem,
    updateTag,
    updateStores,
    renameItem,
    removeItem,
    savePrice,
    clearItemPrice,
    retry: fetchAll,
  }
}
