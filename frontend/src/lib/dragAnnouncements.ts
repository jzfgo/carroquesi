import type { Announcements, UniqueIdentifier } from '@dnd-kit/core'
import type { ApiList } from '../types'

/** What the live region says while a list is being dragged.
 *
 *  Out here rather than inside DashboardScreen because it is the only part of
 *  the drag that nothing else can observe. jsdom performs no drag and
 *  toHaveScreenshot() sees pixels, so a wrong announcement is invisible to the
 *  whole suite — which is how two of them shipped in consecutive rounds of
 *  review. As a pure function of the list order it can simply be asserted.
 *
 *  dnd-kit's defaults are English and interpolate the draggable's id
 *  (@dnd-kit/core dist :55 — "Picked up draggable item " + active.id), and an
 *  id here is a UUID, so the default reads one aloud on every successful long
 *  press. A name and a position are what someone who cannot see the row move
 *  actually needs.
 *
 *  `state` is passed in rather than closed over so this can be rebuilt whenever
 *  the order changes without losing the one bit a drag carries — whether it has
 *  left the row it started on. A plain mutable box, because that is all it is:
 *  nothing renders from it, and a test can drive it directly.
 */
export interface DragState {
  hasLeftOrigin: boolean
}

export function createDragAnnouncements(
  lists: ApiList[] | null,
  state: DragState,
): Announcements {
  const describe = (id: UniqueIdentifier) => {
    const index = lists?.findIndex((l) => l.id === id) ?? -1
    const list = index >= 0 ? lists![index] : null
    return {
      name: list?.name ?? 'la lista',
      position: index >= 0 ? `${index + 1} de ${lists!.length}` : null,
    }
  }

  return {
    onDragStart({ active }) {
      state.hasLeftOrigin = false
      return `Has cogido ${describe(active.id).name}.`
    },

    onDragOver({ active, over }) {
      if (!over) return undefined

      // Hovering itself means one of two opposite things, and one condition
      // cannot answer both.
      //
      // dnd-kit dispatches a DragOver as the drag starts, and with
      // closestCenter — which has no distance cutoff — that first `over` is
      // the dragged row itself, at distance zero from its own droppable.
      // Saying "sobre" of the thing already in your hand is noise.
      //
      // The same dispatch fires again when a drag wanders off and comes back,
      // and there it is the most useful thing the region can say: it is the
      // announcement that tells someone the reorder is about to be a no-op.
      // Staying quiet is not neutral — announce() ignores undefined rather
      // than clearing (@dnd-kit/accessibility dist :57), so silence leaves
      // "Sobre Costco, posición 2" standing while the row is back at 1.
      if (over.id === active.id) {
        if (!state.hasLeftOrigin) return undefined
        const { position } = describe(active.id)
        return position
          ? `De vuelta a su posición original, ${position}.`
          : undefined
      }

      state.hasLeftOrigin = true
      const { name, position } = describe(over.id)
      return position ? `Sobre ${name}, posición ${position}.` : undefined
    },

    onDragEnd({ active, over }) {
      const { name } = describe(active.id)
      // Barely reachable with closestCenter, which always returns a nearest
      // droppable — but the type allows null, and so does a list that
      // refetches to empty under a held finger.
      if (!over) return `Has soltado ${name} donde estaba.`
      const { position } = describe(over.id)
      return position
        ? `Has soltado ${name} en la posición ${position}.`
        : `Has soltado ${name}.`
    },

    onDragCancel({ active }) {
      return `Movimiento cancelado. ${describe(active.id).name} vuelve a su sitio.`
    },
  }
}
