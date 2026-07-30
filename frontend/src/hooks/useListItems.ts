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
import { AVATAR_COLORS } from '../lib/avatarColors'
import { isNetworkError } from '../lib/networkError'
import { enqueue } from '../lib/offlineQueue'
import { reconcileItems } from '../lib/reconcileItems'
import type {
  BackendMember,
  ListItem,
  Member,
  ParsedInput,
  TagField,
} from '../types'

const DUPLICATE_TOAST = 'Ya está en la lista'

type Status = 'loading' | 'error' | 'success'

function toMember(m: BackendMember, index: number): Member {
  return {
    id: m.user_id,
    displayName: m.display_name,
    initial: m.display_name ? m.display_name[0].toUpperCase() : '?',
    color: AVATAR_COLORS[index % AVATAR_COLORS.length],
    photoUrl: m.photo_url,
  }
}

function loadListCache(
  listId: string,
): { items: ListItem[]; members: BackendMember[] } | null {
  try {
    const raw = localStorage.getItem(`cqs_list_cache_${listId}`)
    return raw
      ? (JSON.parse(raw) as { items: ListItem[]; members: BackendMember[] })
      : null
  } catch {
    return null
  }
}

function saveListCache(
  listId: string,
  data: { items: ListItem[]; members: BackendMember[] },
) {
  try {
    localStorage.setItem(`cqs_list_cache_${listId}`, JSON.stringify(data))
  } catch {
    /* storage unavailable */
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

  // A read that is in flight while the user writes carries the list from
  // before that write, so painting the response whole would undo the write on
  // screen. Every write stamps its item with a counter and every read
  // remembers the counter it started at; an item stamped later than that keeps
  // its local value when the read lands.
  //
  // A write that paints first stamps twice: once when the item changes on
  // screen and once when the server answers. Between the two the server may or
  // may not have applied it, so a read that started in that window cannot be
  // trusted for that item either.
  //
  // Stamps name the list as well as the item. Opening a list from a push tap
  // only changes the route parameter, so this hook stays mounted and the items
  // of the list left behind are still in state when the new list is read. A
  // stamp that named the item alone would keep one of them, putting a row from
  // another list on screen and into the new list's cache.
  const writeClock = useRef(0)
  const writtenAt = useRef(new Map<string, number>())
  const cachedMembers = useRef<{
    listId: string
    members: BackendMember[]
  } | null>(null)
  const rereadOnNextPoll = useRef(false)

  const markWritten = useCallback(
    (...itemIds: string[]) => {
      writeClock.current += 1
      for (const id of itemIds) {
        writtenAt.current.set(`${listId}:${id}`, writeClock.current)
      }
    },
    [listId],
  )

  const beginRead = useCallback(() => {
    const startedAt = writeClock.current
    return (itemId: string) =>
      (writtenAt.current.get(`${listId}:${itemId}`) ?? 0) > startedAt
  }, [listId])

  const fetchAll = useCallback(async () => {
    const cached = loadListCache(listId)
    if (cached) {
      const map = new Map<string, Member>()
      cached.members.forEach((m, i) => map.set(m.user_id, toMember(m, i)))
      setItems(cached.items)
      setMembers(map)
      setStatus('success')
    } else {
      setStatus('loading')
    }
    const clockAtStart = writeClock.current
    const isLocallyNewer = beginRead()
    try {
      const [rawItems, rawMembers, updatedAtData] = await Promise.all([
        getListItems(getToken, listId) as Promise<ListItem[]>,
        getListMembers(getToken, listId) as Promise<BackendMember[]>,
        getListUpdatedAt(getToken, listId) as Promise<{ updated_at: string }>,
      ])
      setItems((prev) => reconcileItems(rawItems, prev, isLocallyNewer))
      const map = new Map<string, Member>()
      rawMembers.forEach((m, i) => map.set(m.user_id, toMember(m, i)))
      setMembers(map)
      lastUpdatedAt.current = updatedAtData.updated_at
      // The merge keeps the whole item, so a change another shopper made to one
      // the user also wrote goes with it. The timestamp cannot be trusted to
      // bring it back — it may already cover the write — so ask the next poll
      // to read again. By then the write has settled and the server wins.
      if (writeClock.current !== clockAtStart) rereadOnNextPoll.current = true
      cachedMembers.current = { listId, members: rawMembers }
      setStatus('success')
    } catch {
      if (!cached) setStatus('error')
    }
  }, [listId, getToken, beginRead])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll()
  }, [fetchAll])

  // The next open paints this cache before the network answers, so it has to
  // hold what is on screen, writes included. Saving the read instead would put
  // a write the read raced back on screen for a moment.
  //
  // Save only once both halves are known to belong to the list in the URL.
  // Switching lists changes listId a render before the new items arrive, and a
  // read that fails leaves the previous list's members behind, so each half
  // has to say which list it came from or the other list lands under this key.
  useEffect(() => {
    const cached = cachedMembers.current
    const itemsAreThisList = items.every((i) => i.list_id === listId)
    if (cached?.listId === listId && itemsAreThisList) {
      saveListCache(listId, { items, members: cached.members })
    }
  }, [items, listId])

  // 5-second polling: re-fetch items only when updated_at changes.
  // Skips requests while the tab is hidden to avoid unnecessary load;
  // triggers an immediate catch-up poll when the tab becomes visible again.
  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState === 'hidden') return
      const clockAtStart = writeClock.current
      const isLocallyNewer = beginRead()
      try {
        const data = (await getListUpdatedAt(getToken, listId)) as {
          updated_at: string
        }
        const changed =
          lastUpdatedAt.current !== null &&
          data.updated_at !== lastUpdatedAt.current
        if (changed || rereadOnNextPoll.current) {
          const raw = (await getListItems(getToken, listId)) as ListItem[]
          setItems((prev) => reconcileItems(raw, prev, isLocallyNewer))
          // Settled only once a read has landed and nothing raced it. A read
          // that failed leaves the request standing, and one a write raced
          // renews it — the poll drops the same changes fetchAll does, because
          // a write already in flight can settle inside its own read.
          rereadOnNextPoll.current = writeClock.current !== clockAtStart
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
  }, [listId, getToken, beginRead])

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
      markWritten(itemId)
      try {
        await updateItem(getToken, listId, itemId, {
          purchased: !prevPurchased,
        })
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'updateItem',
            payload: { itemId, patch: { purchased: !prevPurchased } },
          })
        } else {
          setItems(snapshot)
          showToast('No se pudo actualizar el producto')
        }
      } finally {
        markWritten(itemId)
      }
    },
    [getToken, listId, showToast, markWritten],
  )

  const addItem = useCallback(
    async (parsed: ParsedInput) => {
      const nameLower = parsed.name.trim().toLowerCase()
      const isDuplicate = itemsRef.current.some(
        (i) =>
          !i.purchased &&
          (i.name.trim().toLowerCase() === nameLower ||
            (parsed.ean != null && i.ean === parsed.ean)),
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
      markWritten(tempId)
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
        // A read that landed while this was in flight may already carry the
        // created item, so drop that copy before the temporary row becomes it.
        setItems((prev) =>
          prev
            .filter((i) => i.id !== created.id)
            .map((i) => (i.id === tempId ? created : i)),
        )
        // The item carries a new id from here on, so stamp both: a read that
        // predates the swap knows it only by the temporary one.
        markWritten(tempId, created.id)
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'addItem',
            tempId,
            payload: {
              name: parsed.name,
              quantity: parsed.quantity,
              brand: parsed.brand,
              stores: parsed.stores,
              ean: parsed.ean ?? null,
              price: null,
              price_per: null,
              price_store: null,
            },
          })
        } else {
          setItems((prev) => prev.filter((i) => i.id !== tempId))
          if (err instanceof ApiError && err.status === 409) {
            showToast(DUPLICATE_TOAST)
          } else {
            showToast('No se pudo añadir el producto')
          }
        }
        markWritten(tempId)
      }
    },
    [getToken, listId, showToast, markWritten],
  )

  const updateTag = useCallback(
    async (itemId: string, field: TagField, value: string | null) => {
      const snapshot = itemsRef.current
      setItems(
        snapshot.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)),
      )
      markWritten(itemId)
      try {
        await updateItem(getToken, listId, itemId, { [field]: value })
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'updateItem',
            payload: { itemId, patch: { [field]: value } },
          })
        } else {
          setItems(snapshot)
          showToast('No se pudo actualizar el producto')
        }
      } finally {
        markWritten(itemId)
      }
    },
    [getToken, listId, showToast, markWritten],
  )

  const updateStores = useCallback(
    async (itemId: string, stores: string[]) => {
      const snapshot = itemsRef.current
      setItems(snapshot.map((i) => (i.id === itemId ? { ...i, stores } : i)))
      markWritten(itemId)
      try {
        await updateItem(getToken, listId, itemId, { stores })
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'updateItem',
            payload: { itemId, patch: { stores } },
          })
        } else {
          setItems(snapshot)
          showToast('No se pudo actualizar el producto')
        }
      } finally {
        markWritten(itemId)
      }
    },
    [getToken, listId, showToast, markWritten],
  )

  const renameItem = useCallback(
    async (itemId: string, name: string) => {
      const snapshot = itemsRef.current
      setItems(snapshot.map((i) => (i.id === itemId ? { ...i, name } : i)))
      markWritten(itemId)
      try {
        await updateItem(getToken, listId, itemId, { name })
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'updateItem',
            payload: { itemId, patch: { name } },
          })
        } else {
          setItems(snapshot)
          showToast('No se pudo renombrar el producto')
        }
      } finally {
        markWritten(itemId)
      }
    },
    [getToken, listId, showToast, markWritten],
  )

  const removeItem = useCallback(
    async (itemId: string) => {
      const snapshot = itemsRef.current
      setItems((prev) => prev.filter((i) => i.id !== itemId))
      markWritten(itemId)
      try {
        await deleteItem(getToken, listId, itemId)
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ listId, type: 'deleteItem', payload: { itemId } })
        } else {
          setItems(snapshot)
          showToast('No se pudo eliminar el producto')
        }
      } finally {
        markWritten(itemId)
      }
    },
    [getToken, listId, showToast, markWritten],
  )

  const savePrice = useCallback(
    async (
      itemId: string,
      amount: number,
      pricePer: 'KILOGRAM' | null,
      store: string | null,
      purchasedQuantity?: string | null,
    ) => {
      const item = itemsRef.current.find((i) => i.id === itemId)
      const payload = { amount, price_per: pricePer, store }
      const fn = item?.price != null ? updatePrice : logPrice
      await fn(getToken, listId, itemId, payload)

      if (purchasedQuantity !== undefined) {
        await updateItem(getToken, listId, itemId, {
          purchased_quantity: purchasedQuantity,
        })
      }

      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? {
                ...i,
                price: amount,
                price_per: pricePer,
                price_store: store,
                ...(purchasedQuantity !== undefined
                  ? { purchased_quantity: purchasedQuantity }
                  : {}),
              }
            : i,
        ),
      )
      // These two send to the server before they paint, so one stamp is
      // enough: by the time a later read starts, the server already answered.
      markWritten(itemId)
    },
    [getToken, listId, markWritten],
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
      markWritten(itemId)
    },
    [getToken, listId, markWritten],
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
