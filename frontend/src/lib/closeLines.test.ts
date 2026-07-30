import { describe, expect, it } from 'vitest'
import type {
  ListItem,
  MatchedLine,
  ReceiptScanResult,
  UnmatchedLine,
} from '../types'
import {
  buildLines,
  discardPaper,
  linesTotal,
  receiptToLines,
  receiptTotal,
  toPayload,
  type CloseLine,
} from './closeLines'

function item(over: Partial<ListItem>): ListItem {
  return {
    id: 'i1',
    list_id: 'l1',
    name: 'Leche',
    quantity: null,
    brand: null,
    stores: [],
    purchased: false,
    purchased_at: null,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: '2026-07-30T08:00:00',
    updated_at: '2026-07-30T08:00:00',
    ...over,
  }
}

const CART_ENDS = '2026-07-31T00:00:00'
/** Before the trip above ends, so those items are in the cart. Passed in
 *  rather than left to the machine clock, which would make these tests start
 *  failing on their own on the 31st. */
const NOW = Date.parse('2026-07-30T18:30:00Z')
/** After it ends, so the same items read as bought. */
const LATER = Date.parse('2026-07-31T09:00:00Z')

describe('buildLines', () => {
  it('ticks what is in the cart and leaves the rest of the list unticked', () => {
    const lines = buildLines(
      [
        item({
          id: 'a',
          name: 'Leche',
          purchased: true,
          purchased_at: '2026-07-30T18:00:00',
          purchase_ends_at: CART_ENDS,
        }),
        item({ id: 'b', name: 'Huevos' }),
      ],
      NOW,
    )

    expect(lines.map((l) => [l.itemId, l.included])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  it('puts the cart before the rest of the list', () => {
    const lines = buildLines(
      [
        item({ id: 'b', name: 'Huevos' }),
        item({
          id: 'a',
          name: 'Leche',
          purchased: true,
          purchased_at: '2026-07-30T18:00:00',
          purchase_ends_at: CART_ENDS,
        }),
      ],
      NOW,
    )

    expect(lines.map((l) => l.itemId)).toEqual(['a', 'b'])
  })

  it('leaves out an item whose trip already ended', () => {
    const items = [
      item({
        id: 'a',
        name: 'Leche',
        purchased: true,
        purchased_at: '2026-07-30T18:00:00',
        purchase_ends_at: CART_ENDS,
      }),
      item({ id: 'b', name: 'Huevos' }),
    ]

    // Same items, same rule, only the clock moved past the end of the trip.
    expect(buildLines(items, NOW).map((l) => l.itemId)).toEqual(['a', 'b'])
    expect(buildLines(items, LATER).map((l) => l.itemId)).toEqual(['b'])
  })

  it('marks which rows came from the cart, and keys each row by its item', () => {
    const lines = buildLines(
      [
        item({
          id: 'a',
          name: 'Leche',
          purchased: true,
          purchased_at: '2026-07-30T18:00:00',
          purchase_ends_at: CART_ENDS,
        }),
        item({ id: 'b', name: 'Huevos' }),
      ],
      NOW,
    )

    expect(lines.map((l) => [l.key, l.fromCart])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  it('prefers the quantity actually picked up over the planned one', () => {
    const lines = buildLines(
      [
        item({
          id: 'a',
          quantity: '2',
          purchased_quantity: '3',
          purchased: true,
          purchased_at: '2026-07-30T18:00:00',
          purchase_ends_at: CART_ENDS,
        }),
        item({ id: 'b', quantity: '2' }),
      ],
      NOW,
    )

    expect(lines.map((l) => l.quantity)).toEqual(['3', '2'])
  })

  it('carries the price already on the item', () => {
    const lines = buildLines(
      [
        item({
          id: 'a',
          purchased: true,
          purchased_at: '2026-07-30T18:00:00',
          purchase_ends_at: CART_ENDS,
          price: 1.19,
          price_per: 'KILOGRAM',
        }),
      ],
      NOW,
    )

    expect(lines[0].price).toBe(1.19)
    expect(lines[0].pricePer).toBe('KILOGRAM')
  })
})

describe('linesTotal', () => {
  it('sums only the ticked lines', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: '2',
        price: 3,
        pricePer: null,
        included: true,
        fromCart: true,
      },
      {
        key: '2',
        itemId: 'b',
        name: 'B',
        brand: null,
        quantity: null,
        price: 5,
        pricePer: null,
        included: false,
        fromCart: true,
      },
    ]

    expect(linesTotal(lines)).toEqual({ total: 6, partial: false })
  })

  it('multiplies a price by how many were bought', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: '3',
        price: 2,
        pricePer: null,
        included: true,
        fromCart: true,
      },
    ]

    expect(linesTotal(lines)).toEqual({ total: 6, partial: false })
  })

  it('weighs a price per kilo by the weight bought', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: '500g',
        price: 8,
        pricePer: 'KILOGRAM',
        included: true,
        fromCart: true,
      },
    ]

    expect(linesTotal(lines)).toEqual({ total: 4, partial: false })
  })

  it('skips a price per kilo with no weight rather than guessing one', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: null,
        price: 8,
        pricePer: 'KILOGRAM',
        included: true,
        fromCart: true,
      },
    ]

    expect(linesTotal(lines)).toBeNull()
  })

  it('is partial when a ticked line has no price', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: null,
        price: 3,
        pricePer: null,
        included: true,
        fromCart: true,
      },
      {
        key: '2',
        itemId: 'b',
        name: 'B',
        brand: null,
        quantity: null,
        price: null,
        pricePer: null,
        included: true,
        fromCart: true,
      },
    ]

    expect(linesTotal(lines)).toEqual({ total: 3, partial: true })
  })

  it('is partial when a price per kilo has no weight to apply it to', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: null,
        price: 3,
        pricePer: null,
        included: true,
        fromCart: true,
      },
      {
        key: '2',
        itemId: 'b',
        name: 'B',
        brand: null,
        quantity: 'un puñado',
        price: 8,
        pricePer: 'KILOGRAM',
        included: true,
        fromCart: true,
      },
    ]

    expect(linesTotal(lines)).toEqual({ total: 3, partial: true })
  })

  it('is not partial when an unticked line is the one without a price', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: null,
        price: 3,
        pricePer: null,
        included: true,
        fromCart: true,
      },
      {
        key: '2',
        itemId: 'b',
        name: 'B',
        brand: null,
        quantity: null,
        price: null,
        pricePer: null,
        included: false,
        fromCart: true,
      },
    ]

    expect(linesTotal(lines)).toEqual({ total: 3, partial: false })
  })

  it('is null when nothing ticked carries a price', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: null,
        price: null,
        pricePer: null,
        included: true,
        fromCart: true,
      },
    ]

    expect(linesTotal(lines)).toBeNull()
  })
})

