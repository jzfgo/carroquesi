import { useState, type ReactNode } from 'react'
import { formatPrice } from '../lib/formatPrice'
import type { CostSummary } from '../lib/itemCost'
import { purchasedDateLabel } from '../lib/itemCost'
import type { ListItem, Member, TagField } from '../types'
import { ItemCard } from './ItemCard'
import './ItemList.css'
import { Mascot } from './Mascot'
import './paper.css'

type Status = 'loading' | 'error' | 'success'

interface Props {
  status: Status
  items: ListItem[]
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField | 'stores') => void
  onMenuOpen: (itemId: string) => void
  onRetry: () => void
  onPriceClick: (itemId: string) => void
  onClone?: (itemId: string) => void
  pendingCost?: CostSummary | null
  purchasedCostByDate?: Map<string, CostSummary | null>
  totalItems?: number
  footer?: ReactNode
  /** Resolves a raw store string to the list's canonical display name. */
  displayStore?: (raw: string) => string
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
  members,
  onTogglePurchased,
  onTagClick,
  onMenuOpen,
  onRetry,
  onPriceClick,
  onClone,
  pendingCost,
  purchasedCostByDate,
  totalItems,
  footer,
  displayStore,
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

  const purchased = items
    .filter((i) => i.purchased)
    .sort((a, b) => {
      if (!a.purchased_at) return 1
      if (!b.purchased_at) return -1
      return b.purchased_at < a.purchased_at
        ? -1
        : b.purchased_at > a.purchased_at
          ? 1
          : 0
    })

  if (active.length === 0 && purchased.length === 0) {
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
      <section className="paper paper--pending" aria-label="Por comprar">
        <p className="paper__title">
          <span className="paper__title-text">Por comprar</span>
          <span className="paper__title-meta">
            {pendingCost && (
              <CostBadge cost={pendingCost} className="item-list__label-cost" />
            )}
            <span className="paper__title-count">
              {totalItems !== undefined && totalItems !== active.length
                ? `${active.length} de ${totalItems}`
                : `${active.length}`}
            </span>
          </span>
        </p>
        {active.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            members={members}
            onTogglePurchased={onTogglePurchased}
            onTagClick={onTagClick}
            onMenuOpen={onMenuOpen}
            onPriceClick={onPriceClick}
            onClone={onClone}
            displayStore={displayStore}
          />
        ))}
      </section>
      {footer}

      {purchased.length > 0 && (
        <>
          <button
            className="item-list__purchased-toggle"
            onClick={() => setPurchasedCollapsed((c) => !c)}
            aria-expanded={!purchasedCollapsed}
          >
            Comprados ({purchased.length})
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
                      members={members}
                      onTogglePurchased={onTogglePurchased}
                      onTagClick={onTagClick}
                      onMenuOpen={onMenuOpen}
                      onPriceClick={onPriceClick}
                      onClone={onClone}
                      displayStore={displayStore}
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
