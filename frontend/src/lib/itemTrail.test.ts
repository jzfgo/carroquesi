import { describe, expect, it } from 'vitest'
import { itemTrail } from './itemTrail'
import type { ChartEntry } from './priceNormalization'

// Every instant here is midday UTC. The vitest runner takes the machine's
// timezone — only the browser's is pinned — so a midnight timestamp would land
// on a different day depending on where the suite runs.
function entry(over: Partial<ChartEntry> = {}): ChartEntry {
  // The two amounts default to the same number because that is what a history
  // that converted nothing looks like. Letting them drift apart by accident
  // builds a record no normalisation can produce.
  const originalAmount =
    over.originalAmount === undefined ? 1 : over.originalAmount
  return {
    displayAmount: originalAmount,
    displayPricePer: null,
    store: 'Mercadona',
    purchased_at: '2026-03-18T12:00:00',
    originalAmount,
    originalPricePer: null,
    ...over,
  }
}

describe('itemTrail', () => {
  it('names who put it there and when', () => {
    const [first] = itemTrail({
      addedBy: 'Marta',
      createdAt: '2026-07-18T12:00:00',
      entries: [],
    })
    expect(first).toBe('Lo añadió Marta el 18 jul.')
  })

  it('says nothing about who added it when the member is unknown', () => {
    expect(
      itemTrail({
        addedBy: null,
        createdAt: '2026-07-18T12:00:00',
        entries: [],
      }),
    ).toEqual([])
  })

  it('counts the purchases from the first month to the last date', () => {
    const trail = itemTrail({
      addedBy: null,
      createdAt: '2026-03-01T12:00:00',
      entries: [
        entry({ purchased_at: '2026-03-18T12:00:00' }),
        entry({ purchased_at: '2026-07-22T12:00:00' }),
        entry({ purchased_at: '2026-05-02T12:00:00' }),
      ],
    })
    expect(trail).toEqual([
      'Comprado 3 veces desde marzo, la última el 22 jul.',
    ])
  })

  it('counts one purchase in words, not as a figure', () => {
    const trail = itemTrail({
      addedBy: null,
      createdAt: '2026-03-01T12:00:00',
      entries: [entry()],
    })
    expect(trail[0]).toMatch(/^Comprado una vez desde marzo/)
  })

  it('gives the range somebody actually paid', () => {
    const trail = itemTrail({
      addedBy: null,
      createdAt: '2026-03-01T12:00:00',
      entries: [
        entry({ originalAmount: 5.1 }),
        entry({ originalAmount: 5.79 }),
        entry({ originalAmount: 5.34 }),
      ],
    })
    expect(trail[1]).toBe('Se paga entre € 5,10 y € 5,79.')
  })

  it('leaves the range out when both ends are the same price', () => {
    const trail = itemTrail({
      addedBy: null,
      createdAt: '2026-03-01T12:00:00',
      entries: [entry({ originalAmount: 5.1 }), entry({ originalAmount: 5.1 })],
    })
    expect(trail.some((s) => s.startsWith('Se paga'))).toBe(false)
  })

  // The sentence has no column heading to warn anyone, so both ends have to be
  // the same kind of number. A history holding a per-kilo price and a per-unit
  // one converts what it can and leaves the rest without a display amount.
  it('keeps both ends of the range on one scale, and says which', () => {
    const trail = itemTrail({
      addedBy: null,
      createdAt: '2026-03-01T12:00:00',
      entries: [
        entry({
          originalAmount: 1.49,
          displayAmount: 0.99,
          displayPricePer: 'KILOGRAM',
        }),
        entry({
          originalAmount: 1.2,
          displayAmount: 1.2,
          displayPricePer: 'KILOGRAM',
          originalPricePer: 'KILOGRAM',
        }),
        // Per unit, and no quantity to convert it: not on this scale at all.
        entry({
          originalAmount: 5.34,
          displayAmount: null,
          displayPricePer: 'KILOGRAM',
        }),
      ],
    })
    expect(trail[1]).toBe('Se paga entre € 0,99/kg y € 1,20/kg.')
  })

  it('ignores a shop that recorded no amount when working out the range', () => {
    const trail = itemTrail({
      addedBy: null,
      createdAt: '2026-03-01T12:00:00',
      entries: [
        entry({ originalAmount: 5.1 }),
        entry({ originalAmount: null, displayAmount: null }),
        entry({ originalAmount: 5.79 }),
      ],
    })
    expect(trail[1]).toBe('Se paga entre € 5,10 y € 5,79.')
  })
})
