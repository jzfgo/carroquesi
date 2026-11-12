import type { LabelRead } from '../types'
import { parseKgFactor } from './itemCost'
import {
  hasWeight,
  labelAgrees,
  labelCode,
  labelPricePerKg,
  labelQuantity,
  labelTotal,
  readPriceBefore,
  reductionFields,
  showsWeightChip,
} from './weighedLabel'

// A real label: backend/app/chains/mercadona/vectors.json, first entry.
const SANDIA: LabelRead = {
  format: 'mercadona-24',
  article: '03505',
  reduced: false,
  weight_g: 3206,
  price_per_kg_cents: 155,
  total_cents: 497,
  chain: 'Mercadona',
}

describe('labelQuantity', () => {
  test('writes the weight in kilos with a comma', () => {
    expect(labelQuantity(636)).toBe('0,636 kg')
    expect(labelQuantity(3206)).toBe('3,206 kg')
  })

  test('drops trailing zeros', () => {
    expect(labelQuantity(500)).toBe('0,5 kg')
    expect(labelQuantity(1250)).toBe('1,25 kg')
    expect(labelQuantity(2000)).toBe('2 kg')
  })

  test('reads back as the same weight', () => {
    expect(parseKgFactor(labelQuantity(636))).toBeCloseTo(0.636, 6)
  })
})

describe('label money', () => {
  test('price per kilo and total in euros', () => {
    expect(labelPricePerKg(SANDIA)).toBe(1.55)
    expect(labelTotal(SANDIA)).toBe(4.97)
  })

  test('agrees with a line of the same total, to the cent', () => {
    expect(labelAgrees(SANDIA, 4.97)).toBe(true)
    expect(labelAgrees(SANDIA, 4.98)).toBe(false)
  })
})

describe('hasWeight', () => {
  test('a weight, not a count', () => {
    expect(hasWeight('0,5 kg')).toBe(true)
    expect(hasWeight('346 g')).toBe(true)
    expect(hasWeight('2')).toBe(false)
    expect(hasWeight(null)).toBe(false)
  })
})

describe('showsWeightChip', () => {
  const base = {
    store: 'Mercadona',
    quantity: '1',
    ean: null,
    boughtByWeight: false,
  }

  test('one unit with no EAN, at a chain whose labels give a weight', () => {
    expect(showsWeightChip(base)).toBe(true)
  })

  test('no quantity counts as one unit', () => {
    expect(showsWeightChip({ ...base, quantity: null })).toBe(true)
  })

  test('a product with an EAN is packaged, not weighed', () => {
    expect(showsWeightChip({ ...base, ean: '8480000123456' })).toBe(false)
  })

  test('a product bought by weight before shows it anyway', () => {
    expect(
      showsWeightChip({
        ...base,
        quantity: '2',
        ean: '8480000123456',
        boughtByWeight: true,
      }),
    ).toBe(true)
  })

  test('several units do not', () => {
    expect(showsWeightChip({ ...base, quantity: '2' })).toBe(false)
  })

  test('a line that already has a weight does not', () => {
    expect(
      showsWeightChip({ ...base, quantity: '0,5 kg', boughtByWeight: true }),
    ).toBe(false)
  })

  test('a store whose labels give no weight does not', () => {
    expect(showsWeightChip({ ...base, store: 'Ahorramas' })).toBe(false)
    expect(showsWeightChip({ ...base, store: null })).toBe(false)
  })
})

describe('labelCode', () => {
  test('keeps a run of numbers', () => {
    expect(labelCode(' 230035050320600155004972 ')).toBe(
      '230035050320600155004972',
    )
  })

  test('keeps a QR label: a GS1 Digital Link with a GTIN', () => {
    // A «Bajada de precio» sticker: backend/app/chains/mercadona/vectors.json.
    const qr =
      'https://qrtrack.mercadona.es/01/08436574550801/10/E1016B?17=261023&16=261021&3103=000356&3922=00881&8005=002475&99=1'
    expect(labelCode(` ${qr} `)).toBe(qr)
  })

  test('refuses anything else', () => {
    expect(labelCode('https://example.com/x')).toBeNull()
    expect(
      labelCode('http://qrtrack.mercadona.es/01/08436574550801'),
    ).toBeNull()
    expect(labelCode('https://example.com/01/123')).toBeNull()
    expect(labelCode('123')).toBeNull()
    expect(labelCode('2300350503206001550049721')).toBeNull()
  })
})

describe('readPriceBefore', () => {
  // The frames' «Contramuslo»: 346 g at 8,82 €/kg is 3,05.
  const read = (text: string) => readPriceBefore(text, 3.05, 0.346, 8.82)

  test('a blank field is no old price', () => {
    expect(read('  ')).toBeNull()
  })

  test('an old price above what was paid is valid', () => {
    expect(read('4,36')).toEqual({ total: 4.36, valid: true })
  })

  test('the same figure or less is refused, to the cent', () => {
    expect(read('3,05')?.valid).toBe(false)
    expect(read('2,90')?.valid).toBe(false)
    expect(read('3,06')?.valid).toBe(true)
  })

  test('a figure that cannot be read is refused', () => {
    expect(read('abc')?.valid).toBe(false)
  })

  test('a cent above the total is refused when it is not above the €/kg saved', () => {
    // A label whose total and €/kg disagree by more than rounding: 500 g at
    // 20,02 €/kg, printed 10,00. 10,01 is a cent more, but only 20,02 €/kg,
    // which the save would drop.
    expect(readPriceBefore('10,01', 10, 0.5, 20.02)?.valid).toBe(false)
    expect(readPriceBefore('10,02', 10, 0.5, 20.02)?.valid).toBe(true)
  })
})

describe('reductionFields', () => {
  const reduced = {
    code: '1',
    article: '01234',
    reduced: true,
    priceBefore: 12.6,
  }

  test('a reduced label sends its mark and its old price', () => {
    expect(reductionFields(reduced, 8.82, 'KILOGRAM')).toEqual({
      reduced: true,
      price_before: 12.6,
    })
  })

  test('a plain label sends no mark', () => {
    expect(
      reductionFields(
        { ...reduced, reduced: false, priceBefore: null },
        8.82,
        'KILOGRAM',
      ),
    ).toEqual({ reduced: false, price_before: null })
  })

  test('an edit after the scan drops an old price the line no longer sits below', () => {
    expect(reductionFields(reduced, 13, 'KILOGRAM')).toEqual({
      reduced: true,
      price_before: null,
    })
    expect(reductionFields(reduced, null, 'KILOGRAM').price_before).toBeNull()
    expect(reductionFields(reduced, 3.05, null).price_before).toBeNull()
  })
})
