import { useState } from 'react'
import type { ListItem } from '../types'
import { ItemCard } from './ItemCard'
import './ReceiptLines.css'

/**
 * How much of a receipt is worth showing before it stops being a glance.
 *
 * Four is enough to recognise which shop this was without the sheet becoming
 * the shop itself — a sixteen-line Mercadona run would otherwise push every
 * other trip off the screen.
 */
const VISIBLE = 4

interface Props {
  items: ListItem[]
  onTogglePurchased: (itemId: string) => void
  onOpen: (itemId: string) => void
  onClone?: (itemId: string) => void
}

/**
 * The lines of one purchase, cut short when there are too many of them.
 *
 * The rest are not hidden so much as folded: the count says exactly what is
 * not being shown, and opening it happens in place. Nothing here navigates
 * away, because the sheet is already where the purchase lives.
 */
export function ReceiptLines({
  items,
  onTogglePurchased,
  onOpen,
  onClone,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const folded = items.length - VISIBLE
  const shown = expanded || folded <= 0 ? items : items.slice(0, VISIBLE)

  return (
    <>
      {shown.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          onTogglePurchased={onTogglePurchased}
          onOpen={onOpen}
          onClone={onClone}
        />
      ))}
      {folded > 0 && (
        <button
          className="receipt-lines__more"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          <span className="receipt-lines__more-text">
            {expanded
              ? 'Ver menos'
              : `${folded} línea${folded === 1 ? '' : 's'} más`}
          </span>
        </button>
      )}
    </>
  )
}
