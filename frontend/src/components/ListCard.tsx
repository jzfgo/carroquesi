import { ChevronRight, Star } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { ApiList } from '../types'
import './ListCard.css'

interface Props {
  list: ApiList
  onClick: () => void
  dragHandleProps?: Record<string, unknown>
  style?: CSSProperties
  isDragging?: boolean
}

/**
 * A row in the list panel — flat, on the sheet, separated from its neighbours
 * by a 1px rule and nothing else. No card, no border, no shadow, and above all
 * no board colour: the paper stays inside an open list (rule 8), which is what
 * makes entering one mean something. Two forms proposed for bringing the board
 * out here — as an edge and as a tile — were both refused.
 *
 * Four columns and no more: emoji, name, count, chevron. Everything a list can
 * have *done* to it — renamed, shared, deleted, its board and its emoji chosen
 * — is reached by opening the list, so there is one path to each of them and
 * the panel stays what it is, which is a way in.
 *
 * The emoji column is 36px with a 28px glyph, up from 26/19. It costs 4px of
 * row height per list and buys the one thing the panel owes the household now
 * that the board is personal: a mark you can point at from across the kitchen.
 */
export function ListCard({
  list,
  onClick,
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

  return (
    <div
      className={`list-card${isDragging ? ' list-card--dragging' : ''}${meta ? ' list-card--meta' : ''}`}
      style={style}
    >
      <span className="list-card__emoji" aria-hidden>
        {emoji}
      </span>
      {/* Also the drag handle. There is no grip to see: reordering is a
          long press, which is what a touch device already means by "pick this
          up and move it", and one less column in a row that has four. */}
      <button
        className="list-card__tap-target"
        onClick={onClick}
        aria-label={is_default ? `${name} (lista predeterminada)` : name}
        {...dragHandleProps}
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
      <ChevronRight className="list-card__chevron" size={14} aria-hidden />
    </div>
  )
}
