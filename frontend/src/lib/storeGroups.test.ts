import type { ListItem } from '../types'
import { formatShops, groupByShops } from './storeGroups'

const at = (id: string, ...stores: string[]): ListItem => ({
  id,
  list_id: 'l1',
  name: `Item ${id}`,
  quantity: null,
  purchased_quantity: null,
  brand: null,
  stores,
  purchased: false,
  purchased_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
})

const headings = (items: ListItem[]) =>
  groupByShops(items).map((g) => formatShops(g.shops))

describe('formatShops', () => {
  test('one shop is just its name', () => {
    expect(formatShops(['Mercadona'])).toBe('Mercadona')
  })

  test('two shops are joined by the conjunction', () => {
    expect(formatShops(['Dia', 'Mercadona'])).toBe('Dia o Mercadona')
  })

  describe('past two, the heading counts instead of naming', () => {
    // Measured, not guessed: rendered in the written hand against the 294px a
    // Pixel 10 leaves between the side margins, "BM Supermercados, El Corte
    // Inglés o Mercadona" comes to 379px. The spelled-out triple was always
    // the widest thing here, so the rule has to start above two -- counting
    // only past three never touches the case that wraps.
    test('three: one named, the rest counted', () => {
      expect(formatShops(['Carrefour', 'Dia', 'Mercadona'])).toBe(
        'Carrefour u otras 2 tiendas',
      )
    })

    test('five', () => {
      expect(
        formatShops(['Alcampo', 'Carrefour', 'Dia', 'Lidl', 'Mercadona']),
      ).toBe('Alcampo u otras 4 tiendas')
    })

    test('two are still named in full -- the rule starts above them', () => {
      expect(formatShops(['Dia', 'Mercadona'])).toBe('Dia o Mercadona')
    })

    test('the widest heading the real chain list can produce', () => {
      // The one measured at 288px, against 294px available.
      const many = [
        'BM Supermercados',
        'Carrefour',
        'Consum',
        'DIA',
        'E.Leclerc',
        'El Corte Inglés',
        'Eroski',
        'Gadis',
      ]
      expect(formatShops(many)).toBe('BM Supermercados u otras 7 tiendas')
    })

    test('the conjunction is always u, because otras starts with the /o/ sound', () => {
      const many = ['Alcampo', 'Bonarea', 'Carrefour', 'Dia', 'Eroski']
      expect(formatShops(many)).toContain(' u otras ')
    })

    test('the count is a numeral, the shortest thing readable at a glance', () => {
      const eight = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
      expect(formatShops(eight)).toBe('A u otras 7 tiendas')
    })

    test('and stays a numeral however many there are', () => {
      const fourteen = Array.from({ length: 14 }, (_, n) => `T${n}`)
      expect(formatShops(fourteen)).toBe('T0 u otras 13 tiendas')
    })
  })

  test('no shops is nothing to write', () => {
    expect(formatShops([])).toBe('')
  })

  describe('o becomes u before the /o/ sound', () => {
    test('before a shop starting with o', () => {
      expect(formatShops(['Dia', 'Opencor'])).toBe('Dia u Opencor')
    })

    test('before a silent h — the rule is about the sound, not the letter', () => {
      expect(formatShops(['Dia', 'Hoyuelo'])).toBe('Dia u Hoyuelo')
    })

    test('before an accented O', () => {
      expect(formatShops(['Dia', 'Óptima'])).toBe('Dia u Óptima')
    })

    test('but not before another vowel', () => {
      expect(formatShops(['Dia', 'Alcampo'])).toBe('Dia o Alcampo')
    })

    test('and not for an h that is followed by something else', () => {
      expect(formatShops(['Dia', 'Hipercor'])).toBe('Dia o Hipercor')
    })

    test('only the shop after the conjunction decides it', () => {
      // "Opencor" leads, where no conjunction touches it, so the /o/ that
      // decides is Dia's -- and Dia takes the plain "o".
      expect(formatShops(['Opencor', 'Dia'])).toBe('Opencor o Dia')
    })
  })
})

describe('groupByShops', () => {
  test('an item naming two shops appears once, under both their names', () => {
    const groups = groupByShops([at('a', 'Dia', 'Mercadona')])
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(1)
    expect(formatShops(groups[0].shops)).toBe('Dia o Mercadona')
  })

  test('the same pair written in either order is one group', () => {
    // `stores` is a free-order array server-side, so this is not hypothetical:
    // keying on the written order would file these apart and put the same
    // pair under two headings.
    const groups = groupByShops([
      at('a', 'Mercadona', 'Dia'),
      at('b', 'Dia', 'Mercadona'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  test('shops are written alphabetically, whatever order they were named in', () => {
    // Three shops, so the heading counts -- but which shop it names is still
    // decided by the sort, not by the order the household typed.
    expect(headings([at('a', 'Mercadona', 'Carrefour', 'Dia')])).toEqual([
      'Carrefour u otras 2 tiendas',
    ])
  })

  test('a shop named twice on one item does not double in its heading', () => {
    expect(headings([at('a', 'Dia', 'Dia')])).toEqual(['Dia'])
  })

  test('a pair is not the same group as either shop alone', () => {
    expect(
      headings([
        at('a', 'Dia', 'Mercadona'),
        at('b', 'Dia'),
        at('c', 'Mercadona'),
      ]),
    ).toEqual(['Dia o Mercadona', 'Dia', 'Mercadona'])
  })

  test('buy-anywhere comes first, however late it is named', () => {
    expect(headings([at('a', 'Mercadona'), at('b')])).toEqual(['', 'Mercadona'])
  })

  test('the widest choice leads, narrowing down to a single shop', () => {
    expect(
      headings([
        at('a', 'Mercadona'),
        at('b', 'Dia', 'Mercadona'),
        at('c'),
        at('d', 'Carrefour', 'Dia', 'Mercadona'),
      ]),
    ).toEqual([
      '',
      'Carrefour u otras 2 tiendas',
      'Dia o Mercadona',
      'Mercadona',
    ])
  })

  test('groups of equal width keep the order they first appear in', () => {
    expect(
      headings([
        at('a', 'Mercadona'),
        at('b', 'Dia'),
        at('c', 'Mercadona'),
        at('d', 'Carrefour'),
      ]),
    ).toEqual(['Mercadona', 'Dia', 'Carrefour'])
  })

  test('items keep their order within a group', () => {
    const groups = groupByShops([
      at('a', 'Mercadona'),
      at('b', 'Dia'),
      at('c', 'Mercadona'),
    ])
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'c'])
  })

  test('a shop whose own name holds the separator is still its own group', () => {
    // Keying on a printable join would make this single shop collide with the
    // pair of shops it reads like.
    expect(
      headings([at('a', 'Dia, Mercadona'), at('b', 'Dia', 'Mercadona')]),
    ).toEqual(['Dia o Mercadona', 'Dia, Mercadona'])
  })

  test('nothing to group is no groups', () => {
    expect(groupByShops([])).toEqual([])
  })
})
