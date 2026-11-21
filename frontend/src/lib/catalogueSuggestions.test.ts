import { expect, test } from 'vitest'
import { type Catalogue, differingFields } from './catalogueSuggestions'

const catalogue: Catalogue = {
  ean: '8480000118325',
  name: 'Leche semidesnatada',
  brand: 'Hacendado',
  pack: { count: 6, content: 1, unit: 'l' },
}

const line = {
  name: 'Leche semidesnatada',
  brand: 'Hacendado',
  pack: { count: 6, content: 1, unit: 'l' as const },
  price_per: null,
}

test('a line that agrees with the catalogue gets no suggestion', () => {
  expect(differingFields(line, catalogue)).toEqual([])
})

test('case and accents are not a difference', () => {
  expect(
    differingFields(
      { ...line, name: ' LECHE SEMIDESNATADA ', brand: 'hacendádo' },
      catalogue,
    ),
  ).toEqual([])
})

test('each field that says something else, in the order the sheet shows', () => {
  expect(
    differingFields(
      {
        name: 'Leche',
        brand: 'Pascual',
        pack: { count: 12, content: 1, unit: 'l' },
        price_per: null,
      },
      catalogue,
    ),
  ).toEqual(['name', 'brand', 'pack'])
})

test('spaces around the catalogue value are not a difference', () => {
  expect(
    differingFields(line, { ...catalogue, name: ' Leche semidesnatada ' }),
  ).toEqual([])
})

test('an empty field is filled, never suggested', () => {
  expect(
    differingFields({ ...line, brand: null, pack: null }, catalogue),
  ).toEqual([])
})

test('a catalogue with nothing to say suggests nothing', () => {
  expect(
    differingFields(
      {
        ...line,
        brand: 'Pascual',
        pack: { count: 2, content: null, unit: null },
      },
      { ...catalogue, brand: null, pack: null },
    ),
  ).toEqual([])
})

test('a weighed line has no format to suggest', () => {
  expect(
    differingFields(
      {
        ...line,
        pack: { count: 12, content: 1, unit: 'l' },
        price_per: 'KILOGRAM',
      },
      catalogue,
    ),
  ).toEqual([])
})
