import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getPurchaseItems,
  getPurchases,
  getReceiptFileUrl,
  getReceiptScans,
} from '../lib/api'
import { isTripOpen } from '../lib/isTripOpen'
import type {
  ListItem,
  PurchaseSummary,
  ReceiptFileUrlResult,
  ReceiptScanSummary,
} from '../types'

const PAGE = 20

// The stack shows the list's past shops — closed trips and torn-off unwritten
// proto-tickets — newest first. The still-open cart is NOT the stack's: its
// lines live in the pending sheet's talón, so it is filtered out here.
//
// The open cart is the single row a list keeps un-closed (closed_at === null,
// the uq_purchases_open_per_list row), and then only while its tear-off is
// still ahead. A trip that HAS been closed is never the open cart, even when
// its closed_at is itself in the future: a manual/back-dated purchase carries
// closed_at = tears_off_at so it sorts under the day it covered (see
// create_manual_purchase), and for one dated today that boundary is tonight —
// future, but closed, so it belongs in the stack. Keying off closed_at ??
// tears_off_at instead would misread that record as the open cart and drop it.
function notOpenCart(trip: PurchaseSummary): boolean {
  return trip.closed_at != null || !isTripOpen(trip.tears_off_at)
}

export interface UseStack {
  trips: PurchaseSummary[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  loadMore: () => void
  /**
   * Re-read the first page in place, collapsing back to it. The stack is a
   * separate read from the item list, so a mutation that closes or settles a
   * trip must call this (alongside the items' `retry`) or the freshly-closed
   * trip never migrates from the open cart into the stack until a remount.
   */
  refetch: () => Promise<void>
  /** Lazily fetch one trip's lines, for an expanded / unfolded card. */
  loadItems: (purchaseId: string) => Promise<ListItem[]>
  /** Lazily fetch one trip's scans, for the header thumbnail (25b). */
  loadReceiptScans: (purchaseId: string) => Promise<ReceiptScanSummary[]>
  /** Mint a short-lived signed URL for one scan's stored file. */
  loadReceiptFileUrl: (scanId: string) => Promise<ReceiptFileUrlResult>
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

  // Apply a first-page result: reset the view to page 0 and re-align the paging
  // offset. Shared by the mount effect and the manual `refetch`.
  const applyFirstPage = useCallback(
    (page: { purchases: PurchaseSummary[]; total: number }) => {
      setTrips(page.purchases.filter(notOpenCart))
      setTotal(page.total)
      setOffset(page.purchases.length)
    },
    [],
  )

  // First page on mount / when the list changes. Only the async callbacks touch
  // state — the effect body stays side-effect-free — so `loading` simply rides
  // its initial `true` until the fetch settles.
  useEffect(() => {
    let cancelled = false
    fetchPage(0)
      .then((page) => {
        if (!cancelled) applyFirstPage(page)
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
  }, [fetchPage, applyFirstPage])

  // Re-read page 0 after a trip-changing mutation. No `loading` toggle: the
  // stack stays populated and refreshes under the caller's own pending UI,
  // rather than flashing the skeleton over content that is already on screen.
  // A failed refresh keeps the current view — the next mutation retries.
  const refetch = useCallback(
    () =>
      fetchPage(0)
        .then(applyFirstPage)
        .catch(() => {}),
    [fetchPage, applyFirstPage],
  )

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

  const loadReceiptScans = useCallback(
    (purchaseId: string) => getReceiptScans(getToken, listId, purchaseId),
    [getToken, listId],
  )

  const loadReceiptFileUrl = useCallback(
    (scanId: string) => getReceiptFileUrl(getToken, listId, scanId),
    [getToken, listId],
  )

  return {
    trips,
    total,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refetch,
    loadItems,
    loadReceiptScans,
    loadReceiptFileUrl,
  }
}
