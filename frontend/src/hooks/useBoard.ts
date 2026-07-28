import { useCallback, useEffect, useSyncExternalStore } from 'react'
import {
  ensureBoard,
  getBoard,
  setBoard,
  subscribeBoard,
  type Board,
} from '../lib/boards'

/** Which board this person has for this list. Reads through the store in
 *  lib/boards so the screen and the picker that sits over it stay in step. */
export function useBoard(
  userId: string,
  listId: string,
): [Board, (board: Board) => void] {
  const getSnapshot = useCallback(
    () => getBoard(userId, listId),
    [userId, listId],
  )
  const board = useSyncExternalStore(subscribeBoard, getSnapshot, getSnapshot)

  // The assignment is a write, so it belongs here and not in getSnapshot, which
  // React requires to be pure. getBoard already returns the colour this will
  // persist, so the effect settles what the first paint has shown rather than
  // changing it.
  useEffect(() => {
    ensureBoard(userId, listId)
  }, [userId, listId])

  const set = useCallback(
    (next: Board) => setBoard(userId, listId, next),
    [userId, listId],
  )
  return [board, set]
}
