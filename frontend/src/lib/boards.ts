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

/** The stored board for one list, or null when this list has never been given
 *  one. A corrupt or unknown value reads as null, so it is reassigned rather
 *  than honoured. */
function readBoard(userId: string, listId: string): Board | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, listId))
    return isBoard(raw) ? raw : null
  } catch {
    return null
  }
}

/** Which boards this person's *other* lists are already sitting on, and how
 *  many assignments they have been given in all. The list being asked about is
 *  excluded so that a corrupt value does not count itself. */
function survey(
  userId: string,
  exceptListId: string,
): { used: Set<Board>; count: number } {
  const used = new Set<Board>()
  let count = 0
  try {
    const prefix = `${KEY}_${userId}_`
    const except = storageKey(userId, exceptListId)
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix) || key === except) continue
      count += 1
      const value = localStorage.getItem(key)
      if (isBoard(value)) used.add(value)
    }
  } catch {
    // Unreadable storage means everyone gets kraft, which is the board this
    // product had before there were six. Nothing breaks; it is just duller.
  }
  return { used, count }
}

/** Assigned on first entry rather than left to a default: two of your lists
 *  must not open the same colour, or the board is not doing the one job it has.
 *  So the choice is the first colour none of your other lists is using, which
 *  past six has to start repeating — there are only six.
 *
 *  Picking the first *free* colour rather than rotating on a count matters for
 *  more than deletions. localStorage has no compare-and-set, so two tabs opening
 *  two never-seen lists at the same instant can both read the same survey and
 *  both write the same board. That window cannot be closed here. What it can be
 *  stopped from doing is *propagating*: a count-based rotation would leave the
 *  skipped colour orphaned for good, while a free-colour search simply hands the
 *  next list the colour the collision missed. */
function pickBoard(userId: string, listId: string): Board {
  const { used, count } = survey(userId, listId)
  return (
    BOARDS.find((board) => !used.has(board)) ?? BOARDS[count % BOARDS.length]
  )
}

/** Pure, and deliberately so: this is `useBoard`'s `getSnapshot`, and
 *  `useSyncExternalStore` may call it speculatively, twice per commit, or from
 *  a render that is later thrown away. It must not write and must not notify.
 *  The board an unassigned list is *going* to get is computed the same way
 *  `ensureBoard` will compute it, so the first paint already shows the colour
 *  the effect is about to persist and nothing flickers. */
export function getBoard(userId: string, listId: string): Board {
  return readBoard(userId, listId) ?? pickBoard(userId, listId)
}

/** Writes the assignment down. Call this on entering a list — from an effect,
 *  never from render. Idempotent, so StrictMode's double-invoke is harmless. */
export function ensureBoard(userId: string, listId: string): void {
  if (readBoard(userId, listId) !== null) return
  writeBoard(userId, listId, pickBoard(userId, listId))
  // Another list with no board of its own may have been computing the very
  // colour just claimed, so let the screens recompute.
  emit()
}

function writeBoard(userId: string, listId: string, board: Board): void {
  try {
    localStorage.setItem(storageKey(userId, listId), board)
  } catch {
    // ignore quota/security errors — the session still honours the choice.
  }
}

export function setBoard(userId: string, listId: string, board: Board): void {
  writeBoard(userId, listId, board)
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
