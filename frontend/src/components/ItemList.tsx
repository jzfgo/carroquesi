import { useState, type ReactNode } from 'react'
import { formatPrice } from '../lib/formatPrice'
import type { CostSummary } from '../lib/itemCost'
import { purchasedDateLabel } from '../lib/itemCost'
import { itemState } from '../lib/itemState'
import type { ListItem } from '../types'
import { CartRubric } from './CartRubric'
import { ItemCard } from './ItemCard'
import './ItemList.css'
import { Mascot } from './Mascot'
import { Perforation } from './Perforation'

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
  purchasedCostByDate?: Map<string, CostSummary | null>
  totalItems?: number
  footer?: ReactNode
}

function CostBadge({
  cost,
  className,
}: {
  cost: CostSummary
  className: string
}) {
  return (
    <span className={className}>
      {cost.partial ? '≥\u202f' : ''}
      {formatPrice(cost.total)}
    </span>
  )
}

export function ItemList({
  status,
  items,
  onTogglePurchased,
  onOpen,
  onRetry,
  onClone,
  pendingCost,
  purchasedCostByDate,
  totalItems,
  footer,
}: Props) {
  const [purchasedCollapsed, setPurchasedCollapsed] = useState(false)

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

  // Group what is still to buy by shop, which is the order you walk in. An item
  // can name several shops or none; the first named one decides where it sits,
  // and the ones that name none come first because they can be bought anywhere.
  // Groups keep the order they first appear in, so the list stays the list.
  const pendingByStore: { store: string | null; items: ListItem[] }[] = []
  for (const item of active) {
    const store = item.stores[0] ?? null
    const group = pendingByStore.find((g) => g.store === store)
    if (group) group.items.push(item)
    else pendingByStore.push({ store, items: [item] })
  }
  pendingByStore.sort((a, b) =>
    a.store === null ? -1 : b.store === null ? 1 : 0,
  )
  // One unnamed group is just the list — do not head it with anything.
  const showStoreHeadings = pendingByStore.some((g) => g.store !== null)

  // Group purchased items by local date label, preserving backend order (newest first)
  const purchasedByDate: { label: string; items: ListItem[] }[] = []
  for (const item of purchased) {
    const label = purchasedDateLabel(item.purchased_at)
    const last = purchasedByDate.at(-1)
    if (last && last.label === label) {
      last.items.push(item)
    } else {
      purchasedByDate.push({ label, items: [item] })
    }
  }

  return (
    <div className="item-list">
      {/* The list is the sheet on top of the table: one continuous piece of
          paper, cast tall and soft, with no veil. Everything below it is a
          purchase — thinner stock, a shorter cast, and the 4% veiling that
          says it has already happened. The board shows between them. */}
      <div className="item-list__sheet">
        {/* Pre-printed, in the serif: the pad brought this line, nobody wrote
            it. The count sits on the right in mono, where figures go. */}
        <div className="item-list__rubric">
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
        {pendingByStore.map(({ store, items: group }) => (
          <div key={store ?? '\u0000none'}>
            {/* Written, not printed: a shop is something the household put on
                the list, so it is in their hand and underlined the way you
                underline a heading on paper (rule 15). */}
            {showStoreHeadings && store !== null && (
              <p className="item-list__store">
                <span className="item-list__store-name">{store}</span>
              </p>
            )}
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
        {footer}

        {/* The stub only exists when there is something to tear off (28c.5):
            with an empty cart there is no cut, no stamp and no printed
            rubric — the handwritten one comes back instead. */}
        {cart.length > 0 ? (
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
        ) : (
          <div className="item-list__cart-empty">
            <span className="item-list__cart-empty-rubric">En el carro</span>
            <span className="item-list__cart-empty-note">Nada todavía</span>
          </div>
        )}
      </div>

      {purchased.length > 0 && (
        <>
          <button
            className="item-list__label item-list__label--toggle"
            onClick={() => setPurchasedCollapsed((c) => !c)}
            aria-expanded={!purchasedCollapsed}
          >
            Comprados ({purchased.length})
            <span
              className={`item-list__chevron${purchasedCollapsed ? ' item-list__chevron--collapsed' : ''}`}
              aria-hidden
            />
          </button>
          {!purchasedCollapsed &&
            purchasedByDate.map(({ label, items: group }) => (
              <div
                key={label}
                className="item-list__sheet item-list__sheet--receipt"
              >
                <p className="item-list__date-label">
                  <span className="item-list__label-text">{label}</span>
                  {(() => {
                    const c = purchasedCostByDate?.get(label)
                    return (
                      c && (
                        <CostBadge
                          cost={c}
                          className="item-list__date-label-cost"
                        />
                      )
                    )
                  })()}
                </p>
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
        </>
      )}
    </div>
  )
}
