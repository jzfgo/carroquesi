import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatPrice } from '../lib/formatPrice'
import type { CostSummary } from '../lib/itemCost'
import { purchasedDateLabel } from '../lib/itemCost'
import { itemState } from '../lib/itemState'
import { formatShops, groupByShops } from '../lib/storeGroups'
import type { ListItem, Purchase } from '../types'
import { CartRubric } from './CartRubric'
import { CostBadge } from './CostBadge'
import { ItemCard } from './ItemCard'
import './ItemList.css'
import { Mascot } from './Mascot'
import { Perforation } from './Perforation'
import { ReceiptLines } from './ReceiptLines'

type Status = 'loading' | 'error' | 'success'

interface Props {
  status: Status
  items: ListItem[]
  onTogglePurchased: (itemId: string) => void
  /** A row opens the item; the item sheet carries everything the row does not. */
  onOpen: (itemId: string) => void
  onRetry: () => void
  onClone?: (itemId: string) => void
  pendingCost?: CostSummary | null
  purchasedCostByTrip?: Map<string, CostSummary | null>
  /** Trips by id, for the receipt headers. Absent while the read is in flight. */
  purchases?: Map<string, Purchase>
  totalItems?: number
  footer?: ReactNode
}

export function ItemList({
  status,
  items,
  onTogglePurchased,
  onOpen,
  onRetry,
  onClone,
  pendingCost,
  purchasedCostByTrip,
  purchases,
  totalItems,
  footer,
}: Props) {
  // How many past trips are on the board before the rest are folded away.
  // Three is what fits under the list without the board becoming an archive:
  // the shop you just did, and the two you might still be reconciling.
  const TRIPS_SHOWN = 3
  const [tripsShown, setTripsShown] = useState(TRIPS_SHOWN)

  if (status === 'loading') {
    return (
      <div className="item-list">
        {[0, 1, 2].map((i) => (
          <div key={i} className="item-list__skeleton" aria-hidden />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="item-list item-list--centered">
        <p>No se pudieron cargar los productos</p>
        <button className="item-list__retry" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    )
  }

  const active = items
    .filter((i) => itemState(i) === 'pending')
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    )

  const byPurchasedAtDesc = (a: ListItem, b: ListItem) => {
    if (!a.purchased_at) return 1
    if (!b.purchased_at) return -1
    return b.purchased_at < a.purchased_at
      ? -1
      : b.purchased_at > a.purchased_at
        ? 1
        : 0
  }

  // In the cart on this trip. Still on the list's own sheet, below the die-cut,
  // because it has not come away yet — at midnight it will.
  const cart = items
    .filter((i) => itemState(i) === 'cart')
    .sort(byPurchasedAtDesc)

  // Settled. These have already torn off and are receipts now.
  const purchased = items
    .filter((i) => itemState(i) === 'bought')
    .sort(byPurchasedAtDesc)

  if (active.length === 0 && cart.length === 0 && purchased.length === 0) {
    return (
      <div className="item-list item-list--centered" style={{ gap: '0.75rem' }}>
        <Mascot size={120} />
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>
          Sin productos todavía
        </p>
        <p
          style={{
            margin: 0,
            color: 'var(--color-text-secondary)',
            fontSize: '0.9rem',
          }}
        >
          Añade el primero desde abajo
        </p>
      </div>
    )
  }

  // Group what is still to buy by the shops that can supply it.
  //
  // A line naming two shops is one thing to buy, not two, so it appears once
  // under a heading naming both — "Dia o Mercadona". Filing it under each shop
  // separately drew the same line twice and read as two errands. What the
  // household means is "either place will do", and the heading now says that.
  //
  // Order is by narrowing constraint: buy-anywhere first and unheaded, then
  // the shops-plural groups widest first, then the single shops. The further
  // down you read, the more it matters where you are standing. See
  // lib/storeGroups.
  const pendingByStore = groupByShops(active)

  // One unnamed group is just the list — do not head it with anything.
  const showStoreHeadings = pendingByStore.some((g) => g.shops.length > 0)

  // One sheet per trip. This used to group on the rendered date label, which
  // made two shops on one day into one receipt — the exact case the Purchase
  // entity exists for. Items arrive sorted newest-first and two trips on one
  // day interleave, so this indexes by key rather than comparing neighbours.
  const purchasedByTrip: { key: string; label: string; items: ListItem[] }[] =
    []
  const tripIndex = new Map<string, number>()
  for (const item of purchased) {
    const key = item.purchase_id ?? item.id
    let at = tripIndex.get(key)
    if (at === undefined) {
      at = purchasedByTrip.length
      tripIndex.set(key, at)
      purchasedByTrip.push({ key, label: '', items: [] })
    }
    purchasedByTrip[at].items.push(item)
  }
  // The trip's own start, which is what the backfill writes into `opened_at`.
  // Items within a group are newest-first, so the earliest is the last.
  for (const group of purchasedByTrip) {
    group.label = purchasedDateLabel(group.items.at(-1)!.purchased_at)
  }

  // Trips still folded away below the board's edge.
  const folded = purchasedByTrip.length - tripsShown

  return (
    <div className="item-list">
      {/* The list is the sheet on top of the table: one continuous piece of
          paper, cast tall and soft, with no veil. Everything below it is a
          purchase — thinner stock, a shorter cast, and the 4% veiling that
          says it has already happened. The board shows between them. */}
      <div className="item-list__sheet">
        {/* Pre-printed, in the serif: the pad brought this line, nobody wrote
            it. The count sits on the right in mono, where figures go.

            Its ruling is dropped when nothing is written under it, which is
            to say whenever there is nothing left to buy. Either the die-cut
            follows — and a dashed rule a few pixels above a dashed cut reads
            as a mistake, with the cut being the line that means something —
            or nothing follows at all, and a rule over empty paper rules
            nothing. */}
        <div
          className={`item-list__rubric${
            active.length === 0 ? ' item-list__rubric--unruled' : ''
          }`}
        >
          <span className="item-list__rubric-title">Por comprar</span>
          <span className="item-list__rubric-meta">
            {pendingCost && (
              <CostBadge cost={pendingCost} className="item-list__label-cost" />
            )}
            <span className="item-list__rubric-count">
              {totalItems !== undefined && totalItems !== active.length
                ? `${active.length}/${totalItems}`
                : active.length}
            </span>
          </span>
        </div>
        {pendingByStore.map(({ shops, items: group }) => (
          <div key={shops.join('\u0000')}>
            {/* Written, not printed: a shop is something the household put on
                the list, so it is in their hand and underlined the way you
                underline a heading on paper (rule 15). */}
            {showStoreHeadings && shops.length > 0 && (
              <p className="item-list__store">
                <span className="item-list__store-name">
                  {formatShops(shops)}
                </span>
              </p>
            )}
            {/* One line per item now, so the item's own id is the key. A
                duplicate-key warning here would mean grouping has started
                fragmenting again — that warning is the regression, not noise. */}
            {group.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onTogglePurchased={onTogglePurchased}
                onOpen={onOpen}
                onClone={onClone}
              />
            ))}
          </div>
        ))}

        {/* The stub only exists when there is something to tear off (28c.5).
            With an empty cart there is no cut, no stamp and no rubric either:
            an "En el carro — nada todavía" heading is a label for a thing that
            is not there, and a hole with no action in it is not drawn
            (rule 6). The cut appears the moment the first line is picked up,
            which is the whole point of it. */}
        {cart.length > 0 && (
          <>
            <Perforation />
            <CartRubric count={cart.length} />
            {cart.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onTogglePurchased={onTogglePurchased}
                onOpen={onOpen}
                onClone={onClone}
              />
            ))}
          </>
        )}
      </div>

      {purchased.length > 0 && (
        <>
          {purchasedByTrip
            .slice(0, tripsShown)
            .map(({ key, label, items: group }) => {
              // The trips read is capped and the items read is not, so a long
              // list can serve items whose trip is missing here. The header
              // then falls back to the day and the sum: a poorer ticket, not
              // a broken one.
              const shopped = purchases?.get(key)
              const summed = purchasedCostByTrip?.get(key)
              return (
                <div
                  key={key}
                  className="item-list__sheet item-list__sheet--receipt"
                >
                  <p className="item-list__date-label">
                    <span className="item-list__label-text">
                      {shopped?.store ? `${shopped.store} · ${label}` : label}
                    </span>
                    {/* A confirmed total is a figure someone read off a paper,
                        so it prints as itself. Anything else is a sum of the
                        lines, and a till adds things no line ever held — a
                        bag, a deposit, a discount — so it can only ever be a
                        floor, even with every line priced. */}
                    {shopped?.total != null ? (
                      <span className="item-list__date-label-cost">
                        {formatPrice(shopped.total)}
                      </span>
                    ) : (
                      summed && (
                        <CostBadge
                          cost={{ ...summed, partial: true }}
                          className="item-list__date-label-cost"
                        />
                      )
                    )}
                  </p>
                  <ReceiptLines
                    items={group}
                    onTogglePurchased={onTogglePurchased}
                    onOpen={onOpen}
                    onClone={onClone}
                  />
                </div>
              )
            })}
        </>
      )}

      {/* Lettered straight onto the board with no sheet of its own: what is
          not paper is not drawn as paper (rule 14). It counts trips rather
          than things, because that is what a purchase is — one shop, one day
          — and it counts the ones you cannot see, so the number is what
          tapping will get you.

          It brings the next few onto the board and then goes away, the way a
          "load more" does — it never folds anything back, because nothing
          here was folded: those trips were simply not put on the board yet.
          Sending it to a screen of its own would make the archive somewhere
          you go, when it is really just further down. */}
      {folded > 0 && (
        <>
          {/* The pad's ruling, one above each thing written on the board.
              Putting a single rule above the pair made it vanish whenever the
              first of them did. */}
          <div className="item-list__board-rule" aria-hidden />
          <button
            className="item-list__more-trips"
            onClick={() => setTripsShown((n) => n + TRIPS_SHOWN)}
          >
            <span className="item-list__more-trips-text">
              Compras anteriores
            </span>
            <span className="item-list__more-trips-meta">
              <span className="item-list__more-trips-count">{folded}</span>
              <ChevronDown
                className="item-list__more-trips-chevron"
                size={16}
              />
            </span>
          </button>
        </>
      )}

      {/* Last thing on the board, under everything it could ever produce. It
          used to sit inside the list sheet, between the shops and the cart —
          which put a way of *recording* a shop in the middle of the shop you
          are still doing. */}
      {footer && (
        <>
          <div className="item-list__board-rule" aria-hidden />
          {footer}
        </>
      )}
    </div>
  )
}
