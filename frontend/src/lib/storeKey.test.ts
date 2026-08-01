import { describe, expect, it } from 'vitest'
import { storeKey } from './storeKey'
import vectors from './storeKeyVectors.json'

describe('storeKey', () => {
  // The backend asserts the same file; either side drifting fails its suite.
  it.each(vectors)(
    'matches shared vector: "$input" → "$key"',
    ({ input, key }) => {
      expect(storeKey(input)).toBe(key)
    },
  )

  it('keeps punctuation-only names on distinct keys', () => {
    expect(storeKey('***')).not.toBe(storeKey('??'))
  })

  it('is idempotent over its own output', () => {
    for (const { key } of vectors) {
      expect(storeKey(key)).toBe(key)
    }
  })

  it('collapses spelling variants but never vocabulary variants', () => {
    expect(storeKey('BM')).not.toBe(storeKey('BM Supermercados'))
    expect(storeKey('Mercadona')).not.toBe(storeKey('Mercadona Online'))
  })
})
