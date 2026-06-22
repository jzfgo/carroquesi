import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ApiList } from '../types'
import { ListCard } from './ListCard'

interface Props {
  list: ApiList
  isOwner: boolean
  onClick: () => void
  onMenuOpen: () => void
  onEmojiTap?: () => void
}

export function SortableListCard({ list, isOwner, onClick, onMenuOpen, onEmojiTap }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef}>
      <ListCard
        list={list}
        isOwner={isOwner}
        onClick={onClick}
        onMenuOpen={onMenuOpen}
        onEmojiTap={onEmojiTap}
        dragHandleProps={{ ...attributes, ...listeners }}
        style={style}
        isDragging={isDragging}
      />
    </div>
  )
}
