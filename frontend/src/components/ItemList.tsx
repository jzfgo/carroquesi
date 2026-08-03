import { useState, type ReactNode } from 'react'
import { formatPrice } from '../lib/formatPrice'
import { isTripOpen } from '../lib/isTripOpen'
import type { CostSummary } from '../lib/itemCost'
import { purchasedDateLabel } from '../lib/itemCost'
import { storeKey } from '../lib/storeKey'
import type { ListItem } from '../types'
import { ItemCard } from './ItemCard'
import './ItemList.css'
import { Mascot } from './Mascot'
import './paper.css'

type Status = 'loading' | 'error' | 'success'

interface Props {
  status: Status
  items: ListItem[]
  onTogglePurchased: (itemId: string) => void
  /** Row tap — opens the item action sheet for that item. */
  onOpenActions: (itemId: string) => void
  onRetry: () => void
  onClone?: (itemId: string) => void
  pendingCost?: CostSummary | null
  purchasedCostByDate?: Map<string, CostSummary | null>
  totalItems?: number
  footer?: ReactNode
  /** Resolves a raw store string to the list's canonical display name. */
  displayStore?: (raw: string) => string
  /** Opens the close-trip sheet from the seal. Wired in JAV-160. */
  onCloseTrip?: () => void
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
      {cost.partial ? '≥ ' : ''}
      {formatPrice(cost.total)}
    </span>
  )
}

export function ItemList({
  status,
  items,
  onTogglePurchased,
  onOpenActions,
  onRetry,
  onClone,
  pendingCost,
  purchasedCostByDate,
  totalItems,
  footer,
  displayStore = (raw) => raw,
  onCloseTrip,
}: Props) {
  const [purchasedCollapsed, setPurchasedCollapsed] = useState(false)

  if (status === 'loading') {
    return (
      <div className="item-list">
        <div className="paper paper--pending">
          {[0, 1, 2].map((i) => (
            <div key={i} className="item-list__skeleton" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="item-list">
        <div className="paper paper--pending item-list__sheet-message">
          <p>No se pudieron cargar los productos</p>
          <button className="item-list__retry" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const active = items
    .filter((i) => !i.purchased)
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    )

  // The three states split here, not on the row: in-cart is a purchased item
  // whose trip is still open, and it lives on the counterfoil below the
  // die-cut; a closed trip settles it into a record (JAV-152, DESIGN.md 30a).
  // The cart reads top-down like a receipt being rung up — earliest first,
  // an optimistic write with no stamp yet trailing the confirmed lines.
  const cart = items
    .filter((i) => i.purchased && isTripOpen(i.purchase_ends_at))
    .sort((a, b) => {
      if (!a.purchased_at) return 1
      if (!b.purchased_at) return -1
      return a.purchased_at < b.purchased_at
        ? -1
        : a.purchased_at > b.purchased_at
          ? 1
          : 0
    })

  const bought = items
    .filter((i) => i.purchased && !isTripOpen(i.purchase_ends_at))
    .sort((a, b) => {
      if (!a.purchased_at) return 1
      if (!b.purchased_at) return -1
      return b.purchased_at < a.purchased_at
        ? -1
        : b.purchased_at > a.purchased_at
          ? 1
          : 0
    })

  if (active.length === 0 && cart.length === 0 && bought.length === 0) {
    return (
      <div className="item-list">
        <div className="paper paper--pending">
          <p className="paper__title">
            <span className="paper__title-text">Por comprar</span>
            <span className="paper__title-meta">
              <span className="paper__title-count">0</span>
            </span>
          </p>
          <div className="item-list__sheet-message">
            <Mascot size={120} />
            <p
              style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}
            >
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
        </div>
      </div>
    )
  }

  // Group pending items under a header per target shop. Comparison goes by
  // storeKey() and the label through the registry's display name (the JAV-82
  // rule); an item with several shops files under its first one, and items
  // with no shop lead the sheet under no header. Groups keep the order of
  // first appearance — the order the household wrote them in.
  const activeByStore: {
    key: string
    label: string | null
    items: ListItem[]
  }[] = []
  const groupIndex = new Map<string, (typeof activeByStore)[number]>()
  for (const item of active) {
    const raw = item.stores[0]
    const key = raw ? storeKey(raw) : ''
    let group = groupIndex.get(key)
    if (!group) {
      group = { key, label: raw ? displayStore(raw) : null, items: [] }
      groupIndex.set(key, group)
      if (key === '') {
        activeByStore.unshift(group)
      } else {
        activeByStore.push(group)
      }
    }
    group.items.push(item)
  }

  // Group settled records by local date label, preserving backend order (newest first)
  const purchasedByDate: { label: string; items: ListItem[] }[] = []
  for (const item of bought) {
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
      {/* One sheet, cut across the middle. When items are in the cart the
          sheet gives up its single paper ground (paper--split) so the die-cut
          can show the board through real holes, and the lower part becomes the
          talón — same paper, but printed rubric and seal. */}
      <section
        className={`paper paper--pending${cart.length > 0 ? ' paper--split' : ''}`}
        aria-label="Por comprar"
      >
        <div className="paper__part">
          <p className="paper__title">
            <span className="paper__title-text">Por comprar</span>
            <span className="paper__title-meta">
              {pendingCost && (
                <CostBadge
                  cost={pendingCost}
                  className="item-list__label-cost"
                />
              )}
              <span className="paper__title-count">
                {totalItems !== undefined && totalItems !== active.length
                  ? `${active.length} de ${totalItems}`
                  : `${active.length}`}
              </span>
            </span>
          </p>
          {activeByStore.map((group) => (
            <div key={group.key}>
              {group.label !== null && (
                <p className="item-list__store-label">{group.label}</p>
              )}
              {group.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onTogglePurchased={onTogglePurchased}
                  onOpenActions={onOpenActions}
                  onClone={onClone}
                />
              ))}
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <>
            <div className="perf" aria-hidden />
            <div
              className="paper__part talon"
              role="group"
              aria-label="En el carro"
            >
              <p className="talon__rubric">En el carro · {cart.length}</p>
              {cart.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onTogglePurchased={onTogglePurchased}
                  onOpenActions={onOpenActions}
                  onClone={onClone}
                />
              ))}
              {/* The whole row is the target; the stamp is only the mark. The
                  close-trip sheet it opens arrives with the purchases UI. */}
              <button
                type="button"
                className="talon__seal"
                onClick={() => onCloseTrip?.()}
              >
                <span className="stamp">Cerrar compra</span>
              </button>
            </div>
          </>
        )}
      </section>
      {footer}

      {bought.length > 0 && (
        <>
          <button
            className="item-list__purchased-toggle"
            onClick={() => setPurchasedCollapsed((c) => !c)}
            aria-expanded={!purchasedCollapsed}
          >
            Comprados ({bought.length})
            <span
              className={`item-list__chevron${purchasedCollapsed ? ' item-list__chevron--collapsed' : ''}`}
              aria-hidden
            />
          </button>
          {!purchasedCollapsed && (
            <section className="paper paper--settled" aria-label="Comprados">
              {purchasedByDate.map(({ label, items: group }) => (
                <div key={label}>
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
                      onOpenActions={onOpenActions}
                      onClone={onClone}
                    />
                  ))}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
