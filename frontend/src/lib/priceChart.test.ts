import { expect, test } from 'vitest'
import { bandGeometry, priceStats } from './priceChart'
import type { ChartEntry } from './priceNormalization'

// A priced point for one store on one day. ISO strings carry an explicit Z so
// getTime() is the same instant in every timezone — the suite runs at the
// machine's zone, and these assertions must not move with it.
function point(
  v: number | null,
  store: string | null,
  day: string,
): ChartEntry {
  return {
    displayAmount: v,
    displayPricePer: 'KILOGRAM',
    store,
    purchased_at: `2026-07-${day}T10:00:00Z`,
    originalAmount: v ?? 0,
    originalPricePer: 'KILOGRAM',
    reduced: false,
    originalBefore: null,
  }
}

const W = 120
const H = 42
const PAD = 6

function countMoves(path: string): number {
  return (path.match(/M/g) ?? []).length
}

test('one store with several points draws a single line and no band', () => {
  const g = bandGeometry(
    [point(1.0, 'Mercadona', '01'), point(1.2, 'Mercadona', '10')],
    W,
    H,
    PAD,
  )
  expect(g.validCount).toBe(2)
  expect(countMoves(g.avgPathD)).toBe(1)
  expect(g.bandPaths).toHaveLength(0)
  expect(g.hasWidth).toBe(false)
  expect(g.dots).toHaveLength(0)
})

test('two stores overlapping in time draw an average line with a min–max band', () => {
  const g = bandGeometry(
    [
      point(1.0, 'Mercadona', '01'),
      point(1.2, 'Mercadona', '10'),
      point(1.4, 'Carrefour', '01'),
      point(1.6, 'Carrefour', '10'),
    ],
    W,
    H,
    PAD,
  )
  expect(g.hasWidth).toBe(true)
  expect(g.bandPaths).toHaveLength(1)
  expect(countMoves(g.avgPathD)).toBe(1)
  expect(g.dots).toHaveLength(0)
})

test('two stores that never share a moment break the line instead of bridging', () => {
  // Mercadona in early July, Carrefour later, no overlap. Joining them would
  // redraw the very cross-store slope this chart exists to avoid.
  const g = bandGeometry(
    [
      point(1.0, 'Mercadona', '01'),
      point(1.1, 'Mercadona', '05'),
      point(1.5, 'Carrefour', '20'),
      point(1.6, 'Carrefour', '25'),
    ],
    W,
    H,
    PAD,
  )
  expect(countMoves(g.avgPathD)).toBe(2)
  expect(g.hasWidth).toBe(false)
})

test('a store seen once is a dot, not part of the line', () => {
  const g = bandGeometry(
    [
      point(1.0, 'Mercadona', '01'),
      point(1.2, 'Mercadona', '10'),
      point(2.0, 'Lidl', '05'),
    ],
    W,
    H,
    PAD,
  )
  expect(g.dots).toHaveLength(1)
  expect(countMoves(g.avgPathD)).toBe(1)
})

test('when every store is seen only once there is no line, only dots', () => {
  const g = bandGeometry(
    [point(1.0, 'Mercadona', '01'), point(1.4, 'Carrefour', '10')],
    W,
    H,
    PAD,
  )
  expect(g.avgPathD).toBe('')
  expect(g.bandPaths).toHaveLength(0)
  expect(g.dots).toHaveLength(2)
  expect(g.validCount).toBe(2)
})

test('gap records without a plottable price are excluded from the geometry', () => {
  const g = bandGeometry(
    [
      point(1.0, 'Mercadona', '01'),
      point(1.2, 'Mercadona', '10'),
      point(null, 'Mercadona', '15'),
    ],
    W,
    H,
    PAD,
  )
  expect(g.validCount).toBe(2)
})

test('a reduced price is a hollow point, off the line and out of the band', () => {
  const g = bandGeometry(
    [
      point(12.6, 'Mercadona', '01'),
      { ...point(8.82, 'Mercadona', '05'), reduced: true },
      point(12.6, 'Mercadona', '10'),
    ],
    W,
    H,
    PAD,
  )
  expect(g.hollow).toHaveLength(1)
  // The two full prices still form one line, joined across the hollow one.
  expect(countMoves(g.avgPathD)).toBe(1)
  expect(g.dots).toHaveLength(0)
  // The scale spans the hollow point, so it sits below the line, in frame.
  expect(g.hollow[0].y).toBeGreaterThan(H / 2)
  expect(g.hollow[0].y).toBeLessThanOrEqual(H - PAD)
})

test('the minimum and maximum skip a reduced price; the latest does not', () => {
  const s = priceStats([
    { ...point(8.82, 'Mercadona', '10'), reduced: true },
    point(12.6, 'Mercadona', '05'),
    point(11.95, 'Mercadona', '01'),
  ])
  expect(s.min).toBe(11.95)
  expect(s.max).toBe(12.6)
  expect(s.latest?.displayAmount).toBe(8.82)
  expect(s.hasReduced).toBe(true)
})

test('spelling variants of one store stay a single line, not two', () => {
  // The store key collapses «Mercadona» and «MERCADONA» to one series, so this
  // is one store with two points — a line — not two single-point dots.
  const g = bandGeometry(
    [point(1.0, 'Mercadona', '01'), point(1.2, 'MERCADONA', '10')],
    W,
    H,
    PAD,
  )
  expect(g.dots).toHaveLength(0)
  expect(countMoves(g.avgPathD)).toBe(1)
})
