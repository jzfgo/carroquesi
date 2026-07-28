import type { ApiList } from '../types'

/** Moving a list one place, for the people a drag cannot reach.
 *
 *  Out here for the same reason the drag announcements are: the interesting
 *  part is a pure function of the order, and a pure function can be asserted
 *  directly instead of inferred from a rendered row.
 *
 *  The `N de M` fragment is deliberately duplicated from lib/dragAnnouncements
 *  rather than shared. The two say different sentences and only agree on that
 *  one clause, and the alternative is editing a file whose every line was
 *  argued over across six rounds of review on #171.
 */
export type Direction = 'up' | 'down'

/** The reordered array, or the same one back when the move is off the end.
 *
 *  Returning the identical reference rather than a copy matters: the caller
 *  hands this straight to setLists, and React skips the re-render when nothing
 *  moved, so pressing Subir on the first row does not repaint the panel.
 */
export function moveList(
  lists: ApiList[],
  id: string,
  direction: Direction,
): ApiList[] {
  const from = lists.findIndex((l) => l.id === id)
  if (from === -1) return lists

  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= lists.length) return lists

  const next = [...lists]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/** What the live region says once a list has moved.
 *
 *  The absolute position is in the sentence, not just the direction, and that
 *  is load-bearing rather than decorative. A polite live region re-announces
 *  when its text *changes*, so "Mercado movida arriba" pressed twice is one
 *  announcement and then silence — the same trap as announce() ignoring an
 *  unchanged value, arriving from the other side. Saying where the row landed
 *  makes consecutive moves differ, and is also the thing someone who cannot see
 *  the panel actually wants to know.
 */
export function moveAnnouncement(lists: ApiList[], id: string): string {
  const index = lists.findIndex((l) => l.id === id)
  if (index === -1) return ''
  const list = lists[index]
  return `${list.name} movida a la posición ${index + 1} de ${lists.length}.`
}
