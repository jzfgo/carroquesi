import { useState, type ReactNode } from 'react'
import { formatPrice } from '../lib/formatPrice'
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
                displayStore={displayStore}
              />
            ))}
          </div>
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
                      onTogglePurchased={onTogglePurchased}
                      onOpenActions={onOpenActions}
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
