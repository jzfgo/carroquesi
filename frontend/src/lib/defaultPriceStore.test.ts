import { describe, expect, it } from 'vitest'
import type { ListItem } from '../types'
import { defaultPriceStore } from './defaultPriceStore'

const bought = (over: Partial<ListItem>): ListItem => ({
  id: 'i1',
  list_id: 'l1',
  name: 'Leche',
  quantity: null,
  purchased_quantity: null,
  brand: null,
  stores: [],
  purchased: true,
  purchased_at: '2026-05-07T10:00:00Z',
  purchase_has_receipt: false,
  purchase_ends_at: '2026-05-07T22:00:00Z',
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'user-1',
  created_at: '',
  updated_at: '',
  ...over,
})

describe('defaultPriceStore', () => {
  it("starts on the trip's store, not the item's planned store", () => {
    const item = bought({ purchase_store: 'Mercadona', stores: ['Ahorramas'] })
    expect(defaultPriceStore(item)).toBe('Mercadona')
  })

  it('keeps a store someone already saved with the price', () => {
    const item = bought({
      price: 1.2,
      price_store: 'Lidl',
      purchase_store: 'Mercadona',
    })
    expect(defaultPriceStore(item)).toBe('Lidl')
  })

  it("falls back to the item's planned store when the trip names none", () => {
    expect(defaultPriceStore(bought({ stores: ['Ahorramas'] }))).toBe(
      'Ahorramas',
    )
  })

  it('is empty when nothing names a store', () => {
    expect(defaultPriceStore(bought({}))).toBeNull()
  })
})
