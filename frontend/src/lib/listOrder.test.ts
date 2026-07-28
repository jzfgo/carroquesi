import { describe, expect, it } from 'vitest'
import type { ApiList } from '../types'
import { moveAnnouncement, moveList } from './listOrder'

const list = (id: string, name: string): ApiList =>
  ({ id, name, emoji: '🛒' }) as ApiList

const three = [list('a', 'Mercado'), list('b', 'Costco'), list('c', 'Farmacia')]

describe('moveList', () => {
  it('swaps a list with the one above it', () => {
    expect(moveList(three, 'b', 'up').map((l) => l.id)).toEqual(['b', 'a', 'c'])
  })

  it('swaps a list with the one below it', () => {
    expect(moveList(three, 'b', 'down').map((l) => l.id)).toEqual([
      'a',
      'c',
      'b',
    ])
  })

  it('leaves the array alone at the top', () => {
    expect(moveList(three, 'a', 'up')).toBe(three)
  })

  it('leaves the array alone at the bottom', () => {
    expect(moveList(three, 'c', 'down')).toBe(three)
  })

  it('leaves the array alone for an id it does not hold', () => {
    expect(moveList(three, 'nope', 'up')).toBe(three)
  })

  // The identity is the contract, not an implementation detail: DashboardScreen
  // reads it to decide whether anything happened at all, and skips saving the
  // order and announcing a move when nothing did.
  it('returns the same reference when nothing moves, and a new one when it does', () => {
    expect(moveList(three, 'a', 'up')).toBe(three)
    expect(moveList(three, 'a', 'down')).not.toBe(three)
  })

  it('does not mutate the array it was given', () => {
    const before = three.map((l) => l.id)
    moveList(three, 'b', 'up')
    expect(three.map((l) => l.id)).toEqual(before)
  })

  it('handles a single list, which cannot move either way', () => {
    const one = [list('a', 'Mercado')]
    expect(moveList(one, 'a', 'up')).toBe(one)
    expect(moveList(one, 'a', 'down')).toBe(one)
  })
})

describe('moveAnnouncement', () => {
  it('names the list and where it landed', () => {
    expect(moveAnnouncement(three, 'b')).toBe(
      'Costco movida a la posición 2 de 3.',
    )
  })

  // Why the position is in the string at all. A polite live region re-announces
  // on a *change* of text, so a direction-only message ("movida arriba") is
  // said once and then never again however many times it is pressed.
  it('differs between consecutive moves of the same list', () => {
    const after1 = moveList(three, 'c', 'up')
    const after2 = moveList(after1, 'c', 'up')
    expect(moveAnnouncement(after1, 'c')).not.toBe(
      moveAnnouncement(after2, 'c'),
    )
  })

  it('is empty for an id the array does not hold', () => {
    expect(moveAnnouncement(three, 'nope')).toBe('')
  })
})
