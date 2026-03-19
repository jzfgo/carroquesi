import './ItemCard.css'
import type { ListItem, Member, TagField } from '../types'

const TAG_CONFIG: { field: TagField; emoji: string; label: string }[] = [
  { field: 'variety', emoji: '✨', label: 'variety' },
  { field: 'brand',   emoji: '🏷️', label: 'brand' },
  { field: 'store',   emoji: '🏪', label: 'store' },
]

interface Props {
  item: ListItem
  members: Map<string, Member>
  onTogglePurchased: (itemId: string) => void
  onTagClick: (itemId: string, field: TagField) => void
}

export function ItemCard({ item, members, onTogglePurchased, onTagClick }: Props) {
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
        aria-label={item.purchased ? 'Mark as not purchased' : 'Mark as purchased'}
      />

      <div className="item-card__body">
        <div className="item-card__name-row">
          <span className="item-card__name">{item.name}</span>
          {item.quantity && (
            <span className="item-card__qty">{item.quantity}</span>
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
                aria-label={`Add ${label}`}
              >
                <span aria-hidden>+ {emoji}</span>
              </button>
            )
          )}
        </div>
      </div>

      <div
        className="item-card__avatar"
        style={{ background: colour }}
        aria-hidden
      >
        {initial}
      </div>
    </div>
  )
}
