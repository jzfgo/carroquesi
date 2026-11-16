import { describe, expect, it } from 'vitest'
import { readPackText } from './packText'
import vectors from './packTextVectors.json'

describe('readPackText', () => {
  // The backend asserts the same file, so the two grammars cannot drift.
  it.each(vectors)('reads «$text» as the backend does', ({ text, pack }) => {
    expect(readPackText(text)).toEqual(pack)
  })

  it('reads a bare whole number as a count', () => {
    expect(readPackText('12')).toEqual({ count: 12, content: null, unit: null })
  })

  it.each([
    '12 uds',
    '12ud',
    '12 unidades',
    'x12',
    'X 12',
    'pack de 12',
    'pack12',
  ])('reads «%s» as a count, as a name does', (text) => {
    expect(readPackText(text)).toEqual({ count: 12, content: null, unit: null })
  })

  it('refuses a count of one or past the bound', () => {
    expect(readPackText('1')).toBeNull()
    expect(readPackText('0')).toBeNull()
    expect(readPackText('1001')).toBeNull()
  })
})
