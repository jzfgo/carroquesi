import { describe, expect, it } from 'vitest'
import type { ListItem } from '../types'
import { buildLines, linesTotal, toPayload, type CloseLine } from './closeLines'

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
