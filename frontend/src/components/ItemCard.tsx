import { Check, RotateCcw, ShoppingCart } from 'lucide-react'
import { useOnline } from '../hooks/useOnline'
import { formatPrice } from '../lib/formatPrice'
import { isTripOpen } from '../lib/isTripOpen'
import type { ListItem } from '../types'
import './ItemCard.css'

interface Props {
  item: ListItem
  onTogglePurchased: (itemId: string) => void
  /** Row tap — every per-field edit routes through the item action sheet. */
  onOpenActions: (itemId: string) => void
  /** Re-buy: clones a previous purchase line back onto the pending sheet. */
  onClone?: (itemId: string) => void
  /** Resolves a raw store string to the list's canonical display name. */
  displayStore?: (raw: string) => string
}

// Whether the purchase happened on the viewer's current local day. purchased_at
// arrives as naive UTC, so the Z is restored before parsing (see isTripOpen for
// the doubled-suffix caveat).
function purchasedToday(purchasedAt: string | null): boolean {
  if (!purchasedAt) return false
  const d = new Date(
    purchasedAt.endsWith('Z') ? purchasedAt : purchasedAt + 'Z',
  )
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

/**
 * The item row — three states, two voices (DESIGN.md, 30a/33a):
 *
 * - Pending: an instruction in the household's handwriting. Empty circle,
 *   the quantity in the hand on the right, brand/store beneath, no price.
 * - In cart: the trip happening. Cart glyph on `--tinta-0`; derived, not
 *   stored — a purchased item whose trip is still open (`isTripOpen`).
 * - Bought: a record. Check on `--verde-0`, printed in mono, amount in the
 *   right-hand tabular column in `--ink-1` — only the tick is green, and
 *   nothing is struck through.
 *
 * Two touch targets: the leading control (toggle — or re-buy, see below) and
 * the row body (opens the item action sheet, where all per-field editing
 * lives).
 */
export function ItemCard({
  item,
  onTogglePurchased,
  onOpenActions,
  onClone,
  displayStore = (raw) => raw,
}: Props) {
  const online = useOnline()
  const inCart = item.purchased && isTripOpen(item.purchase_ends_at)
  const bought = item.purchased && !inCart

  // On a record from a previous day the check yields to the re-buy control:
  // the trip is closed, so un-checking would be refused anyway, and re-buying
  // is the primary act on a record. Today's lines keep the toggle, and an
  // in-cart row never re-buys — its purchased_at may still be in flight.
  const rebuy = bought && !!onClone && !purchasedToday(item.purchased_at)

  // For purchased items, show actual purchased qty; fall back to planned qty.
  const displayQty =
    item.purchased && item.purchased_quantity != null
      ? item.purchased_quantity
      : item.quantity

  // Bought rows record the shop the price was logged at; instruction rows
  // list the target shops. Dedupe by display name — two spellings of one
  // store must not print twice.
  const storeNames =
    bought && item.price_store
      ? [displayStore(item.price_store)]
      : [...new Set(item.stores.map(displayStore))]
  // A record folds its quantity into the printed detail line; an instruction
  // keeps it in the hand, on the row itself.
  const meta = (bought ? [displayQty, item.brand] : [item.brand])
    .concat(storeNames)
    .filter(Boolean)
    .join(' · ')

  const state = inCart ? 'cart' : bought ? 'bought' : 'pending'

  return (
    <div className={`item-card item-card--${state}`}>
      {rebuy ? (
        <button
          className="item-card__rebuy"
          onClick={() => onClone(item.id)}
          aria-label="Volver a comprar"
        >
          <RotateCcw size={18} aria-hidden />
        </button>
      ) : (
        <button
          role="checkbox"
          aria-checked={item.purchased}
          className={`item-card__circle${online ? '' : ' item-card__circle--offline'}`}
          onClick={() => onTogglePurchased(item.id)}
          aria-label={
            item.purchased ? 'Marcar como no comprado' : 'Marcar como comprado'
          }
        >
          {inCart && <ShoppingCart size={13} aria-hidden />}
          {bought && <Check size={15} strokeWidth={3} aria-hidden />}
        </button>
      )}

      <button
        className="item-card__body"
        onClick={() => onOpenActions(item.id)}
      >
        <span className="item-card__line">
          <span className="item-card__name">{item.name}</span>
          {!bought && displayQty && (
            <span className="item-card__qty">{displayQty}</span>
          )}
          {/* No price on a pending row: the app does not know yet, and an
              estimate would present a guess with the authority of a record. */}
          {item.purchased && item.price != null && (
            <span className="item-card__amount">
              {formatPrice(item.price, item.price_per)}
            </span>
          )}
        </span>
        {meta && <span className="item-card__meta">{meta}</span>}
      </button>
    </div>
  )
}
