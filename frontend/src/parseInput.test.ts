import { parseInput } from './parseInput'

describe('parseInput', () => {
  test('empty string returns empty ParsedInput', () => {
    expect(parseInput('')).toEqual({ name: '', quantity: null, variety: null, brand: null, store: null })
  })

  test('plain name with no sigils', () => {
    expect(parseInput('Leche entera')).toEqual({
      name: 'Leche entera', quantity: null, variety: null, brand: null, store: null,
    })
  })

  test('name + single-word quantity', () => {
    const result = parseInput('Leche +3')
    expect(result.name).toBe('Leche')
    expect(result.quantity).toBe('3')
  })

  test('multi-word quantity: +1 bolsa', () => {
    const result = parseInput('Tomates +1 bolsa')
    expect(result.name).toBe('Tomates')
    expect(result.quantity).toBe('1 bolsa')
  })

  test('multi-word quantity: +6 litros de leche', () => {
    const result = parseInput('Agua +6 litros de leche')
    expect(result.quantity).toBe('6 litros de leche')
  })

  test('all four sigils', () => {
    const result = parseInput('Leche entera +3 *Desnatada #Puleva @Mercadona')
    expect(result.name).toBe('Leche entera')
    expect(result.quantity).toBe('3')
    expect(result.variety).toBe('Desnatada')
    expect(result.brand).toBe('Puleva')
    expect(result.store).toBe('Mercadona')
  })

  test('sigils in any order', () => {
    const result = parseInput('Leche @Mercadona #Puleva *Entera +2')
    expect(result.name).toBe('Leche')
    expect(result.store).toBe('Mercadona')
    expect(result.brand).toBe('Puleva')
    expect(result.variety).toBe('Entera')
    expect(result.quantity).toBe('2')
  })

  test('multi-word store: @El Corte Inglés', () => {
    const result = parseInput('Jamón @El Corte Inglés')
    expect(result.name).toBe('Jamón')
    expect(result.store).toBe('El Corte Inglés')
  })

  test('first occurrence of same sigil wins', () => {
    const result = parseInput('Leche +2 +3')
    expect(result.quantity).toBe('2')
  })

  test('subsequent same sigil is ignored even with multi-word tokens', () => {
    const result = parseInput('Pan #Bimbo extra #Hacendado')
    expect(result.brand).toBe('Bimbo extra')
  })

  test('word starting with sigil is never part of name', () => {
    const result = parseInput('+2')
    expect(result.name).toBe('')
    expect(result.quantity).toBe('2')
  })

  test('trailing partial token (typing in progress)', () => {
    const result = parseInput('Leche +3 @Mer')
    expect(result.store).toBe('Mer')
  })

  test('only whitespace returns empty', () => {
    expect(parseInput('   ')).toEqual({ name: '', quantity: null, variety: null, brand: null, store: null })
  })
})
