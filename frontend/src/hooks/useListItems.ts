import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToastAction } from '../components/Toast'
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
import { itemState } from '../lib/itemState'
import { isNetworkError } from '../lib/networkError'
import { enqueue, newTempId } from '../lib/offlineQueue'
import { isRetryable } from '../lib/queueCopy'
import type { ListItem, Member, ParsedInput, TagField } from '../types'
import type { ShowToast } from './useToast'

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

/**
 * The control that closes a notice about something the user typed and lost —
 * where sending it again could end differently, and nothing where it could not.
 *
 * The rule lives here rather than at the six call sites because it is one rule.
 * Each site deciding a status at a time is how «Reintentar» ended up on a 404:
 * the item was deleted on another phone, this screen is up to five seconds
 * stale, and the tap lands on a row the server no longer has. Every press then
 * repeats the same request for the same answer, which is the definition of a
 * control known in advance to fail.
 *
 * Same `isRetryable` as «Cambios sin enviar», so the two screens cannot come to
 * different conclusions about the same status.
 */
function retryAction(err: unknown, onAct: () => void): ToastAction | undefined {
  const status = err instanceof ApiError ? err.status : 0
  return isRetryable(status)
    ? { label: 'Reintentar', tone: 'tomate', onAct }
    : undefined
}

/**
 * What to say when the server refused. «No se pudo …» is right for a failure;
 * these are not failures of the write but facts about the caller or the item,
 * and «Cambios sin enviar» already has the sentence for each.
 *
 * The **scope is per status, not per call site**, which is the thing worth
 * getting right here. A 403 is about the *list* and is true of every write; a
 * 404 means «el producto ya no existe» only where the write names a product —
 * on `addItem` the missing thing is the list. Excluding `addItem` wholesale
 * because of the 404 would have cost it the 403 it should have had, so the
 * two are asked separately.
 */
function refusalMessage(err: unknown, fallback: string): string {
  const status = err instanceof ApiError ? err.status : 0
  if (status === 403) return 'Sin permiso en esa lista'
  return fallback
}

/** `refusalMessage` plus the 404 only a write that names a product can say. */
function itemRefusal(err: unknown, fallback: string): string {
  const status = err instanceof ApiError ? err.status : 0
  if (status === 404) return 'El producto ya no existe'
  return refusalMessage(err, fallback)
}

