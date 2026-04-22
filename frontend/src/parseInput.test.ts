import { parseInput } from './parseInput'

describe('parseInput', () => {
  test('empty string returns empty ParsedInput', () => {
    expect(parseInput('')).toEqual({ name: '', quantity: null, brand: null, stores: [] })
  })

  test('plain name with no sigils', () => {
    expect(parseInput('Leche entera')).toEqual({
      name: 'Leche entera', quantity: null, brand: null, stores: [],
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

  test('single store sigil', () => {
    const result = parseInput('Leche entera +3 #Puleva @Mercadona')
    expect(result.name).toBe('Leche entera')
    expect(result.quantity).toBe('3')
    expect(result.brand).toBe('Puleva')
    expect(result.stores).toEqual(['Mercadona'])
  })

  test('two store sigils produce two entries', () => {
    const result = parseInput('Leche @Mercadona @Carrefour')
    expect(result.name).toBe('Leche')
    expect(result.stores).toEqual(['Mercadona', 'Carrefour'])
  })

  test('three store sigils', () => {
    const result = parseInput('Leche @Mercadona @Carrefour @Lidl')
    expect(result.stores).toEqual(['Mercadona', 'Carrefour', 'Lidl'])
  })

  test('duplicate store sigils are deduplicated', () => {
    const result = parseInput('Leche @Mercadona @Mercadona')
    expect(result.stores).toEqual(['Mercadona'])
  })

  test('duplicate multi-word stores are deduplicated', () => {
    const result = parseInput('Jamón @El Corte Inglés @El Corte Inglés')
    expect(result.stores).toEqual(['El Corte Inglés'])
  })

  test('multi-word first store then second store', () => {
    const result = parseInput('Jamón @El Corte Inglés @Mercadona')
    expect(result.stores).toEqual(['El Corte Inglés', 'Mercadona'])
  })

  test('sigils in any order — single store', () => {
    const result = parseInput('Leche @Mercadona #Puleva +2')
    expect(result.name).toBe('Leche')
    expect(result.stores).toEqual(['Mercadona'])
    expect(result.brand).toBe('Puleva')
    expect(result.quantity).toBe('2')
  })

  test('multi-word store: @El Corte Inglés', () => {
    const result = parseInput('Jamón @El Corte Inglés')
    expect(result.name).toBe('Jamón')
    expect(result.stores).toEqual(['El Corte Inglés'])
  })

  test('first occurrence of same sigil wins for non-@ sigils', () => {
    const result = parseInput('Leche +2 +3')
    expect(result.quantity).toBe('2')
  })

  test('subsequent same non-@ sigil is ignored even with multi-word tokens', () => {
    const result = parseInput('Pan #Bimbo extra #Hacendado')
    expect(result.brand).toBe('Bimbo extra')
  })

  test('word starting with sigil is never part of name', () => {
    const result = parseInput('+2')
    expect(result.name).toBe('')
    expect(result.quantity).toBe('2')
  })

  test('trailing partial store token (typing in progress)', () => {
    const result = parseInput('Leche +3 @Mer')
    expect(result.stores).toEqual(['Mer'])
  })

  test('only whitespace returns empty', () => {
    expect(parseInput('   ')).toEqual({ name: '', quantity: null, brand: null, stores: [] })
  })

  describe('| EAN sigil', () => {
    test('13-digit EAN sets ean field', () => {
      const result = parseInput('|4011200296908')
      expect(result.ean).toBe('4011200296908')
      expect(result.name).toBe('')
    })

    test('8-digit EAN sets ean field', () => {
      const result = parseInput('|12345678')
      expect(result.ean).toBe('12345678')
    })

    test('EAN with name sets both', () => {
      const result = parseInput('Leche |4011200296908')
      expect(result.name).toBe('Leche')
      expect(result.ean).toBe('4011200296908')
    })

    test('EAN composes with brand and store sigils', () => {
      const result = parseInput('|4011200296908 #Danone @Mercadona')
      expect(result.ean).toBe('4011200296908')
      expect(result.brand).toBe('Danone')
      expect(result.stores).toEqual(['Mercadona'])
    })

    test('incomplete EAN (not 8 or 13 digits) does not set ean', () => {
      const result = parseInput('|123')
      expect(result.ean).toBeUndefined()
    })

    test('non-digit chars after | do not set ean', () => {
      const result = parseInput('|abc1234567890')
      expect(result.ean).toBeUndefined()
    })

    test('first valid EAN wins when two | tokens present', () => {
      const result = parseInput('|4011200296908 |12345678')
      expect(result.ean).toBe('4011200296908')
    })
  })

  describe('$ price sigil', () => {
    test('$1,50 parses to price 1.5, pricePer null', () => {
      const result = parseInput('leche $1,50')
      expect(result.name).toBe('leche')
      expect(result.price).toBe(1.5)
      expect(result.pricePer).toBeNull()
    })

    test('€3,20/kg parses to price 3.2, pricePer KILOGRAM', () => {
      const result = parseInput('arroz €3,20/kg')
      expect(result.price).toBe(3.2)
      expect(result.pricePer).toBe('KILOGRAM')
    })

    test('dot as decimal separator also accepted: $1.50', () => {
      const result = parseInput('leche $1.50')
      expect(result.price).toBe(1.5)
      expect(result.pricePer).toBeNull()
    })

    test('$,50 parses to 0.5 (no integer part)', () => {
      const result = parseInput('leche $,50')
      expect(result.price).toBe(0.5)
    })

    test('$.50 parses to 0.5 (dot, no integer part)', () => {
      const result = parseInput('leche $.50')
      expect(result.price).toBe(0.5)
    })

    test('$1,5 single decimal digit parses correctly', () => {
      const result = parseInput('leche $1,5')
      expect(result.price).toBe(1.5)
    })

    test('$1500 integer-only parses correctly', () => {
      const result = parseInput('carne $1500')
      expect(result.price).toBe(1500)
    })

    test('$0 is valid (zero price)', () => {
      const result = parseInput('leche $0')
      expect(result.price).toBe(0)
    })

    test('$/kg with no number is ignored', () => {
      const result = parseInput('leche $/kg')
      expect(result.price).toBeUndefined()
    })

    test('bare $ with no number is ignored', () => {
      const result = parseInput('leche $')
      expect(result.price).toBeUndefined()
    })

    test('$abc non-numeric is ignored', () => {
      const result = parseInput('leche $abc')
      expect(result.price).toBeUndefined()
    })

    test('$1,500 three decimal digits is ignored (ambiguous)', () => {
      const result = parseInput('leche $1,500')
      expect(result.price).toBeUndefined()
    })

    test('$1.500 three decimal digits is ignored (ambiguous)', () => {
      const result = parseInput('leche $1.500')
      expect(result.price).toBeUndefined()
    })

    test('$1,50,30 two commas is ignored', () => {
      const result = parseInput('leche $1,50,30')
      expect(result.price).toBeUndefined()
    })

    test('$1.50.30 two dots is ignored', () => {
      const result = parseInput('leche $1.50.30')
      expect(result.price).toBeUndefined()
    })

    test('$1,50.30 mixed separators is ignored', () => {
      const result = parseInput('leche $1,50.30')
      expect(result.price).toBeUndefined()
    })

    test('$1, trailing separator is ignored', () => {
      const result = parseInput('leche $1,')
      expect(result.price).toBeUndefined()
    })

    test('$-1 negative is ignored', () => {
      const result = parseInput('leche $-1')
      expect(result.price).toBeUndefined()
    })

    test('first price sigil wins when two are present', () => {
      const result = parseInput('leche $1,50 $2,00')
      expect(result.price).toBe(1.5)
    })

    test('first *valid* price token wins — invalid prefix does not block subsequent valid', () => {
      const result = parseInput('leche $abc $1,50')
      expect(result.price).toBe(1.5)
    })

    test('€ is accepted as alias for $', () => {
      const result = parseInput('leche €1,50')
      expect(result.price).toBe(1.5)
    })

    test('$/kg case-insensitive: $1,50/KG', () => {
      const result = parseInput('arroz $1,50/KG')
      expect(result.price).toBe(1.5)
      expect(result.pricePer).toBe('KILOGRAM')
    })

    test('price composes with other sigils', () => {
      const result = parseInput('leche $1,50 @Mercadona #Puleva')
      expect(result.name).toBe('leche')
      expect(result.price).toBe(1.5)
      expect(result.stores).toEqual(['Mercadona'])
      expect(result.brand).toBe('Puleva')
    })

    test('no price sigil: price field is undefined', () => {
      const result = parseInput('leche @Mercadona')
      expect(result.price).toBeUndefined()
      expect(result.pricePer).toBeUndefined()
    })
  })
})
