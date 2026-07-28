import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARDS, getBoard, setBoard, subscribeBoard } from './boards'

beforeEach(() => {
  localStorage.clear()
})

describe('the board is assigned, not defaulted', () => {
  it('gives a list a board the first time it is entered', () => {
    expect(BOARDS).toContain(getBoard('u1', 'l1'))
  })

  it('keeps giving the same list the same board', () => {
    const first = getBoard('u1', 'l1')
    expect(getBoard('u1', 'l1')).toBe(first)
    expect(getBoard('u1', 'l1')).toBe(first)
  })

  it('rotates the six, so two of your lists never start alike', () => {
    const assigned = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((id) =>
      getBoard('u1', id),
    )
    expect(new Set(assigned).size).toBe(6)
    expect(assigned).toEqual([...BOARDS])
  })

  it('wraps round on the seventh, which is the first repeat there can be', () => {
    const assigned = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) =>
      getBoard('u1', id),
    )
    expect(assigned[6]).toBe(assigned[0])
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
    ;['l1', 'l2', 'l3'].forEach((id) => getBoard('marta', id))
    // Luis has been given nothing yet, so his first list starts at the top.
    expect(getBoard('luis', 'l9')).toBe(BOARDS[0])
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
