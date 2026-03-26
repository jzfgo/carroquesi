import './ItemCard.css'
import type { ListItem, Member, TagField } from '../types'

const TAG_CONFIG: { field: TagField; emoji: string; label: string }[] = [
  { field: 'variety', emoji: '✨', label: 'variedad' },
  { field: 'brand',   emoji: '🏷️', label: 'marca' },
  { field: 'store',   emoji: '🏪', label: 'tienda' },
]

interface Props {
  item: ListItem
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField) => void
  onMenuOpen: (itemId: string) => void
}

export function ItemCard({ item, members, onTogglePurchased, onTagClick, onMenuOpen }: Props) {
  const member = members.get(item.added_by)
  const initial = member?.initial ?? '?'
  const colour  = member?.colour ?? '#b0adb5'

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
          {item.quantity ? (
            <button
              className="item-card__qty"
              onClick={() => onTagClick(item.id, 'quantity')}
              aria-label={item.quantity}
            >
              {item.quantity}
            </button>
          ) : (
            <button
              className="item-card__tag item-card__tag--cta"
              onClick={() => onTagClick(item.id, 'quantity')}
              aria-label="Añadir cantidad"
            >
              <span aria-hidden>+ 🔢</span>
            </button>
          )}
        </div>

        <div className="item-card__tags">
          {TAG_CONFIG.map(({ field, emoji, label }) =>
            item[field] ? (
              <button
                key={field}
                className="item-card__tag"
                onClick={() => onTagClick(item.id, field)}
              >
                <span aria-hidden>{emoji}</span> {item[field]}
              </button>
            ) : (
              <button
                key={field}
                className="item-card__tag item-card__tag--cta"
                onClick={() => onTagClick(item.id, field)}
                aria-label={`Añadir ${label}`}
              >
                <span aria-hidden>+ {emoji}</span>
              </button>
            )
          )}
        </div>
      </div>

      <div className="item-card__right">
        <div
          className="item-card__avatar"
          style={{ background: member?.photoUrl ? 'transparent' : colour }}
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
