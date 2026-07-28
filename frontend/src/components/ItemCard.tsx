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
export function ItemCard({ item, onTogglePurchased, onOpen, onClone }: Props) {
  // Three states, not two. The middle one is what the old boolean could not
  // say: picked up, but the trip is not over. See lib/itemState.
  const state = itemState(item)
  const settled = state === 'bought'

  // For a settled line, what was actually bought; otherwise what was asked for.
  const displayQty =
    settled && item.purchased_quantity != null
      ? item.purchased_quantity
      : item.quantity

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
        <span className="item-card__name">{item.name}</span>
        {settled && displayQty && (
          <span className="item-card__sub">{displayQty}</span>
        )}
      </button>

      {/* One column for the figure, whichever figure this line has. Left empty
          when there is none — no dash and no rule, because a dash would turn
          the column into a form asking to be filled (rule 6). */}
      <span className="item-card__figure">
        {settled
          ? item.price != null && formatPrice(item.price, item.price_per)
          : displayQty}
      </span>

      <ChevronRight className="item-card__chevron" size={14} aria-hidden />
    </div>
  )
}
