import { ChevronRight, MoreHorizontal, Star } from 'lucide-react'
import type { CSSProperties } from 'react'
import { listSubtitle } from '../lib/listSubtitle'
import type { ApiList } from '../types'
import './ListCard.css'

interface Props {
  list: ApiList
  currentUserId: string
  isOwner: boolean
  onClick: () => void
  onMenuOpen: () => void
  onEmojiTap?: () => void
  dragHandleProps?: Record<string, unknown>
  style?: CSSProperties
  isDragging?: boolean
}

export function ListCard({
  list,
  currentUserId,
  isOwner,
  onClick,
  onMenuOpen,
  onEmojiTap,
  dragHandleProps,
  style,
  isDragging,
}: Props) {
  const { name, emoji, item_count, purchased_count, is_default } = list

  const subtitle = listSubtitle(list, currentUserId)
  const pending = Math.max(item_count - purchased_count, 0)

  // The emoji column is always rendered, even empty: it is a 36px grid
  // column and the name must stay aligned across rows either way.
  const emojiSlot = isOwner ? (
    <button
      className={`list-card__emoji${!emoji ? ' list-card__emoji--placeholder' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onEmojiTap?.()
      }}
      aria-label={emoji ? 'Cambiar emoji' : 'Añadir emoji'}
    >
      {emoji ?? '＋'}
    </button>
  ) : (
    <span className="list-card__emoji" aria-hidden>
      {emoji}
    </span>
  )

  return (
    <div
      className={`list-card${isDragging ? ' list-card--dragging' : ''}${subtitle ? ' list-card--subtitled' : ''}`}
      style={style}
      {...dragHandleProps}
    >
      {emojiSlot}
      <button
        className="list-card__main"
        onClick={onClick}
        aria-label={is_default ? `${name} (lista predeterminada)` : name}
      >
        <span className="list-card__text">
          <span className="list-card__name">
            {is_default && (
              <Star
                size={13}
                fill="currentColor"
                className="list-card__default-star"
                aria-hidden
              />
            )}
            {name}
          </span>
          {subtitle && <span className="list-card__subtitle">{subtitle}</span>}
        </span>
        <span className="list-card__pending">{pending}</span>
        <ChevronRight
          size={14}
          strokeWidth={1.8}
          className="list-card__chevron"
          aria-hidden
        />
      </button>
      <button
        className="list-card__menu-btn"
        onClick={onMenuOpen}
        aria-label="Opciones"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  )
}
