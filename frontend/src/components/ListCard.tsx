import type { CSSProperties } from 'react'
import './ListCard.css'
import { ProgressBar } from './ProgressBar'
import type { ApiList } from '../types'

interface Props {
  list: ApiList
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
  isOwner,
  onClick,
  onMenuOpen,
  onEmojiTap,
  dragHandleProps,
  style,
  isDragging,
}: Props) {
  const { name, emoji, item_count, purchased_count } = list

  const emojiSlot = (() => {
    if (isOwner) {
      return (
        <button
          className={`list-card__emoji${!emoji ? ' list-card__emoji--placeholder' : ''}`}
          onClick={e => { e.stopPropagation(); onEmojiTap?.() }}
          aria-label={emoji ? 'Cambiar emoji' : 'Añadir emoji'}
        >
          {emoji ?? '＋'}
        </button>
      )
    }
    if (!emoji) return null
    return <span className="list-card__emoji" aria-hidden>{emoji}</span>
  })()

  return (
    <div className={`list-card${isDragging ? ' list-card--dragging' : ''}`} style={style}>
      <span className="list-card__drag-handle" aria-hidden {...dragHandleProps}>⠿</span>
      {emojiSlot}
      <button className="list-card__tap-target" onClick={onClick} aria-label={name}>
        <span className="list-card__name">{name}</span>
        <ProgressBar purchased={purchased_count} total={item_count} />
        {item_count > 0 && (
          <span className="list-card__subtitle">
            {purchased_count} de {item_count} comprados
          </span>
        )}
      </button>
      <button className="list-card__menu-btn" onClick={onMenuOpen} aria-label="Opciones">
        ⋯
      </button>
    </div>
  )
}
