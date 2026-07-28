/** The board — "el tablero" — is the colour of the cardboard a list's paper
 *  lies on. It used to be one warm kraft for the whole product, then briefly a
 *  shared property of each list, and is now a **per-person, per-list
 *  preference**: rule 20 splits a list's identity from its orientation. The
 *  emoji and the name are seen by the whole household and are never local; the
 *  board only helps *you* find the list, so it is yours. Neither is explained
 *  in the interface — they are told apart by where they live.
 *
 *  Two consequences worth knowing. Setting it is **not an owner action**: any
 *  member changes their own and nobody else sees it. And "la verde" has stopped
 *  being a name the household can say out loud; the emoji at 28px in the panel
 *  is what replaced it.
 */

export const BOARDS = [
  'kraft',
  'lino',
  'salvia',
  'niebla',
  'barro',
  'pizarra',
] as const

export type Board = (typeof BOARDS)[number]

/** Shown next to nothing in the UI — the swatches are the labels. Kept for
 *  screen readers, which have no other way to tell six squares apart. */
export const BOARD_NAMES: Record<Board, string> = {
  kraft: 'Kraft',
  lino: 'Lino',
  salvia: 'Salvia',
  niebla: 'Niebla',
  barro: 'Barro',
  pizarra: 'Pizarra',
}

/** Per user *and* per list, because the point is telling your own lists apart.
 *  Device-local for now: making it follow one person across their phone and
 *  their tablet needs the `UserListPref` table the spec describes, which is a
 *  backend change and not in this pass. */
const KEY = 'cqs_board'

function isBoard(value: unknown): value is Board {
  return BOARDS.includes(value as Board)
}

function storageKey(userId: string, listId: string): string {
  return `${KEY}_${userId}_${listId}`
}

/** Assigned on first entry rather than left to a default, and assigned by
 *  *rotating* the six rather than picking at random: two of your lists must not
 *  open the same colour, or the board is not doing the one job it has. The
 *  rotation is keyed on how many boards you have already been given, so it is
 *  deterministic and stable — the same list keeps the same board. */
function assignBoard(userId: string, listId: string): Board {
  let taken = 0
  try {
    const prefix = `${KEY}_${userId}_`
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) taken += 1
    }
  } catch {
    // Unreadable storage means everyone gets kraft, which is the board this
    // product had before there were six. Nothing breaks; it is just duller.
  }
  const board = BOARDS[taken % BOARDS.length]
  setBoard(userId, listId, board)
  return board
}

export function getBoard(userId: string, listId: string): Board {
  try {
    const raw = localStorage.getItem(storageKey(userId, listId))
    if (isBoard(raw)) return raw
  } catch {
    return BOARDS[0]
  }
  return assignBoard(userId, listId)
}

export function setBoard(userId: string, listId: string, board: Board): void {
  try {
    localStorage.setItem(storageKey(userId, listId), board)
  } catch {
    // ignore quota/security errors — the session still honours the choice.
  }
  emit()
}

// ── subscription ───────────────────────────────────────────────────────────
// The picker lives inside the list's menu sheet and the board it sets paints
// the screen underneath it, so the two need to agree without threading a
// callback through three components. Same shape as lib/theme.

type Listener = () => void

const listeners = new Set<Listener>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

export function subscribeBoard(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
