import './ItemCard.css'
import { Tag, Store, Coins, RotateCcw, Hash } from 'lucide-react'
import { formatPrice } from '../lib/formatPrice'
import type { ListItem, Member, TagField } from '../types'
import { useAuth } from '../contexts/AuthContext'

const TAG_CONFIG: { field: TagField; icon: React.ReactNode; label: string }[] = [
  { field: 'brand', icon: <Tag size={13} />, label: 'marca' },
]

interface Props {
  item: ListItem
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField | 'stores') => void
  onMenuOpen: (itemId: string) => void
  onPriceClick?: (itemId: string) => void
  onClone?: (itemId: string) => void
}

export function ItemCard({ item, members, onTogglePurchased, onTagClick, onMenuOpen, onPriceClick, onClone }: Props) {
  const member = members.get(item.added_by)
  const initial = member?.initial ?? '?'
  const { user } = useAuth()
  const isSelf = member?.id === user?.id
  const avatarStyle = isSelf
    ? { background: 'var(--tinta-0)', color: 'var(--accent-fg)' }
    : { background: 'var(--paper-2)', color: 'var(--ink-1)' }

  // For purchased items, show actual purchased qty; fall back to planned qty.
  const displayQty =
    item.purchased && item.purchased_quantity != null
      ? item.purchased_quantity
      : item.quantity

  return (
    <div className={`item-card${item.purchased ? ' item-card--purchased' : ''}`}>
      <button
        role="checkbox"
        aria-checked={item.purchased}
        className="item-card__checkbox"
        onClick={() => onTogglePurchased(item.id)}
        aria-label={item.purchased ? 'Marcar como no comprado' : 'Marcar como comprado'}
      />

      <div className="item-card__body">
        <div className="item-card__name-row">
          <span className="item-card__name">{item.name}</span>
          {displayQty ? (
            item.purchased ? (
              <span className="item-card__qty">{displayQty}</span>
            ) : (
              <button
                className="item-card__qty"
                onClick={() => onTagClick(item.id, 'quantity')}
                aria-label={displayQty}
              >
                {displayQty}
              </button>
            )
          ) : (
            !item.purchased && (
              <button
                className="item-card__tag item-card__tag--cta"
                onClick={() => onTagClick(item.id, 'quantity')}
                aria-label="Añadir cantidad"
              >
                <span aria-hidden><Hash size={13} /></span>
              </button>
            )
          )}
        </div>

        <div className="item-card__tags">
          {TAG_CONFIG.map(({ field, icon, label }) =>
            item[field] ? (
              item.purchased ? (
                <span key={field} className="item-card__tag">
                  <span aria-hidden>{icon}</span> {item[field]}
                </span>
              ) : (
                <button
                  key={field}
                  className="item-card__tag"
                  onClick={() => onTagClick(item.id, field)}
                >
                  <span aria-hidden>{icon}</span> {item[field]}
                </button>
              )
            ) : (
              !item.purchased && (
                <button
                  key={field}
                  className="item-card__tag item-card__tag--cta"
                  onClick={() => onTagClick(item.id, field)}
                  aria-label={`Añadir ${label}`}
                >
                  <span aria-hidden><Tag size={13} /></span>
                </button>
              )
            )
          )}

          {item.stores.length > 0 ? (
            item.stores.map(store => (
              item.purchased ? (
                <span key={store} className="item-card__tag">
                  <span aria-hidden><Store size={13} /></span> {store}
                </span>
              ) : (
                <button
                  key={store}
                  className="item-card__tag"
                  onClick={() => onTagClick(item.id, 'stores')}
                >
                  <span aria-hidden><Store size={13} /></span> {store}
                </button>
              )
            ))
          ) : (
            !item.purchased && (
              <button
                className="item-card__tag item-card__tag--cta"
                onClick={() => onTagClick(item.id, 'stores')}
                aria-label="Añadir tienda"
              >
                <span aria-hidden><Store size={13} /></span>
              </button>
            )
          )}

          {/* Price tag — always visible; purchased items can log, unpurchased can view history */}
          {item.price != null ? (
            <button
              className="item-card__tag item-card__tag--price"
              onClick={e => { e.stopPropagation(); onPriceClick?.(item.id) }}
            >
              <span aria-hidden><Coins size={13} /></span>{' '}
              {formatPrice(item.price, item.price_per)}
            </button>
          ) : (
            <button
              className="item-card__tag item-card__tag--cta"
              onClick={e => { e.stopPropagation(); onPriceClick?.(item.id) }}
              aria-label={item.purchased ? 'Registrar precio' : 'Historial de precios'}
            >
              <span aria-hidden><Coins size={13} /></span>
            </button>
          )}

          {item.purchased && onClone && (
            <button
              className="item-card__tag item-card__tag--buy-again"
              onClick={e => { e.stopPropagation(); onClone(item.id) }}
            >
              <span aria-hidden><RotateCcw size={13} /></span> Volver a comprar
            </button>
          )}
        </div>
      </div>

      <div className="item-card__right">
        <div
          className="item-card__avatar"
          style={member?.photoUrl ? {} : avatarStyle}
          aria-hidden
        >
          {member?.photoUrl
            ? <img src={member.photoUrl} alt={member.displayName} className="item-card__avatar-img" />
            : initial
          }
        </div>
        <button
          className="item-card__menu"
          onClick={e => { e.stopPropagation(); onMenuOpen(item.id) }}
          aria-label="Opciones del producto"
        >
          ⋯
        </button>
      </div>
    </div>
  )
}
