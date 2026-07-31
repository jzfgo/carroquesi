import { describe, expect, it } from 'vitest'
import type { ListItem } from '../types'
import { computeCostSummary, purchasedDateLabel } from './itemCost'

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
      quantity: '2', // planned: 2 units (ignored for purchased)
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

// The runner's zone is not pinned — only the browser's is — so an assertion
// naming a day is one that fails for whoever sits furthest east. `day()` asks
// for the same instant instead.
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { dateStyle: 'medium' })

describe('purchasedDateLabel', () => {
  it('reads a stored stamp as the naive UTC it is', () => {
    expect(purchasedDateLabel('2026-07-22T12:00:00')).toBe(
      day('2026-07-22T12:00:00Z'),
    )
  })

  // It used to append `Z` unconditionally, so a stamp that already named its
  // zone became `...+02:00Z` — an `Invalid Date` whose label is the literal
  // string «Invalid Date», printed as a heading over the day's shop. Both of
  // these read correctly now; both read «Invalid Date» against the old line.
  it.each([
    ['a stamp that already names UTC', '2026-07-22T12:00:00Z'],
    ['a stamp that names an offset', '2026-07-23T00:30:00+02:00'],
  ])('reads %s as the instant it is', (_why, stamp) => {
    expect(purchasedDateLabel(stamp)).toBe(day(stamp))
  })

  // The one case that genuinely has no answer. It also read «Invalid Date».
  it('says it does not know when the stamp is not a date at all', () => {
    expect(purchasedDateLabel('el martes pasado')).toBe('Fecha desconocida')
  })

  it('still says it does not know when there is no stamp', () => {
    expect(purchasedDateLabel(null)).toBe('Fecha desconocida')
  })

  // `day()` above mirrors the implementation, so it cannot see the locale tag
  // change under it — the one thing it does not pin is the one thing it shares.
  // This asks the question the mirror cannot: the label is Spanish. It stays
  // zone-free by naming the whole set rather than a month, because no single
  // instant lands on one calendar day everywhere from −11 to +14.
  it('writes the month in Spanish', () => {
    const months = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sept',
      'oct',
      'nov',
      'dic',
    ]
    const label = purchasedDateLabel('2026-07-22T12:00:00')
    expect(label).toMatch(/^\d{1,2} \p{L}+ \d{4}$/u)
    expect(months).toContain(label.split(' ')[1])
  })
})
