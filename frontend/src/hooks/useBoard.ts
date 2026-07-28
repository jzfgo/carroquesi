import { useCallback, useSyncExternalStore } from 'react'
import { getBoard, setBoard, subscribeBoard, type Board } from '../lib/boards'

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
  const set = useCallback(
    (next: Board) => setBoard(userId, listId, next),
    [userId, listId],
  )
  return [board, set]
}
