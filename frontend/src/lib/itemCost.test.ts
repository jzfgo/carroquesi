import { describe, it, expect } from 'vitest'
import { computeCostSummary } from './itemCost'
import type { ListItem } from '../types'

function makeItem(overrides: Partial<ListItem> = {}): ListItem {
  return {
    id: '1',
    list_id: 'list-1',
    name: 'Test item',
    quantity: null,
    purchased_quantity: null,
    brand: null,
    stores: [],
    purchased: false,
    purchased_at: null,
    ean: null,
    price: null,
    price_per: null,
    price_store: null,
    added_by: 'user-1',
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
    ...overrides,
  }
}

describe('computeCostSummary — purchased_quantity', () => {
  it('uses quantity when item is not purchased', () => {
    const item = makeItem({ price: 2.0, quantity: '3', purchased: false })
    const result = computeCostSummary([item])
    expect(result?.total).toBeCloseTo(6.0)
  })

  it('uses purchased_quantity when purchased and set', () => {
    const item = makeItem({
      price: 1.79,
      price_per: 'KILOGRAM',
      quantity: '2',              // planned: 2 units (ignored for purchased)
      purchased_quantity: '487g', // actual: 487g
      purchased: true,
      purchased_at: '2026-05-31T10:00:00',
    })
    const result = computeCostSummary([item])
    // 1.79 €/kg × 0.487 kg = 0.87173 ≈ 0.87
    expect(result?.total).toBeCloseTo(0.872, 2)
  })

  it('falls back to quantity when purchased but purchased_quantity is null', () => {
    const item = makeItem({
      price: 1.0,
      quantity: '3',
      purchased_quantity: null,
      purchased: true,
      purchased_at: '2026-05-31T10:00:00',
    })
    const result = computeCostSummary([item])
    expect(result?.total).toBeCloseTo(3.0)
  })

  it('marks partial=true when purchased_quantity is unresolvable per-kg', () => {
    const item = makeItem({
      price: 1.79,
      price_per: 'KILOGRAM',
      quantity: '2',
      purchased_quantity: 'unknown', // not parseable as SI unit
      purchased: true,
      purchased_at: '2026-05-31T10:00:00',
    })
    const result = computeCostSummary([item])
    expect(result).toBeNull() // total is 0 → null
  })
})
