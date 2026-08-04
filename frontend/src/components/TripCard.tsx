import { ChevronDown, Stamp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRowAmount } from '../lib/formatPrice'
import { tripDateLabel } from '../lib/itemCost'
import type { ListItem, PurchaseSummary } from '../types'
import { ItemCard } from './ItemCard'
import './TripCard.css'

interface Props {
  trip: PurchaseSummary
  /** The latest trip opens expanded — «la única que aún se corrige». */
  defaultExpanded?: boolean
  loadItems: (purchaseId: string) => Promise<ListItem[]>
  /** Re-buy a line back onto the pending list (wired: JAV-128). Carries the
   *  trip id so the server can re-file the line from the right purchase. */
  onRebuy?: (purchaseId: string, itemId: string) => void
  /** Open a line's product ficha (22a) — wired in Lane 3 (JAV-162). */
  onOpenLine?: (itemId: string) => void
  /** Close the proto-ticket (10b) — wired in Lane 2 (JAV-160). */
  onCloseTrip?: (purchaseId: string) => void
}

const noop = () => {}

/**
 * One trip in the stack (18a / 29a). Three states share one paper card:
 *
 * - Closed, folded: header only — «store · date», «€ total» and a down-chevron
 *   (the total is the glance that matters, not the line count). Tapping opens it
 *   in place (lazy-loads the lines).
 * - Closed, expanded: the dashed-underlined header over its lines (ItemCards in
 *   the bought voice — mono, the rebuy disc on every not-today line).
 * - Proto-ticket (`closed_at == null`, JAV-159): a real purchase with gaps —
 *   «Sin tienda · martes 21» and, where the total prints, the «Cerrar compra»
 *   seal (closed trips carry a figure, this carries a seal). Its lines keep the
 *   rebuy disc and their amount column stays blank — ItemCard already renders
 *   nothing when `price == null`, and a dash would make it a form.
 */
export function TripCard({
  trip,
  defaultExpanded = false,
  loadItems,
  onRebuy,
  onOpenLine,
  onCloseTrip,
}: Props) {
  const proto = trip.closed_at == null
  const [expanded, setExpanded] = useState(defaultExpanded)
  // null = not fetched yet; an array (possibly empty) = loaded. «Loading» is
  // simply `expanded && lines === null`, so no separate loading state (and no
  // synchronous setState in the effect) is needed.
  const [lines, setLines] = useState<ListItem[] | null>(null)

  useEffect(() => {
    if (!expanded || lines !== null) return
    let cancelled = false
    loadItems(trip.id)
      .then((items) => {
        if (!cancelled) setLines(items)
      })
      .catch(() => {
        if (!cancelled) setLines([])
      })
    return () => {
      cancelled = true
    }
  }, [expanded, lines, loadItems, trip.id])

  const store = trip.store ?? 'Sin tienda'
  const date = tripDateLabel(trip.opened_at, proto)

  return (
    <article
      className={`paper paper--settled trip-card${proto ? ' trip-card--proto' : ''}${
        expanded ? ' trip-card--open' : ''
      }`}
    >
      <div className="trip-card__header">
        <button
          type="button"
          className="trip-card__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          <span className="trip-card__label">
            {store} · {date}
          </span>
          <span className="trip-card__meta">
            {/* Closed → the printed total. Proto → a seal in the total's slot:
                folded, a compact stamp badge (the at-a-glance «has a seal, not
                a figure» tell that keeps the store·date from truncating);
                expanded, the full «Cerrar compra» seal (rendered as a sibling
                below, its own tap target rather than a button in a button). */}
            {!proto && trip.total != null && (
              <span className="trip-card__total">
                € {formatRowAmount(trip.total)}
              </span>
            )}
            {proto && !expanded && (
              <span className="trip-card__seal-mark" aria-label="Sin cerrar">
                <Stamp size={13} strokeWidth={1.8} aria-hidden />
              </span>
            )}
            {!expanded && (
              <ChevronDown
                size={14}
                strokeWidth={1.8}
                className="trip-card__chevron"
                aria-hidden
              />
            )}
          </span>
        </button>
        {proto && expanded && (
          <button
            type="button"
            className="trip-card__seal talon__seal"
            onClick={() => onCloseTrip?.(trip.id)}
          >
            <span className="stamp">Cerrar compra</span>
          </button>
        )}
      </div>

      {expanded && lines != null && lines.length > 0 && (
        <div className="trip-card__lines">
          {lines.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onTogglePurchased={noop}
              onOpenActions={(id) => onOpenLine?.(id)}
              onClone={onRebuy ? (id) => onRebuy(trip.id, id) : undefined}
            />
          ))}
        </div>
      )}
      {expanded && lines == null && (
        <div className="trip-card__loading" aria-hidden />
      )}
    </article>
  )
}
