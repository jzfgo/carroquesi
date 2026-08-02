/** The six board hues an open list's sheet can lie on. */
export const BOARD_NAMES = [
  'kraft',
  'lino',
  'salvia',
  'niebla',
  'barro',
  'pizarra',
] as const

export type BoardName = (typeof BOARD_NAMES)[number]

/**
 * Narrows a server-sent board value to a known name. Kraft is the fallback:
 * a cached payload from before boards existed, or a value this build does
 * not know, must still land on a real board.
 */
export function asBoardName(value: string | null | undefined): BoardName {
  return BOARD_NAMES.includes(value as BoardName)
    ? (value as BoardName)
    : 'kraft'
}
