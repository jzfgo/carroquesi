import { describe, expect, it } from 'vitest'
import type { ApiList } from '../types'
import { createDragAnnouncements } from './dragAnnouncements'

const list = (id: string, name: string): ApiList =>
  ({ id, name }) as unknown as ApiList

const LISTS = [list('a', 'Mercado'), list('b', 'Costco'), list('c', 'Fiesta')]

/** dnd-kit hands the announcement handlers `{active}` / `{active, over}`. Only
 *  the ids matter here, so the rest of the event is not built. */
const ref = (id: string) => ({ id }) as never
const make = (lists: ApiList[] | null = LISTS) =>
  createDragAnnouncements(lists, { hasLeftOrigin: false })

describe('picking a list up', () => {
  it('names it rather than reading its id aloud', () => {
    const a = make()
    expect(a.onDragStart({ active: ref('a') } as never)).toBe(
      'Has cogido Mercado.',
    )
  })
})

describe('hovering another list', () => {
  it('says which one, and where it would land', () => {
    const a = make()
    a.onDragStart({ active: ref('a') } as never)
    expect(a.onDragOver({ active: ref('a'), over: ref('b') } as never)).toBe(
      'Sobre Costco, posición 2 de 3.',
    )
  })
})

// The two meanings of hovering yourself. dnd-kit fires the same dispatch for
// both, and the difference is only whether the drag has left home yet.
describe('hovering itself', () => {
  it('stays quiet at the start, so the pickup message stands', () => {
    const a = make()
    a.onDragStart({ active: ref('a') } as never)
    // closestCenter matches the dragged row's own droppable at distance zero,
    // so this fires immediately after the pickup.
    expect(
      a.onDragOver({ active: ref('a'), over: ref('a') } as never),
    ).toBeUndefined()
  })

  it('speaks up on the way back, because silence would leave a lie standing', () => {
    const a = make()
    a.onDragStart({ active: ref('a') } as never)
    a.onDragOver({ active: ref('a'), over: ref('a') } as never)
    a.onDragOver({ active: ref('a'), over: ref('b') } as never)

    // Returning to the origin. announce() ignores undefined rather than
    // clearing, so staying quiet here would leave "Sobre Costco, posición 2"
    // in the live region while the row is back at position 1.
    expect(a.onDragOver({ active: ref('a'), over: ref('a') } as never)).toBe(
      'De vuelta a su posición original, 1 de 3.',
    )
  })

  it('goes quiet again for a second drag, which starts at home', () => {
    const a = make()
    a.onDragStart({ active: ref('a') } as never)
    a.onDragOver({ active: ref('a'), over: ref('b') } as never)
    a.onDragEnd({ active: ref('a'), over: ref('b') } as never)

    a.onDragStart({ active: ref('a') } as never)
    expect(
      a.onDragOver({ active: ref('a'), over: ref('a') } as never),
    ).toBeUndefined()
  })
})

describe('hovering nothing at all', () => {
  it('says so rather than leaving the last target standing', () => {
    const a = make()
    a.onDragStart({ active: ref('a') } as never)
    a.onDragOver({ active: ref('a'), over: ref('b') } as never)

    // The live region still holds "Sobre Costco, posición 2 de 3" at this
    // point, so returning undefined would keep asserting a target that is no
    // longer under the row.
    expect(a.onDragOver({ active: ref('a'), over: null } as never)).toBe(
      'Sin destino. Suelta para dejar Mercado donde está.',
    )
  })
})

describe('dropping', () => {
  it('says where it landed', () => {
    const a = make()
    expect(a.onDragEnd({ active: ref('a'), over: ref('c') } as never)).toBe(
      'Has soltado Mercado en la posición 3 de 3.',
    )
  })

  it('says nothing moved when there was nothing under it', () => {
    const a = make()
    expect(a.onDragEnd({ active: ref('a'), over: null } as never)).toBe(
      'Has soltado Mercado donde estaba.',
    )
  })

  it('says so when the drag is cancelled', () => {
    const a = make()
    expect(a.onDragCancel({ active: ref('a') } as never)).toBe(
      'Movimiento cancelado. Mercado vuelve a su sitio.',
    )
  })
})

describe('when the list is not there', () => {
  it('falls back rather than naming an id', () => {
    const a = make(null)
    expect(a.onDragStart({ active: ref('a') } as never)).toBe(
      'Has cogido la lista.',
    )
    expect(
      a.onDragOver({ active: ref('a'), over: ref('b') } as never),
    ).toBeUndefined()
  })
})

describe('reading the order', () => {
  it('keeps the drag flag across a rebuild, so the order can change under it', () => {
    // The component rebuilds this whenever `lists` changes. The box is what
    // survives, and without it a rebuild mid-drag would forget the drag had
    // ever left home — silencing the return-to-origin all over again.
    const state = { hasLeftOrigin: false }
    const first = createDragAnnouncements(LISTS, state)
    first.onDragStart({ active: ref('a') } as never)
    first.onDragOver({ active: ref('a'), over: ref('b') } as never)

    const rebuilt = createDragAnnouncements(LISTS, state)
    expect(
      rebuilt.onDragOver({ active: ref('a'), over: ref('a') } as never),
    ).toBe('De vuelta a su posición original, 1 de 3.')
  })
})