export function useListItems(
  listId: string,
  getToken: () => Promise<string>,
  showToast: ShowToast,
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
      saveListCache(listId, { items: rawItems, members: rawMembers })
      setStatus('success')
    } catch {
      if (!cached) setStatus('error')
    }
  }, [listId, getToken])

  useEffect(() => {
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
    // Named so the undo can call the same mutation the tap did. A second write
    // path is how the reconcile guard gets bypassed, and nothing goes red.
    async function toggle(itemId: string) {
      const snapshot = itemsRef.current
      const targetItem = snapshot.find((i) => i.id === itemId)
      const prevPurchased = targetItem?.purchased ?? false

      // A filed purchase is a record, and records are not edited by tapping.
      // Same rule the backend's 409 enforces, and it lives in one place now.
      if (prevPurchased && targetItem && itemState(targetItem) !== 'cart') {
        showToast('No se puede desmarcar una compra ya archivada')
        return
      }

      // The tap instant, which only this device knows. Sent so that an offline
      // tap drained tomorrow morning still files into tonight's trip.
      const nowStr = !prevPurchased
        ? new Date().toISOString().slice(0, -1)
        : null
      const patch = prevPurchased
        ? { purchased: false }
        : { purchased: true, purchased_at: nowStr as string }

      setItems(
        snapshot.map((i) =>
          i.id === itemId
            ? {
                ...i,
                purchased: !prevPurchased,
                purchased_at: nowStr,
                // Unknown until the server says which trip it joined. Until
                // then itemState keeps it in the cart, which is the truth.
                purchase_id: null,
                purchase_ends_at: null,
                purchase_filed: false,
              }
            : i,
        ),
      )
      try {
        await updateItem(getToken, listId, itemId, patch)
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'updateItem',
            payload: { itemId, patch },
            label: targetItem?.name ?? '',
          })
        } else {
          setItems(snapshot)
          showToast(
            itemRefusal(err, 'No se pudo actualizar el producto'),
            retryAction(err, () => void toggle(itemId)),
          )
          return
        }
      }

      // The write has settled — the server answered, or the queue took it.
      // Only now is there anything to undo, and only now can the inverse not
      // overtake the write it reverses. Offline this still reads as instant,
      // because the queue is local.
      showToast(
        prevPurchased
          ? `Fuera del carro, ${targetItem?.name ?? ''}`
          : `En el carro, ${targetItem?.name ?? ''}`,
        { label: 'Deshacer', tone: 'verde', onAct: () => void toggle(itemId) },
      )
    },
    [getToken, listId, showToast],
  )

  const addItem = useCallback(
    async function add(parsed: ParsedInput) {
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
      const tempId = newTempId()
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
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'addItem',
            tempId,
            label: parsed.name,
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
            // Sending it again would be refused again for the same reason.
            showToast(DUPLICATE_TOAST)
          } else {
            showToast(
              refusalMessage(err, 'No se pudo añadir el producto'),
              retryAction(err, () => void add(parsed)),
            )
          }
        }
      }
    },
    [getToken, listId, showToast],
  )

  const updateTag = useCallback(
    async function tag(itemId: string, field: TagField, value: string | null) {
      const snapshot = itemsRef.current
      const name = snapshot.find((i) => i.id === itemId)?.name ?? ''
      setItems(
        snapshot.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)),
      )
      try {
        await updateItem(getToken, listId, itemId, { [field]: value })
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'updateItem',
            payload: { itemId, patch: { [field]: value } },
            label: name,
          })
        } else {
          setItems(snapshot)
          showToast(
            itemRefusal(err, 'No se pudo actualizar el producto'),
            retryAction(err, () => void tag(itemId, field, value)),
          )
        }
      }
    },
    [getToken, listId, showToast],
  )

  const updateStores = useCallback(
    async function setStores(itemId: string, stores: string[]) {
      const snapshot = itemsRef.current
      const name = snapshot.find((i) => i.id === itemId)?.name ?? ''
      setItems(snapshot.map((i) => (i.id === itemId ? { ...i, stores } : i)))
      try {
        await updateItem(getToken, listId, itemId, { stores })
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'updateItem',
            payload: { itemId, patch: { stores } },
            label: name,
          })
        } else {
          setItems(snapshot)
          showToast(
            itemRefusal(err, 'No se pudo actualizar el producto'),
            retryAction(err, () => void setStores(itemId, stores)),
          )
        }
      }
    },
    [getToken, listId, showToast],
  )

  const renameItem = useCallback(
    async function rename(itemId: string, name: string) {
      const snapshot = itemsRef.current
      setItems(snapshot.map((i) => (i.id === itemId ? { ...i, name } : i)))
      try {
        await updateItem(getToken, listId, itemId, { name })
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'updateItem',
            payload: { itemId, patch: { name } },
            // The name somebody typed, which is the one worth recognising in
            // the sheet even though the server never took it.
            label: name,
          })
        } else {
          setItems(snapshot)
          showToast(
            itemRefusal(err, 'No se pudo renombrar el producto'),
            retryAction(err, () => void rename(itemId, name)),
          )
        }
      }
    },
    [getToken, listId, showToast],
  )

  const removeItem = useCallback(
    async function remove(itemId: string) {
      const snapshot = itemsRef.current
      const name = snapshot.find((i) => i.id === itemId)?.name ?? ''
      setItems((prev) => prev.filter((i) => i.id !== itemId))
      try {
        await deleteItem(getToken, listId, itemId)
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({
            listId,
            type: 'deleteItem',
            payload: { itemId },
            label: name,
          })
        } else if (err instanceof ApiError && err.status === 404) {
          // Not a failure. The row is gone because somebody else deleted it,
          // which is what this tap asked for — so the optimistic removal
          // stands, and there is nothing to say. Restoring it and answering
          // «no se pudo eliminar» put back a product the household had already
          // got rid of, over a control that could only 404 again.
          //
          // `handleDeletePrice` has read a 404 delete as success since before
          // this phase; two answers to one status is the disagreement.
        } else if (err instanceof ApiError && err.status === 409) {
          // ItemDetailSheet already hides Eliminar for a filed item, so this
          // is the backstop for the race where the trip files (a receipt
          // scan, or "Cerrar compra") between render and tap.
          setItems(snapshot)
          showToast(
            'No se puede eliminar un producto de una compra ya archivada',
          )
        } else {
          setItems(snapshot)
          showToast(
            refusalMessage(err, 'No se pudo eliminar el producto'),
            retryAction(err, () => void remove(itemId)),
          )
        }
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
      purchasedQuantity?: string | null,
    ) => {
      const item = itemsRef.current.find((i) => i.id === itemId)
      const payload = { amount, price_per: pricePer, store }
      const fn = item?.price != null ? updatePrice : logPrice

      // Whichever verb the server will actually take, not the one this screen
      // guessed. The endpoint is split by state — `POST` is 409 «ya tiene
      // precio» and `PATCH` is 404 «todavía no tiene» — and the guess above is
      // made from a local copy the *previous* attempt may already have
      // invalidated: `logPrice` landing and the `purchased_quantity` call
      // below it failing leaves the server holding a price and this screen
      // without one, because `setItems` is under both.
      //
      // That is what the notice's «Reintentar» would then walk into. It would
      // POST again, 409 for good, and say «no se pudo guardar» about a price
      // the server has had all along — a control known in advance to fail, on
      // the one write somebody typed off a shelf. And it would never heal:
      // `_write_price` does not `_bump` the list, so the poll never refetches
      // and the local `price` stays null until the screen remounts.
      //
      // So the refusal is read as what it is — an answer about which verb was
      // wanted — and the write is repeated with the other one.
      //
      // This is not a second write against a server that said no. Both routes
      // are `_get_item_or_404` → one precondition → the *same* `_write_price`,
      // with the same body: two doors into one write, each guarding the state
      // the other one expects. `isRetryable` withholds a retry because an
      // identical request gets an identical answer, and this request is not
      // identical — it is the complement, named by the refusal itself («use
      // PATCH to update it»).
      //
      // Two things this accepts deliberately:
      //
      // The 409 was the only place this app could have noticed that another
      // phone priced the item first, and the fallback now overwrites it
      // without saying so. That is last-write-wins, which is what every other
      // field on this row already does, and the person is looking at the
      // number they just read off a shelf.
      //
      // `update_price` also answers 404 for an item that is simply *gone*
      // (`_get_item_or_404`), which is not an answer about the verb — and from
      // here the two are indistinguishable. It is safe only because
      // `create_price` runs that same lookup before its own guard, so the
      // fallback re-404s and the error surfaces unchanged. That is a
      // cross-file invariant with nothing on either side encoding it: if
      // `create_price` ever learns to create the item too, this becomes a
      // write against a precondition nobody checked.
      try {
        await fn(getToken, listId, itemId, payload)
      } catch (err) {
        const wrongVerb =
          err instanceof ApiError &&
          (fn === logPrice ? err.status === 409 : err.status === 404)
        if (!wrongVerb) throw err
        const other = fn === logPrice ? updatePrice : logPrice
        await other(getToken, listId, itemId, payload)
      }

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
