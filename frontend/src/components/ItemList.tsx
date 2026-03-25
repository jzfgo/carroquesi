import './ItemList.css'
import { ItemCard } from './ItemCard'
import type { ListItem, Member, TagField } from '../types'

type Status = 'loading' | 'error' | 'success'

interface Props {
  status: Status
  items: ListItem[]
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField) => void
  onRetry: () => void
}

export function ItemList({ status, items, members, onTogglePurchased, onTagClick, onRetry }: Props) {
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

  return (
    <div className="item-list">
      <p className="item-list__label">
        {active.length} {active.length === 1 ? 'producto' : 'productos'} por comprar
      </p>
      {active.map(item => (
        <ItemCard key={item.id} item={item} members={members}
          onTogglePurchased={onTogglePurchased} onTagClick={onTagClick} />
      ))}

      {purchased.length > 0 && (
        <>
          <p className="item-list__label">Comprados</p>
          {purchased.map(item => (
            <ItemCard key={item.id} item={item} members={members}
              onTogglePurchased={onTogglePurchased} onTagClick={onTagClick} />
          ))}
        </>
      )}
    </div>
  )
}
