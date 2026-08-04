import { useCallback, useEffect, useRef, useState } from 'react'
import { getPurchaseItems, getPurchases } from '../lib/api'
import { isTripOpen } from '../lib/isTripOpen'
import type { ListItem, PurchaseSummary } from '../types'

const PAGE = 20

// The stack shows the list's past shops — closed trips and torn-off unwritten
// proto-tickets — newest first. The still-open cart is NOT the stack's: its
// lines live in the pending sheet's talón, so it is filtered out here. A trip
// is the open cart iff its boundary (closed_at ?? tears_off_at) is still in the
// future, which is exactly what isTripOpen answers.
function notOpenCart(trip: PurchaseSummary): boolean {
  return !isTripOpen(trip.closed_at ?? trip.tears_off_at)
}

export interface UseStack {
  trips: PurchaseSummary[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  /** Lazily fetch one trip's lines, for an expanded / unfolded card. */
  loadItems: (purchaseId: string) => Promise<ListItem[]>
}

export function useStack(
  listId: string,
  getToken: () => Promise<string>,
): UseStack {
  const [trips, setTrips] = useState<PurchaseSummary[]>([])
  const [total, setTotal] = useState(0)
  // Raw rows consumed from the server (open cart included), so paging stays
  // aligned with the server's offset even though the cart is filtered from view.
  // State, not a ref, because `hasMore` reads it during render.
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const inFlight = useRef(false)

  const fetchPage = useCallback(
    (at: number) => getPurchases(getToken, listId, { offset: at, limit: PAGE }),
    [getToken, listId],
  )

  // First page on mount / when the list changes. Only the async callbacks touch
  // state — the effect body stays side-effect-free — so `loading` simply rides
  // its initial `true` until the fetch settles.
  useEffect(() => {
    let cancelled = false
    fetchPage(0)
      .then((page) => {
        if (cancelled) return
        setTrips(page.purchases.filter(notOpenCart))
        setTotal(page.total)
        setOffset(page.purchases.length)
      })
      .catch(() => {
        if (!cancelled) setTrips([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchPage])

  const hasMore = offset < total

  const loadMore = useCallback(() => {
    if (inFlight.current || offset >= total) return
    inFlight.current = true
    setLoadingMore(true)
    fetchPage(offset)
      .then((page) => {
        setTrips((prev) => [...prev, ...page.purchases.filter(notOpenCart)])
        setTotal(page.total)
        setOffset((prev) => prev + page.purchases.length)
      })
      .catch(() => {
        /* a failed page just stops the scroll; the next trigger retries */
      })
      .finally(() => {
        inFlight.current = false
        setLoadingMore(false)
      })
  }, [fetchPage, offset, total])

  const loadItems = useCallback(
    (purchaseId: string) => getPurchaseItems(getToken, listId, purchaseId),
    [getToken, listId],
  )

  return { trips, total, loading, loadingMore, hasMore, loadMore, loadItems }
}
