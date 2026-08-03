import { Check, ChevronRight, RotateCcw, ShoppingCart } from 'lucide-react'
import { useOnline } from '../hooks/useOnline'
import { formatRowAmount } from '../lib/formatPrice'
import { formatQuantity } from '../lib/formatQuantity'
import { isTripOpen } from '../lib/isTripOpen'
import { parseQuantityFactor } from '../lib/itemCost'
import type { ListItem } from '../types'
import './ItemCard.css'

interface Props {
  item: ListItem
  onTogglePurchased: (itemId: string) => void
  /** Row tap — every per-field edit routes through the item action sheet. */
  onOpenActions: (itemId: string) => void
  /** Re-buy: clones a previous purchase line back onto the pending sheet. */
  onClone?: (itemId: string) => void
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
 * - Pending: an instruction in the household's handwriting — name, the
 *   quantity column on the right, brand beneath, no price. Empty circle.
 * - In cart: still the written voice — you wrote it, and it stays yours
 *   until the trip closes — on ink a step lighter. The circle fills with
 *   `--tinta-0` and takes the white cart glyph. Derived, not stored: a
 *   purchased item whose trip is still open (`isTripOpen`).
 * - Bought: the settled record. Check on `--verde-0`, printed in mono, the
 *   bare amount in the right-hand tabular column — only the tick is green,
 *   and nothing is struck through.
 *
 * No row names its store: pending rows sit under their store group header,
 * and a purchase's store belongs to the purchase sheet header (JAV-158).
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

  // A record folds its quantity into the printed detail line («12 UD ·
  // PULEVA»); the other states keep it in the right-hand column and the
  // meta carries the brand alone.
  const meta = (
    bought
      ? [displayQty && formatQuantity(displayQty), item.brand]
      : [item.brand]
  )
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
        <span className="item-card__text">
          <span className="item-card__name">{item.name}</span>
          {meta && <span className="item-card__meta">{meta}</span>}
        </span>
        {!bought && displayQty && (
          <span className="item-card__qty">{formatQuantity(displayQty)}</span>
        )}
        {/* An amount is a record's field alone: until the trip closes no
            price exists — a pending row would be guessing, and an in-cart
            figure is not yet confirmed (the Confirmed-Price Rule). The big
            figure is what the line actually cost; the unit price drops to
            the small line beneath (21b: «5,34» over «0,89/UD»). With no
            computable factor the unit price is the only figure there is,
            so it takes the total's place, suffixed. */}
        {bought &&
          item.price != null &&
          (() => {
            const price = item.price
            const factor = parseQuantityFactor(displayQty, item.price_per)
            const per = item.price_per === 'KILOGRAM' ? '/KG' : '/UD'
            const total = factor != null ? price * factor : null
            return (
              <span className="item-card__amount">
                <span className="item-card__amount-total">
                  {total != null
                    ? formatRowAmount(total)
                    : `${formatRowAmount(price)}${per}`}
                </span>
                {total != null && factor !== 1 && (
                  <span className="item-card__amount-unit">
                    {formatRowAmount(price)}
                    {per}
                  </span>
                )}
              </span>
            )
          })()}
      </button>

      {/* The row-tap affordance: icons live in the affordance — the circle,
          the chevron, the pencil (the Grayscale Ink Rule). */}
      <ChevronRight size={16} className="item-card__chevron" aria-hidden />
    </div>
  )
}
