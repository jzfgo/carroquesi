import { useState } from 'react'
import './ItemList.css'
import { ItemCard } from './ItemCard'
import { Mascot } from './Mascot'
import { purchasedDateLabel } from '../lib/itemCost'
import type { CostSummary } from '../lib/itemCost'
import { formatPrice } from '../lib/formatPrice'
import type { ListItem, Member, TagField } from '../types'

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
  pendingCost?: CostSummary | null
  purchasedCostByDate?: Map<string, CostSummary | null>
  totalItems?: number
}

function CostBadge({ cost, className }: { cost: CostSummary; className: string }) {
  return (
    <span className={className}>
      {cost.partial ? '≥\u202f' : ''}{formatPrice(cost.total)}
    </span>
  )
}

export function ItemList({ status, items, members, onTogglePurchased, onTagClick, onMenuOpen, onRetry, onPriceClick, pendingCost, purchasedCostByDate, totalItems }: Props) {
  const [purchasedCollapsed, setPurchasedCollapsed] = useState(false)

  if (status === 'loading') {
    return (
      <div className="item-list">
        {[0, 1, 2].map(i => (
          <div key={i} className="item-list__skeleton" aria-hidden />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="item-list item-list--centered">
        <p>No se pudieron cargar los productos</p>
        <button className="item-list__retry" onClick={onRetry}>Reintentar</button>
      </div>
    )
  }

  const active = items
    .filter(i => !i.purchased)
    .sort((a, b) => a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)

  const purchased = items
    .filter(i => i.purchased)
    .sort((a, b) => {
      if (!a.purchased_at) return 1
      if (!b.purchased_at) return -1
      return b.purchased_at < a.purchased_at ? -1 : b.purchased_at > a.purchased_at ? 1 : 0
    })

  if (active.length === 0 && purchased.length === 0) {
    return (
      <div className="item-list item-list--centered" style={{ gap: '0.75rem' }}>
        <Mascot size={120} />
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>
          Sin productos todavía
        </p>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
          Añade el primero desde abajo
        </p>
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
      <p className="item-list__label">
        <span className="item-list__label-text">
          {totalItems !== undefined && totalItems !== active.length
            ? `${active.length} de ${totalItems} productos por comprar`
            : `${active.length} ${active.length === 1 ? 'producto' : 'productos'} por comprar`}
        </span>
        {pendingCost && <CostBadge cost={pendingCost} className="item-list__label-cost" />}
      </p>
      {active.map(item => (
        <ItemCard key={item.id} item={item} members={members}
          onTogglePurchased={onTogglePurchased} onTagClick={onTagClick} onMenuOpen={onMenuOpen}
          onPriceClick={onPriceClick} />
      ))}

      {purchased.length > 0 && (
        <>
          <button
            className="item-list__label item-list__label--toggle"
            onClick={() => setPurchasedCollapsed(c => !c)}
            aria-expanded={!purchasedCollapsed}
          >
            Comprados ({purchased.length})
            <span className={`item-list__chevron${purchasedCollapsed ? ' item-list__chevron--collapsed' : ''}`} aria-hidden />
          </button>
          {!purchasedCollapsed && purchasedByDate.map(({ label, items: group }) => (
            <div key={label}>
              <p className="item-list__date-label">
                <span className="item-list__label-text">{label}</span>
                {(() => { const c = purchasedCostByDate?.get(label); return c && <CostBadge cost={c} className="item-list__date-label-cost" />; })()}
              </p>
              {group.map(item => (
                <ItemCard key={item.id} item={item} members={members}
                  onTogglePurchased={onTogglePurchased} onTagClick={onTagClick} onMenuOpen={onMenuOpen}
                  onPriceClick={onPriceClick} />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