describe('toPayload', () => {
  it('omits unticked rows entirely', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: null,
        price: 1,
        pricePer: null,
        included: true,
        fromCart: true,
      },
      {
        key: '2',
        itemId: 'b',
        name: 'B',
        brand: null,
        quantity: null,
        price: 2,
        pricePer: null,
        included: false,
        fromCart: true,
      },
    ]

    const payload = toPayload(lines, {
      store: 'Lidl',
      purchasedAt: '2026-07-30T18:00:00',
      purchaseId: null,
      total: null,
    })

    expect(payload.lines).toEqual([
      { item_id: 'a', price: 1, price_per: null, quantity: null },
    ])
    expect(payload.new_items).toEqual([])
    expect(payload.store).toBe('Lidl')
  })

  it('carries the quantity bought onto an existing line', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'A',
        brand: null,
        quantity: '3',
        price: 1,
        pricePer: 'KILOGRAM',
        included: true,
        fromCart: true,
      },
    ]

    const payload = toPayload(lines, {
      store: 'Lidl',
      purchasedAt: '2026-07-30T18:00:00',
      purchaseId: null,
      total: null,
    })

    expect(payload.lines).toEqual([
      { item_id: 'a', price: 1, price_per: 'KILOGRAM', quantity: '3' },
    ])
  })

  it('sends a row with no item as a new item', () => {
    const lines: CloseLine[] = [
      {
        key: 'n1',
        itemId: null,
        name: 'Chocolate negro',
        brand: 'Valor',
        quantity: '2',
        price: 3.18,
        pricePer: null,
        included: true,
        fromCart: false,
      },
    ]

    const payload = toPayload(lines, {
      store: 'Lidl',
      purchasedAt: '2026-07-30T18:00:00',
      purchaseId: null,
      total: null,
    })

    expect(payload.lines).toEqual([])
    expect(payload.new_items).toEqual([
      {
        name: 'Chocolate negro',
        brand: 'Valor',
        ean: null,
        price: 3.18,
        price_per: null,
        quantity: '2',
      },
    ])
  })
})

