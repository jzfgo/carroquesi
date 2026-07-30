import type { ListItem } from '../types'

/**
 * Merge a list read into the items already on screen.
 *
 * A read that was in flight while the user wrote carries the list from before
 * that write, so painting the response whole would undo the write. The caller
 * says which items were written locally after the read started; those keep
 * their local value and every other item takes the server value.
 */
export function reconcileItems(
  serverItems: ListItem[],
  localItems: ListItem[],
  isLocallyNewer: (itemId: string) => boolean,
): ListItem[] {
  const localById = new Map(localItems.map((i) => [i.id, i]))
  const merged: ListItem[] = []

  for (const serverItem of serverItems) {
    if (!isLocallyNewer(serverItem.id)) {
      merged.push(serverItem)
      continue
    }
    // Written locally and no longer on screen: a delete the read predates.
    const local = localById.get(serverItem.id)
    if (local) merged.push(local)
  }

  // On screen but unknown to the server: an add the read predates. Put each
  // one back where it sits locally so it does not jump.
  const serverIds = new Set(serverItems.map((i) => i.id))
  localItems.forEach((local, index) => {
    if (serverIds.has(local.id) || !isLocallyNewer(local.id)) return
    merged.splice(Math.min(index, merged.length), 0, local)
  })

  return merged
}
