import { ChevronRight, RotateCcw, ShoppingCart } from 'lucide-react'
import { formatPrice } from '../lib/formatPrice'
import { itemState } from '../lib/itemState'
import type { ListItem } from '../types'
import './ItemCard.css'

/** Nothing on screen labels the three states — the circle is the whole
 *  sentence — so the label has to carry the distinction on its own. */
const CIRCLE_LABEL = {
  pending: 'Poner en el carro',
  cart: 'Sacar del carro',
  bought: 'Marcar como no comprado',
} as const

interface Props {
  item: ListItem
  /** Written here, not on the server yet. Only ever true while offline. */
  queued?: boolean
  onTogglePurchased: (itemId: string) => void
  /** Opens the item — where its brand, its shop, its price, who added it and
   *  everything that can be done to it live. The row says only what it is. */
  onOpen: (itemId: string) => void
  onClone?: (itemId: string) => void
}

/**
 * One line of the list. Two hit targets and no more (rule 7): the circle on the
 * left, and the rest of the row, which opens the item.
 *
 * What the row does *not* carry is the point of it. No chips to fill in, no
 * avatar, no ⋯ — inside a sheet there is only ink (rule 2), and a row offering
 * four small controls is a form pretending to be a list. Brand, shop, price,
 * who added it and what can be done to it all live one tap away, in the item's
 * own sheet, where there is room to say them properly.
 */
export function ItemCard({
  item,
  queued,
  onTogglePurchased,
  onOpen,
  onClone,
}: Props) {
  // Three states, not two. The middle one is what the old boolean could not
  // say: picked up, but the trip is not over. See lib/itemState.
  const state = itemState(item)
  const settled = state === 'bought'

  // For a settled line, what was actually bought; otherwise what was asked for.
  const displayQty =
    settled && item.purchased_quantity != null
      ? item.purchased_quantity
      : item.quantity

  // A price only becomes a figure once someone picked the thing up. Before
  // that it is a proposal inherited from history, and an unconfirmed price is
  // not a figure at all (rule 10).
  const showsAmount = state !== 'pending' && item.price != null

  // Whether the figure column is still the quantity's, or has been taken over.
  //
  // It holds the quantity only while nothing has displaced it: an amount does
  // (money outranks a count once the thing is in hand), and so does settling,
  // because on a record the column *is* the money column — and when no price
  // was ever captured the honest answer there is a gap, which is exactly what
  // should show, since the missing price is the thing worth noticing.
  const qtyInFigure = !showsAmount && !settled

  const figure = showsAmount
    ? formatPrice(item.price!, item.price_per)
    : qtyInFigure
      ? displayQty
      : null

  // The second line. The brand always, and the quantity too whenever the
  // figure column is no longer carrying it — "12 UD · PULEVA".
  //
  // Keyed on where the quantity actually went rather than on the row's state:
  // keying on `settled` looked equivalent and was not, because a line in the
  // cart with a price logged has already given its figure column over to the
  // money. Its quantity fell out of the row altogether until midnight settled
  // it. Both parts are optional, and a row with neither has no second line
  // rather than an empty one held open (rule 6).
  const subline = qtyInFigure
    ? item.brand
    : [displayQty, item.brand].filter(Boolean).join(' · ')

  return (
    <div className={`item-card item-card--${state}`}>
      {settled ? (
        // A record has no state to toggle. The one thing left to do with it is
        // buy it again, so that is what the leading column becomes. Un-marking
        // a purchase is still possible, from inside the item.
        <button
          className="item-card__again"
          onClick={() => onClone?.(item.id)}
          disabled={!onClone}
          aria-label={`Volver a comprar ${item.name}`}
        >
          <RotateCcw size={20} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <button
          role="checkbox"
          // `mixed` is the honest value for the cart: picked up, not settled.
          // A screen reader that only knows two states still hears "not
          // unchecked", and the label says which of the two it is.
          aria-checked={state === 'cart' ? 'mixed' : false}
          className={`item-card__checkbox item-card__checkbox--${state}`}
          onClick={() => onTogglePurchased(item.id)}
          aria-label={CIRCLE_LABEL[state]}
        >
          {state === 'cart' && (
            <ShoppingCart size={12} strokeWidth={2.4} aria-hidden />
          )}
        </button>
      )}

      <button
        className="item-card__open"
        onClick={() => onOpen(item.id)}
        aria-label={item.name}
      >
        {/* The dot is what makes the band's count checkable: without it "2
            cambios" is a number with nothing to hold it against. No dot, no
            row to hold it — an empty slot is not drawn (rule 6). */}
        {queued ? (
          <span className="item-card__written">
            <span className="item-card__name">{item.name}</span>
            <span
              className="item-card__queued"
              role="img"
              aria-label="Sin enviar"
            />
          </span>
        ) : (
          <span className="item-card__name">{item.name}</span>
        )}
        {subline && <span className="item-card__sub">{subline}</span>}
      </button>

      {/* One column for the figure, whichever figure this line has: a quantity
          while it is still an instruction, an amount once it is a record.
          Empty when there is neither — no dash and no rule, because a dash
          turns a column into a form (rule 6). */}
      <span
        className={`item-card__figure${showsAmount ? ' item-card__figure--amount' : ''}`}
      >
        {figure}
      </span>

      <ChevronRight className="item-card__chevron" size={14} aria-hidden />
    </div>
  )
}