describe('toPayload and the unit with no price', () => {
  const meta = {
    store: 'Lidl',
    purchasedAt: '2026-07-30T18:00:00',
    purchaseId: null,
    total: null,
  }

  it('drops the unit from an existing line that carries no price', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'Tomates',
        brand: null,
        quantity: '1,12 kg',
        price: null,
        pricePer: 'KILOGRAM',
        included: true,
        fromCart: true,
      },
    ]

    expect(toPayload(lines, meta).lines[0].price_per).toBeNull()
  })

  it('drops the unit from a new item that carries no price', () => {
    const lines: CloseLine[] = [
      {
        key: 'n1',
        itemId: null,
        name: 'Tomates',
        brand: null,
        quantity: '1,12 kg',
        price: null,
        pricePer: 'KILOGRAM',
        included: true,
        fromCart: false,
      },
    ]

    expect(toPayload(lines, meta).new_items[0].price_per).toBeNull()
  })

  it('keeps the unit when there is a price to apply it to', () => {
    const lines: CloseLine[] = [
      {
        key: '1',
        itemId: 'a',
        name: 'Tomates',
        brand: null,
        quantity: '1,12 kg',
        price: 2.49,
        pricePer: 'KILOGRAM',
        included: true,
        fromCart: true,
      },
    ]

    expect(toPayload(lines, meta).lines[0].price_per).toBe('KILOGRAM')
  })
})

describe('buildLines for a trip that already tore off', () => {
  // Yesterday's shop: nobody said what it was, so it tore off unfiled and its
  // items read as bought. Writing it down the next morning is the 29b case.
  const filed = () =>
    item({
      id: 'old',
      name: 'Leche',
      purchased: true,
      purchased_at: '2026-07-30T18:00:00',
      purchase_id: 'p1',
      purchase_ends_at: CART_ENDS,
      price: 1.19,
    })

  // Tapped this morning, so it belongs to a different, still-open trip.
  const inTodaysCart = () =>
    item({
      id: 'today',
      name: 'Pan',
      purchased: true,
      purchased_at: '2026-07-31T08:00:00',
      purchase_id: 'p2',
      purchase_ends_at: '2026-08-01T00:00:00',
    })

  const stillOnTheList = () => item({ id: 'todo', name: 'Huevos' })

  it('carries the named trip’s own lines, ticked', () => {
    const lines = buildLines([filed()], LATER, 'p1')

    expect(lines.map((l) => [l.itemId, l.included])).toEqual([['old', true]])
  })

  it('leaves another trip’s cart out of it entirely', () => {
    // The server builds its cart from purchase_id, so a line naming today's
    // trip is refused and the whole close dies with it.
    const lines = buildLines([filed(), inTodaysCart()], LATER, 'p1')

    expect(lines.map((l) => l.itemId)).toEqual(['old'])
  })

  it('still offers what was never bought, unticked', () => {
    const lines = buildLines([filed(), stillOnTheList()], LATER, 'p1')

    expect(lines.map((l) => [l.itemId, l.included])).toEqual([
      ['old', true],
      ['todo', false],
    ])
  })

  it('is unchanged when no trip is named', () => {
    // Closing the trip that is still open: the cart is ticked and yesterday's
    // filed lines stay out, exactly as before.
    const lines = buildLines([filed(), inTodaysCart()], LATER, null)

    expect(lines.map((l) => [l.itemId, l.included])).toEqual([['today', true]])
  })
})

function matched(over: Partial<MatchedLine>): MatchedLine {
  return {
    index: 0,
    receipt_name: 'LECHE ENT 1L',
    item_id: 'a',
    item_name: 'Leche',
    price_type: 'UNIT',
    unit_price: 1.19,
    quantity: null,
    line_total: 1.19,
    ...over,
  }
}

function unmatched(over: Partial<UnmatchedLine>): UnmatchedLine {
  return {
    index: 0,
    receipt_name: 'BOLSA PLASTICO',
    price_type: 'UNIT',
    unit_price: 0.15,
    quantity: null,
    line_total: 0.15,
    ...over,
  }
}

function scan(
  matchedLines: MatchedLine[],
  unmatchedLines: UnmatchedLine[] = [],
): ReceiptScanResult {
  return {
    scan_id: 's1',
    store: 'Lidl',
    receipt_date: '2026-07-30',
    receipt_total: null,
    matched: matchedLines,
    unmatched: unmatchedLines,
  }
}

function row(over: Partial<CloseLine>): CloseLine {
  return {
    key: 'a',
    itemId: 'a',
    name: 'Leche',
    brand: null,
    quantity: null,
    price: null,
    pricePer: null,
    included: true,
    fromCart: true,
    ...over,
  }
}

