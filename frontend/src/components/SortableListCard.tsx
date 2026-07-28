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
  } = useSortable({ id: list.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef}>
      <ListCard
        list={list}
        onClick={onClick}
        /* No aria-roledescription at all, rather than a translated one.

           The attribute *replaces* the role announcement instead of adding to
           it, so any value here costs the row its "botón" — and this row is a
           button whose job is to open a list. dnd-kit's default is the English
           'sortable'; the obvious repair, 'lista', is worse, because "lista"
           is what Spanish screen readers already say for role="list", so the
           control would announce itself with the vocabulary of a static
           container.

           The list-ness is carried twice already: the accessible name is the
           list's name, and the panel above is headed "Tus listas".
           aria-roledescription is for widgets whose role genuinely fails to
           describe them; "botón" describes this one exactly.

           Overridden to undefined rather than destructured out, because React
           omits an attribute set to undefined entirely — and an *absent*
           aria-roledescription is what ARIA asks for; an empty one is invalid
           and only works because user agents are told to ignore it. It comes
           last so it is correct by inspection rather than by the fact that
           `listeners` happens not to carry the key.

           Worth keeping in mind: this rode here on the same {...attributes}
           spread as the screen-reader instructions, and reached the button for
           the same reason — the grip it used to sit on was aria-hidden and
           swallowed it. One aria-hidden was suppressing three separate
           problems at once. */
        dragHandleProps={{
          ...attributes,
          ...listeners,
          'aria-roledescription': undefined,
        }}
        style={style}
        isDragging={isDragging}
      />
    </div>
  )
}
