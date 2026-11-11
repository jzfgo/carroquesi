import { getChains } from './api'
import {
  lookupOwnBrandStore,
  readsLabelWeight,
  withOwnBrandStore,
} from './ownBrands'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getChains: vi.fn(),
}))

describe('lookupOwnBrandStore', () => {
  test('null input returns null', () => {
    expect(lookupOwnBrandStore(null)).toBeNull()
  })

  test('empty string returns null', () => {
    expect(lookupOwnBrandStore('')).toBeNull()
  })

  test('unknown brand returns null', () => {
    expect(lookupOwnBrandStore('Danone')).toBeNull()
  })

  test('Hacendado → Mercadona (exact case)', () => {
    expect(lookupOwnBrandStore('Hacendado')).toBe('Mercadona')
  })

  test('hacendado → Mercadona (lowercase)', () => {
    expect(lookupOwnBrandStore('hacendado')).toBe('Mercadona')
  })

  test('HACENDADO → Mercadona (uppercase)', () => {
    expect(lookupOwnBrandStore('HACENDADO')).toBe('Mercadona')
  })

  test('Bosque Verde → Mercadona', () => {
    expect(lookupOwnBrandStore('Bosque Verde')).toBe('Mercadona')
  })

  test('Deliplus → Mercadona', () => {
    expect(lookupOwnBrandStore('Deliplus')).toBe('Mercadona')
  })

  test('Compy → Mercadona', () => {
    expect(lookupOwnBrandStore('Compy')).toBe('Mercadona')
  })

  test('Milbona → Lidl', () => {
    expect(lookupOwnBrandStore('Milbona')).toBe('Lidl')
  })

  test('Realvalle → Lidl', () => {
    expect(lookupOwnBrandStore('Realvalle')).toBe('Lidl')
  })

  test('GutBio → Aldi', () => {
    expect(lookupOwnBrandStore('GutBio')).toBe('Aldi')
  })

  test('Milsani → Aldi', () => {
    expect(lookupOwnBrandStore('Milsani')).toBe('Aldi')
  })

  test('Auchan → Alcampo', () => {
    expect(lookupOwnBrandStore('Auchan')).toBe('Alcampo')
  })

  test('Eroski → Eroski', () => {
    expect(lookupOwnBrandStore('Eroski')).toBe('Eroski')
  })

  test('Aliada → El Corte Inglés', () => {
    expect(lookupOwnBrandStore('Aliada')).toBe('El Corte Inglés')
  })

  test('IFA Eliges → Gadis', () => {
    expect(lookupOwnBrandStore('IFA Eliges')).toBe('Gadis')
  })

  test('Consum → Consum', () => {
    expect(lookupOwnBrandStore('Consum')).toBe('Consum')
  })

  test('DIA → DIA', () => {
    expect(lookupOwnBrandStore('DIA')).toBe('DIA')
  })

  test('Alipende → Ahorramas', () => {
    expect(lookupOwnBrandStore('Alipende')).toBe('Ahorramas')
  })

  test('leading/trailing whitespace is ignored', () => {
    expect(lookupOwnBrandStore('  Hacendado  ')).toBe('Mercadona')
  })
})

describe('withOwnBrandStore', () => {
  test('adds the store of an own brand', () => {
    expect(withOwnBrandStore('Hacendado', ['Lidl'])).toEqual([
      'Lidl',
      'Mercadona',
    ])
  })

  test('returns the same array when the store is already there by key', () => {
    const stores = ['mercadona ']
    expect(withOwnBrandStore('Hacendado', stores)).toBe(stores)
  })

  test('returns the same array for an unknown or missing brand', () => {
    const stores: string[] = []
    expect(withOwnBrandStore('Danone', stores)).toBe(stores)
    expect(withOwnBrandStore(null, stores)).toBe(stores)
  })
})

describe('readsLabelWeight', () => {
  test('a chain whose labels give a weight', () => {
    expect(readsLabelWeight('Mercadona')).toBe(true)
  })

  test('matches the store by key', () => {
    expect(readsLabelWeight('  MERCADONA ')).toBe(true)
  })

  test('a chain whose labels give no weight', () => {
    expect(readsLabelWeight('Ahorramas')).toBe(false)
  })

  test('a store no chain claims, or none', () => {
    expect(readsLabelWeight('Frutería Paco')).toBe(false)
    expect(readsLabelWeight(null)).toBe(false)
  })
})

describe('loadChains', () => {
  const getToken = () => Promise.resolve('t')

  // Module state is the point under test, so each case gets a fresh copy.
  async function freshModule() {
    vi.resetModules()
    return import('./ownBrands')
  }

  test('the served table replaces the snapshot', async () => {
    vi.mocked(getChains).mockResolvedValue([
      {
        name: 'Nueva',
        store_keys: ['nueva'],
        own_brands: ['marca nueva'],
        reads_label_weight: false,
      },
    ])
    const m = await freshModule()
    expect(m.lookupOwnBrandStore('Marca Nueva')).toBeNull()
    await m.loadChains(getToken)
    expect(m.lookupOwnBrandStore('Marca Nueva')).toBe('Nueva')
    expect(m.lookupOwnBrandStore('Hacendado')).toBeNull()
  })

  test('the served table decides which stores read a weight', async () => {
    vi.mocked(getChains).mockResolvedValue([
      {
        name: 'Nueva',
        store_keys: ['nueva', 'nuevaexpress'],
        own_brands: [],
        reads_label_weight: true,
      },
    ])
    const m = await freshModule()
    await m.loadChains(getToken)
    expect(m.readsLabelWeight('Nueva Express')).toBe(true)
    expect(m.readsLabelWeight('Mercadona')).toBe(false)
  })

  test('fetches once per page load', async () => {
    vi.mocked(getChains).mockResolvedValue([])
    const m = await freshModule()
    await m.loadChains(getToken)
    await m.loadChains(getToken)
    expect(getChains).toHaveBeenCalledTimes(1)
  })

  test('a failed fetch keeps the snapshot and the next call retries', async () => {
    vi.mocked(getChains).mockRejectedValueOnce(new TypeError('offline'))
    const m = await freshModule()
    await m.loadChains(getToken)
    expect(m.lookupOwnBrandStore('Hacendado')).toBe('Mercadona')
    vi.mocked(getChains).mockResolvedValueOnce([])
    await m.loadChains(getToken)
    expect(getChains).toHaveBeenCalledTimes(2)
    expect(m.lookupOwnBrandStore('Hacendado')).toBeNull()
  })
})
