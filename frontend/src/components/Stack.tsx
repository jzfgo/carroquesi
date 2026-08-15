import { ChevronRight, Receipt } from 'lucide-react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useStack } from '../hooks/useStack'
import { searchPurchases } from '../lib/api'
import type { PurchaseSearchTrip } from '../types'
import './Stack.css'
import { TripCard } from './TripCard'

export interface StackHandle {
  /**
   * Re-read the first page. The parent calls this after a mutation that closed
   * or settled a trip, so the stack picks up the newly-closed trip without a
   * remount (the items list is a separate read with its own refresh).
   */
  refetch: () => void
}

interface Props {
  listId: string
  getToken: () => Promise<string>
  ref?: React.Ref<StackHandle>
  /** Re-buy a line back onto the pending list (wired: JAV-128). */
  onRebuy?: (purchaseId: string, itemId: string) => void
  /** Tap a line to act on it. For now this opens the item action sheet — the
   *  same one the pending rows use — so a closed record stays priceable. The
   *  redesigned product ficha (22a) takes over this tap later. */
  onOpenLine?: (itemId: string) => void
  /** Close a proto-ticket (10b). The second arg is the day it covered, so the
   *  close back-dates there instead of defaulting to today. */
  onCloseTrip?: (purchaseId: string, initialDate?: string) => void
  /** Save a ticket by hand (26a). */
  onSaveTicket?: () => void
  /** The in-list search (21b) reaches the stack too: with an active query the
   *  stack turns into a price-history view. Shared with the pending sheet's
   *  search — no separate state here. */
  query?: string
  searching?: boolean
  /** Whether this account can scan — the caller settles flag + consent.
   *  Gates only the dashed state of the 25b thumbnails; stored paper shows
   *  to every member. */
  receiptScan?: boolean
  /** Launch a scan from a card's dashed hole. */
  onScanReceipt?: () => void
}

// How many trips fold open below the latest before the rest slip behind the
// «Compras anteriores» door (matches frame 18a: one expanded, two folded).
const PREVIEW = 2

/**
 * The stack (18a): the list's past shops below the pending sheet. The latest
 * trip stands expanded — «la única que aún se corrige» — the next two folded,
 * and the older ones behind a board-written door. Tapping the door unfolds them
 * in place and pages more in as you scroll (Javier's call: an in-place infinite
 * scroll, not a separate archive screen). A last always-present door saves a
 * ticket by hand (26a); it is drawn here but wired in Lane 4.
 */
export function Stack({
  listId,
  getToken,
  ref,
  onRebuy,
  onOpenLine,
  onCloseTrip,
  onSaveTicket,
  query = '',
  searching = false,
  receiptScan = false,
  onScanReceipt,
}: Props) {
  const {
    trips,
    total,
    loading,
    hasMore,
    loadMore,
    refetch,
    loadItems,
    loadReceiptScans,
    loadReceiptFileUrl,
  } = useStack(listId, getToken)
  useImperativeHandle(ref, () => ({ refetch }), [refetch])
  const [unfolded, setUnfolded] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Search mode: the whole history is searched server-side (not just the loaded
  // pages), and the matched trips show force-expanded with only their matching
  // lines. Debounced like the pending sheet's cross-list lookup, and guarded so
  // a slow answer for an old query cannot overwrite a newer one.
  const trimmed = query.trim()
  const searchActive = searching && trimmed !== ''
  const [searchResults, setSearchResults] = useState<PurchaseSearchTrip[]>([])
  useEffect(() => {
    if (!searchActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale results when leaving search
      setSearchResults([])
      return
    }
    let cancelled = false
    const id = setTimeout(() => {
      void searchPurchases(getToken, listId, trimmed)
        .then((r) => {
          if (!cancelled) setSearchResults(r.results)
        })
        .catch(() => {
          if (!cancelled) setSearchResults([])
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [searchActive, trimmed, getToken, listId])

  // Once unfolded, a sentinel at the tail pulls the next page in as it nears
  // the viewport — the infinite scroll. Re-armed whenever the trigger inputs
  // change so a fresh page's sentinel is observed too.
  useEffect(() => {
    if (!unfolded || !hasMore) return
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [unfolded, hasMore, loadMore, trips.length])

  // In search mode the stack IS the results: matched trips force-expanded, each
  // showing only its matching lines, and no doors (neither «Compras anteriores»
  // nor «Guardar un ticket» belong to a search). Trips with no match are already
  // absent from the response.
  if (searchActive) {
    return (
      <section className="stack" aria-label="Resultados">
        {searchResults.map((r) => (
          <TripCard
            key={r.trip.id}
            trip={r.trip}
            matchingLines={r.lines}
            loadItems={loadItems}
            onRebuy={onRebuy}
            onOpenLine={onOpenLine}
          />
        ))}
      </section>
    )
  }

  const cardProps = {
    loadItems,
    onRebuy,
    onOpenLine,
    onCloseTrip,
    receiptScan,
    onScanReceipt,
    loadReceiptScans,
    loadReceiptFileUrl,
  }

  // The save-a-ticket door is always last and always present — even on a list
  // with no shops yet (JAV-158). The archive door only appears when trips sit
  // behind it.
  const saveDoor = (
    <button
      type="button"
      className="stack__door stack__door--action"
      onClick={() => onSaveTicket?.()}
    >
      <Receipt
        className="stack__door-icon"
        size={20}
        strokeWidth={1.8}
        aria-hidden
      />
      <span className="stack__door-text">
        <span className="stack__door-label">Guardar un ticket</span>
        <span className="stack__door-sub">
          De una compra que no apuntaste aquí
        </span>
      </span>
    </button>
  )

  if (loading) return null
  if (trips.length === 0) return <section className="stack">{saveDoor}</section>

  const [latest, ...older] = trips
  const preview = older.slice(0, PREVIEW)
  const rest = older.slice(PREVIEW)
  // Show the door only when it actually reveals something — the fetched trips
  // still behind it, or more pages to pull. Gating on `total` alone renders a
  // phantom door: `total` counts the open cart that the view filters out, so a
  // list with an open cart and exactly the preview's worth of trips would show
  // «anteriores · 1» that opens onto nothing.
  const showArchiveDoor = !unfolded && (rest.length > 0 || hasMore)
  // Its count: once every page is in, that is exactly the unshown trips; while
  // pages remain, total minus what's shown is the estimate (it can read one
  // high against an open cart, corrected the moment the last page lands).
  const behind = hasMore
    ? Math.max(rest.length, total - (1 + preview.length))
    : rest.length

  return (
    <section className="stack" aria-label="Compras">
      <TripCard trip={latest} defaultExpanded {...cardProps} />
      {preview.map((trip) => (
        <TripCard key={trip.id} trip={trip} {...cardProps} />
      ))}
      {unfolded &&
        rest.map((trip) => (
          <TripCard key={trip.id} trip={trip} {...cardProps} />
        ))}
      {unfolded && hasMore && (
        <div ref={sentinelRef} className="stack__sentinel" aria-hidden />
      )}

      {showArchiveDoor && (
        <button
          type="button"
          className="stack__door stack__door--nav"
          onClick={() => setUnfolded(true)}
        >
          <span className="stack__door-label stack__door-label--nav">
            Compras anteriores
          </span>
          <span className="stack__door-meta">
            <span className="stack__door-count">{behind}</span>
            <ChevronRight size={15} strokeWidth={1.8} aria-hidden />
          </span>
        </button>
      )}

      {saveDoor}
    </section>
  )
}
