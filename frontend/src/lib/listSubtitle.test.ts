import { describe, expect, it } from 'vitest'
import { listSubtitle } from './listSubtitle'

const marta = { user_id: 'u-marta', display_name: 'Marta' }
const luis = { user_id: 'u-luis', display_name: 'Luis' }
const me = { user_id: 'u-me', display_name: 'Yo Mismo' }

describe('listSubtitle', () => {
  it('names one co-member plus tú', () => {
    expect(listSubtitle({ members: [marta, me], cart_count: 0 }, 'u-me')).toBe(
      'Marta y tú',
    )
  })

  it('joins several co-members with commas and closes with y tú', () => {
    expect(
      listSubtitle({ members: [marta, luis, me], cart_count: 0 }, 'u-me'),
    ).toBe('Marta, Luis y tú')
  })

  it('appends the cart count when something is in the cart', () => {
    expect(listSubtitle({ members: [marta, me], cart_count: 3 }, 'u-me')).toBe(
      'Marta y tú · 3 en el carro',
    )
  })

  it('keeps "en el carro" invariant at count 1', () => {
    expect(listSubtitle({ members: [marta, me], cart_count: 1 }, 'u-me')).toBe(
      'Marta y tú · 1 en el carro',
    )
  })

  it('is empty for a solo list with an empty cart', () => {
    expect(listSubtitle({ members: [me], cart_count: 0 }, 'u-me')).toBe('')
  })

  it('shows only the cart part for a solo list with items in the cart', () => {
    expect(listSubtitle({ members: [me], cart_count: 2 }, 'u-me')).toBe(
      '2 en el carro',
    )
  })

  it('tolerates cached payloads that predate members and cart_count', () => {
    expect(listSubtitle({}, 'u-me')).toBe('')
    expect(listSubtitle({ members: null, cart_count: null }, 'u-me')).toBe('')
  })

  it('does not name the viewer twice when the members list omits them', () => {
    // A payload can arrive without the viewer (e.g. freshly accepted invite
    // raced with the read); the co-members still read naturally.
    expect(listSubtitle({ members: [marta], cart_count: 0 }, 'u-me')).toBe(
      'Marta y tú',
    )
  })
})
