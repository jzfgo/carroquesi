import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ApiList } from '../types'
import { ListCard } from './ListCard'

interface Props {
  list: ApiList
  onClick: () => void
}

export function SortableListCard({ list, onClick }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: list.id,
    // dnd-kit defaults this to the literal English 'sortable'
    // (@dnd-kit/sortable dist :395), and aria-roledescription *replaces* the
    // role rather than adding to it — so the row would announce as
    // "Mercado, sortable" instead of "Mercado, botón": an English word in a
    // Spanish app, naming the secondary interaction over the primary one.
    //
    // It rode here on the same {...attributes} spread as the instructions,
    // and for the same reason: it used to land on the grip, which was
    // aria-hidden and swallowed it.
    attributes: { roleDescription: 'lista' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef}>
      <ListCard
        list={list}
        onClick={onClick}
        dragHandleProps={{ ...attributes, ...listeners }}
        style={style}
        isDragging={isDragging}
      />
    </div>
  )
}
