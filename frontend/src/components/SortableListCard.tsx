import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ApiList } from '../types'
import { ListCard } from './ListCard'

interface Props {
  list: ApiList
  currentUserId: string
  isOwner: boolean
  onClick: () => void
  onMenuOpen: () => void
  onEmojiTap?: () => void
}

export function SortableListCard({
  list,
  currentUserId,
  isOwner,
  onClick,
  onMenuOpen,
  onEmojiTap,
}: Props) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: list.id,
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef}>
      {/* The whole row is the drag handle. Only the sensor listeners are
          spread: the sortable `attributes` would put role="button" on a row
          that contains real buttons, and no keyboard sensor is configured
          that could honour them. Taps stay taps because both sensors gate
          activation (8px of travel, or a 200ms hold), and once a drag has
          activated dnd-kit swallows the click that follows it. */}
      <ListCard
        list={list}
        currentUserId={currentUserId}
        isOwner={isOwner}
        onClick={onClick}
        onMenuOpen={onMenuOpen}
        onEmojiTap={onEmojiTap}
        dragHandleProps={listeners}
        style={style}
        isDragging={isDragging}
      />
    </div>
  )
}
