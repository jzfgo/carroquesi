import { useState } from 'react'
import './ItemList.css'
import { ItemCard } from './ItemCard'
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
}

export function ItemList({ status, items, members, onTogglePurchased, onTagClick, onMenuOpen, onRetry, onPriceClick }: Props) {
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

  const active    = items.filter(i => !i.purchased)
  const purchased = items.filter(i =>  i.purchased)

  if (active.length === 0 && purchased.length === 0) {
    return (
      <div className="item-list item-list--centered">
        <p>Sin productos — añade el primero abajo</p>
      </div>
    )
  }

  // Group purchased items by local date label, preserving backend order (newest first)
  const purchasedByDate: { label: string; items: ListItem[] }[] = []
  for (const item of purchased) {
    const label = item.purchased_at
      ? new Date(item.purchased_at + 'Z').toLocaleDateString('es', { dateStyle: 'medium' })
      : 'Fecha desconocida'
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
        {active.length} {active.length === 1 ? 'producto' : 'productos'} por comprar
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
              <p className="item-list__date-label">{label}</p>
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