describe('receiptToLines', () => {
  it('returns the lines in the order the paper printed them', () => {
    // The bug this replaces concatenated the two arrays, which would give
    // A, C, B. Only a line the matcher could not place, sitting between two it
    // could, tells the two apart.
    const result = scan(
      [
        matched({ index: 0, receipt_name: 'A', item_id: 'a' }),
        matched({ index: 2, receipt_name: 'C', item_id: 'c' }),
      ],
      [unmatched({ index: 1, receipt_name: 'B' })],
    )

    const lines = receiptToLines(result, [
      row({ key: 'a', itemId: 'a' }),
      row({ key: 'c', itemId: 'c', name: 'Café' }),
    ])

    expect(lines.map((l) => l.receiptLine)).toEqual(['A', 'B', 'C'])
  })

  it('fills a row the matcher recognised and ticks it', () => {
    const result = scan([
      matched({
        receipt_name: 'LECHE ENT 1L',
        item_id: 'a',
        unit_price: 1.19,
        line_total: 1.19,
      }),
    ])

    const lines = receiptToLines(result, [
      row({ key: 'a', itemId: 'a', name: 'Leche', brand: 'Pascual' }),
    ])

    expect(lines).toEqual([
      {
        key: 'a',
        itemId: 'a',
        name: 'Leche',
        brand: 'Pascual',
        quantity: '1',
        price: 1.19,
        pricePer: null,
        included: true,
        fromCart: true,
        receiptLine: 'LECHE ENT 1L',
        matchState: 'guess',
      },
    ])
  })

  it('drops the suggestion when the matched item has no row on this sheet', () => {
    // The matcher has no trip filter, so it names items filed under an older
    // ticket. Offering that name would let somebody pick an item the server
    // refuses, and it refuses the whole sheet.
    const result = scan([
      matched({
        receipt_name: 'YOGUR GRIEGO',
        item_id: 'old',
        item_name: 'Yogur griego',
        unit_price: 2.35,
      }),
    ])

    const lines = receiptToLines(result, [row({ key: 'a', itemId: 'a' })])

    expect(lines[0]).toMatchObject({
      itemId: null,
      name: '',
      receiptLine: 'YOGUR GRIEGO',
      price: 2.35,
      included: false,
    })
    expect(JSON.stringify(lines[0])).not.toContain('Yogur griego')
    expect(lines[0].matchState).toBeUndefined()
  })

  it('turns a line the matcher could not place into a row with no product', () => {
    const result = scan(
      [],
      [unmatched({ receipt_name: 'BOLSA PLASTICO', unit_price: 0.15 })],
    )

    const lines = receiptToLines(result, [])

    expect(lines[0]).toMatchObject({
      itemId: null,
      name: '',
      brand: null,
      receiptLine: 'BOLSA PLASTICO',
      price: 0.15,
      pricePer: null,
      quantity: '1',
      included: false,
      fromCart: false,
    })
    expect(lines[0].matchState).toBeUndefined()
  })

  it('keeps a row the paper never named, after the receipt and unticked', () => {
    const result = scan([matched({ receipt_name: 'LECHE', item_id: 'a' })])

    const lines = receiptToLines(result, [
      row({ key: 'a', itemId: 'a' }),
      row({
        key: 'b',
        itemId: 'b',
        name: 'Huevos',
        brand: 'Pascual',
        quantity: '12',
        price: 2.5,
        included: true,
      }),
    ])

    expect(lines[1]).toEqual({
      key: 'b',
      itemId: 'b',
      name: 'Huevos',
      brand: 'Pascual',
      quantity: '12',
      price: 2.5,
      pricePer: null,
      included: false,
      fromCart: true,
    })
  })

  it('keeps rows the paper never named in the order they already had', () => {
    const result = scan([matched({ receipt_name: 'LECHE', item_id: 'a' })])

    const lines = receiptToLines(result, [
      row({ key: 'z', itemId: 'z', name: 'Zumo' }),
      row({ key: 'a', itemId: 'a' }),
      row({ key: 'b', itemId: 'b', name: 'Huevos' }),
    ])

    expect(lines.map((l) => l.key)).toEqual(['a', 'z', 'b'])
  })

  it('gives a second line naming the same item a row of its own', () => {
    // Two tubs of the same yoghurt are two lines, and the matcher can name the
    // same item twice. One row cannot hold both, so the second asks.
    const result = scan([
      matched({ index: 0, receipt_name: 'YOGUR 1', item_id: 'a' }),
      matched({ index: 1, receipt_name: 'YOGUR 2', item_id: 'a' }),
    ])

    const lines = receiptToLines(result, [row({ key: 'a', itemId: 'a' })])

    expect(lines.map((l) => [l.key, l.itemId])).toEqual([
      ['a', 'a'],
      ['receipt-1', null],
    ])
  })
})

