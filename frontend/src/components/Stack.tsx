import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStack } from '../hooks/useStack'
import './Stack.css'
import { TripCard } from './TripCard'

interface Props {
  listId: string
  getToken: () => Promise<string>
  /** Re-buy a line back onto the pending list (wired: JAV-128). */
  onRebuy?: (purchaseId: string, itemId: string) => void
  /** Tap a line to act on it. For now this opens the item action sheet — the
   *  same one the pending rows use — so a closed record stays priceable. The
   *  redesigned product ficha (22a) takes over this tap later. */
  onOpenLine?: (itemId: string) => void
  /** Close a proto-ticket (10b) — wired in Lane 2 (JAV-160). */
  onCloseTrip?: (purchaseId: string) => void
  /** Save a ticket by hand (26a) — wired in Lane 4 (JAV-163). */
  onSaveTicket?: () => void
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
  onRebuy,
  onOpenLine,
  onCloseTrip,
  onSaveTicket,
}: Props) {
  const { trips, total, loading, hasMore, loadMore, loadItems } = useStack(
    listId,
    getToken,
  )
  const [unfolded, setUnfolded] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

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

  const cardProps = { loadItems, onRebuy, onOpenLine, onCloseTrip }

  // The save-a-ticket door is always last and always present — even on a list
  // with no shops yet (JAV-158). The archive door only appears when trips sit
  // behind it.
  const saveDoor = (
    <button
      type="button"
      className="stack__door stack__door--action"
      onClick={() => onSaveTicket?.()}
    >
      <span className="stack__door-label">Guardar un ticket</span>
      <span className="stack__door-sub">
        De una compra que no apuntaste aquí
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
