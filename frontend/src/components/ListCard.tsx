import { ChevronDown, ChevronRight, ChevronUp, Star } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { ApiList } from '../types'
import './ListCard.css'

interface Props {
  list: ApiList
  onClick: () => void
  dragHandleProps?: Record<string, unknown>
  style?: CSSProperties
  isDragging?: boolean
  /** Arrange rather than browse: the row stops being a way in and grows the
   *  two buttons that are the only reordering anyone without a pointer has. */
  reordering?: boolean
  onMove?: (direction: 'up' | 'down') => void
  isFirst?: boolean
  isLast?: boolean
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
  reordering,
  onMove,
  isFirst,
  isLast,
}: Props) {
  const { name, emoji, item_count, purchased_count, is_default } = list

  const meta = (() => {
    if (item_count === 0) return 'vacía · añade lo primero'
    // The total is already said by the figure on the right, so it is not said
    // again here (rule 3). What is left to add is how far along it is.
    if (purchased_count > 0) return `${purchased_count} comprados`
    return null
  })()

  const label = is_default ? `${name} (lista predeterminada)` : name

  const body = (
    <>
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
    </>
  )

  return (
    <div
      className={`list-card${isDragging ? ' list-card--dragging' : ''}${meta ? ' list-card--meta' : ''}${reordering ? ' list-card--reordering' : ''}`}
      style={style}
    >
      <span className="list-card__emoji" aria-hidden>
        {emoji}
      </span>
      {reordering ? (
        // A span, not a disabled button: while arranging, the row is not a
        // control at all, and a disabled button is still an announced one.
        // Nothing here carries dragHandleProps either — see the comment on the
        // DndContext in DashboardScreen for why that is a rule and not a
        // shortcut.
        <span className="list-card__tap-target">
          {body}
          {/* The star is aria-hidden and the label that carries "(lista
              predeterminada)" belongs to the button branch, so without this the
              one state built for people who cannot see the row is also the one
              state that stops telling them which list is the default. Said as
              text inside the span rather than as an aria-label on it: a span is
              not a control, and aria-label on a generic element is exposed
              inconsistently. */}
          {is_default && (
            <span className="sr-only"> (lista predeterminada)</span>
          )}
        </span>
      ) : (
        // Also the drag handle. There is no grip to see: reordering is a
        // long press, which is what a touch device already means by "pick this
        // up and move it", and one less column in a row that has four.
        <button
          className="list-card__tap-target"
          onClick={onClick}
          aria-label={label}
          {...dragHandleProps}
        >
          {body}
        </button>
      )}
      {reordering ? (
        // The name is in each label because the buttons are read out of
        // context — a screen reader moving button to button gets "Subir" four
        // times over otherwise, with nothing to say which list it would move.
        <span className="list-card__move">
          {/* aria-disabled, not disabled, and the difference is the whole
              interaction. Moving a list to the top is the move that makes its
              own Subir unavailable — and a browser blurs an element the moment
              it becomes truly disabled, so focus would land on the body exactly
              when someone finished the thing they set out to do, every time.
              aria-disabled announces it as unavailable while leaving it
              focusable and in the tab order, so the place is kept. The handler
              guards instead of the attribute. */}
          <button
            className="list-card__move-button"
            onClick={() => !isFirst && onMove?.('up')}
            aria-disabled={!!isFirst}
            aria-label={`Subir ${name}`}
          >
            <ChevronUp size={16} aria-hidden />
          </button>
          <button
            className="list-card__move-button"
            onClick={() => !isLast && onMove?.('down')}
            aria-disabled={!!isLast}
            aria-label={`Bajar ${name}`}
          >
            <ChevronDown size={16} aria-hidden />
          </button>
        </span>
      ) : (
        <>
          {/* Rule 6's sibling: a zero is not a figure, it is the absence of
              one, and the meta line has already said "vacía". Drawing both
              says it twice. */}
          <span className="list-card__count">{item_count || ''}</span>
          <ChevronRight className="list-card__chevron" size={14} aria-hidden />
        </>
      )}
    </div>
  )
}
