import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOARDS,
  ensureBoard,
  getBoard,
  setBoard,
  subscribeBoard,
} from './boards'

beforeEach(() => {
  localStorage.clear()
})

/** Entering a list: the assignment is written down, then read back. In the app
 *  the write is an effect in `useBoard` and the read is its snapshot — the two
 *  are deliberately separate, so the tests keep them separate too. */
function enter(userId: string, listId: string) {
  ensureBoard(userId, listId)
  return getBoard(userId, listId)
}

describe('the board is assigned, not defaulted', () => {
  it('gives a list a board the first time it is entered', () => {
    expect(BOARDS).toContain(enter('u1', 'l1'))
  })

  it('keeps giving the same list the same board', () => {
    const first = enter('u1', 'l1')
    expect(enter('u1', 'l1')).toBe(first)
    expect(getBoard('u1', 'l1')).toBe(first)
  })

  it('rotates the six, so two of your lists never start alike', () => {
    const assigned = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((id) =>
      enter('u1', id),
    )
    expect(new Set(assigned).size).toBe(6)
    expect(assigned).toEqual([...BOARDS])
  })

  it('wraps round on the seventh, which is the first repeat there can be', () => {
    const assigned = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) =>
      enter('u1', id),
    )
    expect(assigned[6]).toBe(assigned[0])
  })

  it('takes the colour a collision missed rather than orphaning it', () => {
    // Two tabs racing can land two lists on the same board; localStorage has no
    // compare-and-set, so that window cannot be closed. What must not happen is
    // the gap propagating — the next list takes lino, not salvia.
    setBoard('u1', 'l1', 'kraft')
    setBoard('u1', 'l2', 'kraft')
    expect(enter('u1', 'l3')).toBe('lino')
  })

  it('reuses a freed colour once a list stops holding it', () => {
    ;['l1', 'l2'].forEach((id) => enter('u1', id))
    setBoard('u1', 'l1', 'pizarra')
    // kraft is nobody's now, so it is the first one free again.
    expect(enter('u1', 'l3')).toBe('kraft')
  })
})

describe('reading a board is pure, because it is a getSnapshot', () => {
  // useSyncExternalStore may call getSnapshot speculatively, more than once per
  // commit, or from a render that is later thrown away. A write or a notify in
  // there is a contract violation, so this pins it down.
  it('does not write when the list has no board yet', () => {
    getBoard('u1', 'l1')
    expect(localStorage.getItem('cqs_board_u1_l1')).toBeNull()
  })

  it('does not notify subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBoard(listener)
    getBoard('u1', 'l1')
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('shows the colour the write is about to persist, so nothing flickers', () => {
    ;['l1', 'l2'].forEach((id) => enter('u1', id))
    const shown = getBoard('u1', 'l3')
    ensureBoard('u1', 'l3')
    expect(getBoard('u1', 'l3')).toBe(shown)
  })

  it('is stable across repeated calls', () => {
    const first = getBoard('u1', 'l1')
    expect(getBoard('u1', 'l1')).toBe(first)
    expect(getBoard('u1', 'l1')).toBe(first)
  })
})

describe('writing a board down', () => {
  it('does not overwrite a board the list already has', () => {
    setBoard('u1', 'l1', 'barro')
    ensureBoard('u1', 'l1')
    expect(getBoard('u1', 'l1')).toBe('barro')
  })

  it('is idempotent, so StrictMode running the effect twice is harmless', () => {
    ensureBoard('u1', 'l1')
    const first = getBoard('u1', 'l1')
    ensureBoard('u1', 'l1')
    expect(getBoard('u1', 'l1')).toBe(first)
  })
})

describe('the board is per person, not per list', () => {
  it('does not travel: two members of one list can hold different boards', () => {
    setBoard('marta', 'shared', 'salvia')
    setBoard('luis', 'shared', 'barro')

    expect(getBoard('marta', 'shared')).toBe('salvia')
    expect(getBoard('luis', 'shared')).toBe('barro')
  })

  it('a member choosing their own does not need to own the list', () => {
    // Nothing here takes an owner flag, which is the point: rule 20 makes this
    // orientation rather than identity, so it is not an owner action.
    setBoard('guest', 'someone-elses-list', 'pizarra')
    expect(getBoard('guest', 'someone-elses-list')).toBe('pizarra')
  })

  it('counts only your own lists when rotating', () => {
    ;['l1', 'l2', 'l3'].forEach((id) => enter('marta', id))
    // Luis has been given nothing yet, so his first list starts at the top.
    expect(enter('luis', 'l9')).toBe(BOARDS[0])
  })
})

describe('storage failure', () => {
  it('falls back to kraft rather than throwing', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    expect(getBoard('u1', 'l1')).toBe(BOARDS[0])
    getItem.mockRestore()
  })

  it('a corrupt stored value is reassigned, not honoured', () => {
    localStorage.setItem('cqs_board_u1_l1', 'chartreuse')
    expect(BOARDS).toContain(getBoard('u1', 'l1'))
  })
})

describe('subscription', () => {
  it('notifies so the screen under the picker repaints', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBoard(listener)

    setBoard('u1', 'l1', 'niebla')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setBoard('u1', 'l1', 'lino')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
