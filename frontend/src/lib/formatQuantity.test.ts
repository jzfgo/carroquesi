import { formatQuantity, formatQuantityColumn } from './formatQuantity'

test('a bare count takes UD', () => {
  expect(formatQuantity('8')).toBe('8 UD')
})

test('unit words abbreviate', () => {
  expect(formatQuantity('2 unidades')).toBe('2 UD')
  expect(formatQuantity('1 kilo')).toBe('1 KG')
  expect(formatQuantity('2 litros')).toBe('2 L')
})

test('attached units gain the space and uppercase', () => {
  expect(formatQuantity('487g')).toBe('487 G')
  expect(formatQuantity('1kg')).toBe('1 KG')
  expect(formatQuantity('250ml')).toBe('250 ML')
})

test('decimals normalize to the comma', () => {
  expect(formatQuantity('0.5 kg')).toBe('0,5 KG')
  expect(formatQuantity('1,5l')).toBe('1,5 L')
})

test('an unknown unit word is kept, uppercased', () => {
  expect(formatQuantity('2 paquetes')).toBe('2 PAQUETES')
})

test('an unparseable string passes through untouched', () => {
  expect(formatQuantity('media docena')).toBe('media docena')
})

// The unpurchased qty column — bare digits per 21b.
test('the column drops UD from a plain count', () => {
  expect(formatQuantityColumn('8')).toBe('8')
  expect(formatQuantityColumn('2 unidades')).toBe('2')
  expect(formatQuantityColumn('6 ud')).toBe('6')
})

test('the column keeps a weight or volume unit', () => {
  expect(formatQuantityColumn('1 kilo')).toBe('1 KG')
  expect(formatQuantityColumn('2 litros')).toBe('2 L')
  expect(formatQuantityColumn('487g')).toBe('487 G')
  expect(formatQuantityColumn('250ml')).toBe('250 ML')
})

test('the column keeps an unknown unit rather than guessing', () => {
  expect(formatQuantityColumn('2 paquetes')).toBe('2 PAQUETES')
})

test('the column passes an unparseable string through', () => {
  expect(formatQuantityColumn('media docena')).toBe('media docena')
})
