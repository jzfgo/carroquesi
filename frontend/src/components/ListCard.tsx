import { GripVertical, MoreHorizontal, Star } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { ApiList } from '../types'
import './ListCard.css'

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

/**
 * A row in the list panel — flat, on the sheet, separated from its neighbours
 * by a 1px rule and nothing else. No card, no border, no shadow, and above all
 * no board colour: the paper stays inside an open list (rule 8), which is what
 * makes entering one mean something. Two forms proposed for bringing the board
 * out here — as an edge and as a tile behind the emoji — were both refused.
 *
 * The emoji column is 36px with a 28px glyph, up from 26/19. It costs 4px of
 * row height per list and buys the one thing the panel owes the household now
 * that the board is personal: a mark you can point at from across the kitchen.
 */
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
  const { name, emoji, item_count, purchased_count, is_default } = list

  const meta = (() => {
    if (item_count === 0) return 'vacía · añade lo primero'
    // The total is already said by the figure on the right, so it is not said
    // again here (rule 3). What is left to add is how far along it is.
    if (purchased_count > 0) return `${purchased_count} comprados`
    return null
  })()

  const emojiSlot = (() => {
    if (isOwner) {
      return (
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
      )
    }
    if (!emoji) return <span className="list-card__emoji-empty" aria-hidden />
    return (
      <span className="list-card__emoji" aria-hidden>
        {emoji}
      </span>
    )
  })()

  return (
    <div
      className={`list-card${isDragging ? ' list-card--dragging' : ''}${meta ? ' list-card--meta' : ''}`}
      style={style}
    >
      <span className="list-card__drag-handle" aria-hidden {...dragHandleProps}>
        <GripVertical size={14} />
      </span>
      {emojiSlot}
      <button
        className="list-card__tap-target"
        onClick={onClick}
        aria-label={is_default ? `${name} (lista predeterminada)` : name}
      >
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
        {meta && <span className="list-card__subtitle">{meta}</span>}
      </button>
      {/* Rule 6's sibling: a zero is not a figure, it is the absence of one, and
          the meta line has already said "vacía". Drawing both says it twice. */}
      <span className="list-card__count">{item_count || ''}</span>
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
