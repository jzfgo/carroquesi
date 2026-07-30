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

    expect(linesTotal(lines)).toBe(6)
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

    expect(linesTotal(lines)).toBe(6)
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

    expect(linesTotal(lines)).toBe(4)
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
