import { useState, useEffect, useCallback, useRef } from 'react'
import type { ListItem, Member, ParsedInput } from '../types'
import {
  getListItems,
  getListMembers,
  getListUpdatedAt,
  createItem,
  updateItem,
} from '../lib/api'
import { AVATAR_COLOURS } from '../mockData'

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

  // 5-second polling: re-fetch items only when updated_at changes
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const data = (await getListUpdatedAt(getToken, listId)) as { updated_at: string }
        if (lastUpdatedAt.current !== null && data.updated_at !== lastUpdatedAt.current) {
          const raw = (await getListItems(getToken, listId)) as ListItem[]
          setItems(raw)
        }
        lastUpdatedAt.current = data.updated_at
      } catch {
        // polling failures are silent
      }
    }, 5000)
    return () => clearInterval(id)
  }, [listId, getToken])

  const togglePurchased = useCallback(
    async (itemId: string) => {
      const snapshot = itemsRef.current
      const prevPurchased = snapshot.find((i) => i.id === itemId)?.purchased ?? false
      setItems(snapshot.map((i) => (i.id === itemId ? { ...i, purchased: !prevPurchased } : i)))
      try {
        await updateItem(getToken, listId, itemId, { purchased: !prevPurchased })
      } catch {
        setItems(snapshot)
        showToast("Couldn't update item")
      }
    },
    [getToken, listId, showToast],
  )

  const addItem = useCallback(
    async (parsed: ParsedInput) => {
      const tempId = `tmp-${Date.now()}`
      const temp: ListItem = {
        id: tempId,
        list_id: listId,
        name: parsed.name,
        quantity: parsed.quantity,
        variety: parsed.variety,
        brand: parsed.brand,
        store: parsed.store,
        purchased: false,
        added_by: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setItems((prev) => [temp, ...prev])
      try {
        const created = (await createItem(getToken, listId, {
          name: parsed.name,
          quantity: parsed.quantity,
          variety: parsed.variety,
          brand: parsed.brand,
          store: parsed.store,
        })) as ListItem
        setItems((prev) => prev.map((i) => (i.id === tempId ? created : i)))
      } catch {
        setItems((prev) => prev.filter((i) => i.id !== tempId))
        showToast("Couldn't add item")
      }
    },
    [getToken, listId, showToast],
  )

  return { status, items, members, togglePurchased, addItem, retry: fetchAll }
}