describe('receiptToLines quantities', () => {
  function quantityOf(over: Partial<UnmatchedLine>): string | null {
    return receiptToLines(scan([], [unmatched(over)]), [])[0].quantity
  }

  it('reads a line sold by the unit as one', () => {
    expect(quantityOf({ price_type: 'UNIT', quantity: 3 })).toBe('1')
  })

  it('reads a weight under a kilo in grams', () => {
    expect(quantityOf({ price_type: 'KILOGRAM', quantity: 0.524 })).toBe('524g')
  })

  it('reads a weight of a kilo or more in kilos', () => {
    expect(quantityOf({ price_type: 'KILOGRAM', quantity: 1.12 })).toBe(
      '1.12kg',
    )
  })

  it('rounds a count sold several at a time', () => {
    expect(quantityOf({ price_type: 'MULTI', quantity: 2.999 })).toBe('3')
  })

  it('falls back to one when the paper gave no amount', () => {
    expect(quantityOf({ price_type: 'KILOGRAM', quantity: null })).toBe('1')
  })

  it('carries the unit of a line priced by the kilo', () => {
    const lines = receiptToLines(
      scan([], [unmatched({ price_type: 'KILOGRAM', quantity: 1.12 })]),
      [],
    )

    expect(lines[0].pricePer).toBe('KILOGRAM')
  })
})

describe('receiptTotal', () => {
  it('counts a receipt line the household did not tick', () => {
    const lines = receiptToLines(
      scan(
        [matched({ index: 0, item_id: 'a', unit_price: 2 })],
        [unmatched({ index: 1, unit_price: 3 })],
      ),
      [row({ key: 'a', itemId: 'a' })],
    )

    // The unticked line is still printed on the paper, so the reconciliation
    // check has to see it. The button's figure must not.
    expect(receiptTotal(lines)).toEqual({ total: 5, partial: false })
    expect(linesTotal(lines)).toEqual({ total: 2, partial: false })
  })

  it('leaves out a row that never came from the paper', () => {
    const lines = receiptToLines(
      scan([matched({ item_id: 'a', unit_price: 2 })]),
      [
        row({ key: 'a', itemId: 'a' }),
        row({ key: 'b', itemId: 'b', name: 'Huevos', price: 9 }),
      ],
    )

    expect(receiptTotal(lines)).toEqual({ total: 2, partial: false })
  })

  it('is null when no row came from the paper', () => {
    expect(receiptTotal([row({ price: 3 })])).toBeNull()
  })

  it('is partial when a weighed line has no weight to apply its price to', () => {
    const lines = receiptToLines(
      scan(
        [matched({ index: 0, item_id: 'a', unit_price: 2 })],
        [
          unmatched({
            index: 1,
            price_type: 'KILOGRAM',
            quantity: null,
            unit_price: 8,
          }),
        ],
      ),
      [row({ key: 'a', itemId: 'a' })],
    )

    expect(receiptTotal(lines)).toEqual({ total: 2, partial: true })
  })
})

describe('discardPaper', () => {
  it('drops the paper’s authority and keeps everything it parsed', () => {
    const lines = receiptToLines(
      scan(
        [matched({ index: 0, item_id: 'a', unit_price: 1.19 })],
        [unmatched({ index: 1, receipt_name: 'BOLSA', unit_price: 0.15 })],
      ),
      [row({ key: 'a', itemId: 'a' })],
    )

    const kept = discardPaper(lines)

    expect(kept.map((l) => l.receiptLine)).toEqual([undefined, undefined])
    expect(kept.map((l) => l.matchState)).toEqual([undefined, undefined])
    expect(
      kept.map((l) => [l.itemId, l.price, l.quantity, l.included]),
    ).toEqual([
      ['a', 1.19, '1', true],
      [null, 0.15, '1', false],
    ])
  })

  it('leaves no line for the reconciliation check to sum', () => {
    const lines = receiptToLines(scan([matched({ item_id: 'a' })]), [
      row({ key: 'a', itemId: 'a' }),
    ])

    expect(receiptTotal(discardPaper(lines))).toBeNull()
    expect(linesTotal(discardPaper(lines))).toEqual(linesTotal(lines))
  })
})
