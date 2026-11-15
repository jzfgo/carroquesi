import { describe, expect, it } from 'vitest'
import {
  formatPack,
  packFromFields,
  packWeightText,
  readPackCount,
  readPackWeight,
  samePack,
} from './packFormat'

describe('formatPack', () => {
  it('prints count and content', () => {
    expect(formatPack({ count: 6, content: 1.5, unit: 'l' })).toBe('6 × 1,5 L')
  })

  it('prints the content alone for a single unit', () => {
    expect(formatPack({ count: 1, content: 108, unit: 'g' })).toBe('108 g')
    expect(formatPack({ count: 1, content: 108, unit: 'g' }, true)).toBe(
      '108 G',
    )
  })

  it('prints a count-only pack', () => {
    expect(formatPack({ count: 12, content: null, unit: null })).toBe(
      'pack de 12',
    )
    expect(formatPack({ count: 12 }, true)).toBe('PACK DE 12')
  })

  it('keeps the litre uppercase in both voices', () => {
    expect(formatPack({ count: 1, content: 33, unit: 'cl' }, true)).toBe(
      '33 CL',
    )
    expect(formatPack({ count: 1, content: 5, unit: 'l' })).toBe('5 L')
  })
})

describe('readPackWeight', () => {
  it.each([
    ['1,5 L', 1.5, 'l'],
    ['108 gramos', 108, 'g'],
    ['33cl', 33, 'cl'],
    ['2 kilos', 2, 'kg'],
    ['500 gr.', 500, 'g'],
  ])('reads «%s»', (text, content, unit) => {
    expect(readPackWeight(text)).toEqual({ kind: 'weight', content, unit })
  })

  it('reads an empty field as no weight', () => {
    expect(readPackWeight('  ')).toEqual({ kind: 'empty' })
  })

  it('reads a dot as a decimal mark', () => {
    expect(readPackWeight('1.5 L')).toEqual({
      kind: 'weight',
      content: 1.5,
      unit: 'l',
    })
  })

  it.each(['1,5', '108 latas', 'L', '0 g', '200000 l', '1.000 ml'])(
    'refuses «%s»',
    (text) => {
      expect(readPackWeight(text)).toEqual({ kind: 'invalid' })
    },
  )
})

describe('readPackCount', () => {
  it('reads empty as 1', () => {
    expect(readPackCount('')).toBe(1)
  })

  it.each(['0', '1,5', '-2', '1001', 'seis'])('refuses «%s»', (text) => {
    expect(readPackCount(text)).toBeNull()
  })
})

describe('packFromFields', () => {
  it('builds a full format', () => {
    expect(packFromFields('6', '1,5 L')).toEqual({
      count: 6,
      content: 1.5,
      unit: 'l',
    })
  })

  it('builds a count-only pack', () => {
    expect(packFromFields('12', '')).toEqual({
      count: 12,
      content: null,
      unit: null,
    })
  })

  it('reads both fields empty as no format', () => {
    expect(packFromFields('', '')).toBeNull()
    expect(packFromFields('1', '')).toBeNull()
  })

  it('is undefined while a field cannot be read', () => {
    expect(packFromFields('6', '1,5')).toBeUndefined()
    expect(packFromFields('0', '1 L')).toBeUndefined()
  })
})

describe('packWeightText', () => {
  it('seeds the field from a stored format', () => {
    expect(packWeightText({ count: 6, content: 1.5, unit: 'l' })).toBe('1,5 L')
    expect(packWeightText({ count: 12, content: null, unit: null })).toBe('')
    expect(packWeightText(null)).toBe('')
  })
})

describe('samePack', () => {
  it('treats missing and null content alike', () => {
    expect(
      samePack({ count: 12 }, { count: 12, content: null, unit: null }),
    ).toBe(true)
  })

  it('tells formats apart', () => {
    expect(
      samePack(
        { count: 6, content: 1.5, unit: 'l' },
        { count: 6, content: 1, unit: 'l' },
      ),
    ).toBe(false)
    expect(samePack(null, { count: 12 })).toBe(false)
    expect(samePack(null, null)).toBe(true)
  })
})
