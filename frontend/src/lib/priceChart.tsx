/* eslint-disable react-refresh/only-export-components --
   This module is a set of pure chart helpers plus one small SVG component that
   draws from them. They belong together, and fast-refresh has nothing to keep
   warm here. */
import { formatPrice } from './formatPrice'
import type { ChartEntry } from './priceNormalization'
import { storeKey } from './storeKey'

/**
 * Pure chart helpers shared by the price-history sheet and the product ficha's
 * price block. Both draw the same curve and read the same min/max/last figures
 * off a store's records, so the maths lives here once.
 */

const SHORT_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/**
 * A record's day as «22 jul». Read straight from the ISO string's date part so
 * the label never shifts with the runner's timezone — a purchase filed on the
 * 22nd must read «22 jul» in every zone, and Intl on a UTC-midnight instant
 * would slide it a day either way.
 */
export function formatChartDate(iso: string): string {
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return '—'
  const day = parseInt(m[3], 10)
  const monthIdx = parseInt(m[2], 10) - 1
  const month = SHORT_MONTHS[monthIdx] ?? ''
  return `${day} ${month}`.trim()
}

interface CurveGeometry {
  pathD: string
  areaPaths: string[]
  /** X positions of gap points (a purchase with no plottable price). */
  gapX: number[]
  validCount: number
}

/**
 * Turns a store's records (newest first) into an SVG line path, area-fill
 * paths, and the X of any gap point. X is time-proportional; a flat series
 * centres on the mid-line instead of hugging the top edge.
 */
function curveGeometry(
  records: ChartEntry[],
  w: number,
  h: number,
  pad: number,
): CurveGeometry {
  const reversed = [...records].reverse()
  const validAmounts = reversed
    .map((r) => r.displayAmount)
    .filter((a): a is number => a !== null)

  const timestamps = reversed.map((r) =>
    r.purchased_at ? new Date(r.purchased_at).getTime() : null,
  )
  const validTs = timestamps.filter((t): t is number => t !== null)
  const minMs = validTs.length > 0 ? Math.min(...validTs) : 0
  const maxMs = validTs.length > 0 ? Math.max(...validTs) : 0
  const timeRange = maxMs - minMs
  const getX = (i: number): number => {
    const evenX =
      reversed.length === 1
        ? w / 2
        : pad + (i / (reversed.length - 1)) * (w - 2 * pad)
    if (timeRange === 0 || timestamps[i] === null) return evenX
    return pad + ((timestamps[i]! - minMs) / timeRange) * (w - 2 * pad)
  }

  const min = validAmounts.length > 0 ? Math.min(...validAmounts) : 0
  const max = validAmounts.length > 0 ? Math.max(...validAmounts) : 0
  const range = max - min || 1
  const getY = (amount: number) =>
    min === max ? h / 2 : pad + ((max - amount) / range) * (h - 2 * pad)

  const pts = reversed.map((r, i) => {
    const x = getX(i)
    if (r.displayAmount === null) return { x, y: null as number | null }
    return { x, y: getY(r.displayAmount) }
  })

  const pathD = pts
    .map((pt, i) => {
      if (pt.y === null) return null
      const prev = i > 0 ? pts[i - 1] : null
      const cmd = prev === null || prev.y === null ? 'M' : 'L'
      return `${cmd}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    })
    .filter(Boolean)
    .join(' ')

  const areaPaths: string[] = []
  let runStart: number | null = null
  for (let i = 0; i <= pts.length; i++) {
    const isValid = i < pts.length && pts[i].y !== null
    if (isValid && runStart === null) {
      runStart = i
    } else if (!isValid && runStart !== null) {
      const run = pts.slice(runStart, i)
      if (run.length >= 2) {
        const runLine = run
          .map(
            (p, j) =>
              `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y!.toFixed(1)}`,
          )
          .join(' ')
        areaPaths.push(
          `${runLine} L${run[run.length - 1].x.toFixed(1)},${h} L${run[0].x.toFixed(1)},${h} Z`,
        )
      }
      runStart = null
    }
  }

  const gapX = pts.filter((p) => p.y === null).map((p) => p.x)

  return { pathD, areaPaths, gapX, validCount: validAmounts.length }
}

interface SparklineProps {
  records: ChartEntry[]
  width?: number
  height?: number
  pad?: number
  strokeWidth?: number
  className?: string
}

/**
 * The price curve as an inline SVG. One point (or none) renders as dots; two or
 * more render an area-filled line, with a muted dot for any gap. Sized by prop
 * so the same maths serves the collapsed row, the expanded chart, and the
 * ficha's big "último precio" curve.
 */
export function Sparkline({
  records,
  width = 60,
  height = 28,
  pad = 4,
  strokeWidth = 1.5,
  className = 'phs__sparkline',
}: SparklineProps) {
  const { pathD, areaPaths, gapX, validCount } = curveGeometry(
    records,
    width,
    height,
    pad,
  )

  if (validCount < 2) {
    // Single/zero valid points: place a dot per record at the mid-line.
    const dots = pointsForDots(records, width, pad)
    return (
      <svg className={className} viewBox={`0 0 ${width} ${height}`}>
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x.toFixed(1)}
            cy={height / 2}
            r="2"
            fill="var(--color-primary, #0a84ff)"
            opacity={d.valid ? undefined : '0.5'}
          />
        ))}
      </svg>
    )
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {areaPaths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="var(--color-primary-bg, rgba(10,132,255,0.15))"
        />
      ))}
      {pathD && (
        <path
          d={pathD}
          stroke="var(--color-primary, #0a84ff)"
          strokeWidth={strokeWidth}
          fill="none"
        />
      )}
      {gapX.map((x, i) => (
        <circle
          key={i}
          cx={x.toFixed(1)}
          cy={height / 2}
          r="2"
          fill="var(--color-primary, #0a84ff)"
          opacity="0.5"
        />
      ))}
    </svg>
  )
}

function pointsForDots(
  records: ChartEntry[],
  w: number,
  pad: number,
): { x: number; valid: boolean }[] {
  const reversed = [...records].reverse()
  const timestamps = reversed.map((r) =>
    r.purchased_at ? new Date(r.purchased_at).getTime() : null,
  )
  const validTs = timestamps.filter((t): t is number => t !== null)
  const minMs = validTs.length > 0 ? Math.min(...validTs) : 0
  const maxMs = validTs.length > 0 ? Math.max(...validTs) : 0
  const timeRange = maxMs - minMs
  return reversed.map((r, i) => {
    const evenX =
      reversed.length === 1
        ? w / 2
        : pad + (i / (reversed.length - 1)) * (w - 2 * pad)
    const x =
      timeRange === 0 || timestamps[i] === null
        ? evenX
        : pad + ((timestamps[i]! - minMs) / timeRange) * (w - 2 * pad)
    return { x, valid: r.displayAmount !== null }
  })
}

export interface PriceStats {
  min: number | null
  max: number | null
  latest: ChartEntry | null
  displayPricePer: 'KILOGRAM' | null
  hasValid: boolean
}

/**
 * Minimum, maximum, and latest price for a store's records (newest first).
 * The latest keeps its own record so a caller can fall back to its original
 * (un-normalised) amount when the display amount could not be computed.
 */
export function priceStats(records: ChartEntry[]): PriceStats {
  const valid = records
    .map((r) => r.displayAmount)
    .filter((a): a is number => a !== null)
  const latest = records[0] ?? null
  return {
    min: valid.length > 0 ? Math.min(...valid) : null,
    max: valid.length > 0 ? Math.max(...valid) : null,
    latest,
    displayPricePer: latest?.displayPricePer ?? null,
    hasValid: valid.length > 0,
  }
}

/**
 * The price a record prints, preferring its normalised display amount and
 * falling back to the raw amount when normalisation left a gap.
 */
export function recordAmountLabel(r: ChartEntry): string {
  return r.displayAmount !== null
    ? formatPrice(r.displayAmount, r.displayPricePer)
    : formatPrice(r.originalAmount, r.originalPricePer as 'KILOGRAM' | null)
}

export interface BandGeometry {
  /** Filled min–max ribbons, one per run of stores that overlap in time. */
  bandPaths: string[]
  /** The average line, broken into one M…L… run per continuous stretch. */
  avgPathD: string
  /** A dot per store seen only once — an observation, not a trend. */
  dots: { x: number; y: number }[]
  /** True when any moment had two or more stores, so the band has width. */
  hasWidth: boolean
  /** Count of priced, dated points that reached the geometry. */
  validCount: number
}

interface StoreSeries {
  first: number
  last: number
  ts: number[]
  vs: number[]
}

/**
 * Builds the combined price glance: one average line with a min–max band across
 * the stores tracked over time, plus a dot for any store seen only once.
 *
 * The rule that keeps it honest: a line is only ever drawn along a single
 * store's own points. At each moment the band and the average read across the
 * stores that genuinely overlap there — never joining two different stores into
 * one slope, which is a change of shop, not a change of price. A store seen once
 * cannot form a line, so it stays a dot; two stores that never shared a moment
 * leave a break in the average rather than a bridge between them.
 */
export function bandGeometry(
  records: ChartEntry[],
  w: number,
  h: number,
  pad: number,
): BandGeometry {
  // The glance plots priced, dated points only; gap records live in the
  // per-store detail, not here.
  const priced = records
    .filter(
      (r): r is ChartEntry & { displayAmount: number; purchased_at: string } =>
        r.displayAmount !== null && r.purchased_at !== null,
    )
    .map((r) => ({
      key: r.store ? storeKey(r.store) : '__none__',
      t: new Date(r.purchased_at).getTime(),
      v: r.displayAmount,
    }))

  const validCount = priced.length

  // Time spans the X axis; price spans the Y axis over every point, so a lone
  // high or low observation still lands inside the frame.
  const allT = priced.map((p) => p.t)
  const allV = priced.map((p) => p.v)
  const minT = allT.length ? Math.min(...allT) : 0
  const maxT = allT.length ? Math.max(...allT) : 0
  const tRange = maxT - minT
  const minV = allV.length ? Math.min(...allV) : 0
  const maxV = allV.length ? Math.max(...allV) : 0
  const vRange = maxV - minV || 1
  const getX = (t: number) =>
    tRange === 0 ? w / 2 : pad + ((t - minT) / tRange) * (w - 2 * pad)
  const getY = (v: number) =>
    minV === maxV ? h / 2 : pad + ((maxV - v) / vRange) * (h - 2 * pad)

  // Group by store, averaging any points that share a timestamp so each store
  // reads as a strictly increasing series.
  const groups = new Map<string, Map<number, number[]>>()
  for (const p of priced) {
    let g = groups.get(p.key)
    if (!g) {
      g = new Map()
      groups.set(p.key, g)
    }
    const bucket = g.get(p.t)
    if (bucket) bucket.push(p.v)
    else g.set(p.t, [p.v])
  }

  const lineStores: StoreSeries[] = []
  const dots: { x: number; y: number }[] = []
  for (const g of groups.values()) {
    const ts = [...g.keys()].sort((a, b) => a - b)
    const vs = ts.map((t) => {
      const arr = g.get(t)!
      return arr.reduce((s, x) => s + x, 0) / arr.length
    })
    if (ts.length >= 2 && ts[ts.length - 1] > ts[0]) {
      lineStores.push({ first: ts[0], last: ts[ts.length - 1], ts, vs })
    } else {
      // One moment, however many receipts: a dot, never a line.
      for (let i = 0; i < ts.length; i++)
        dots.push({ x: getX(ts[i]), y: getY(vs[i]) })
    }
  }

  // A store's price at time t, but only inside its own observed span — never
  // extrapolated past the first or last time we actually saw it.
  const valueAt = (s: StoreSeries, t: number): number | null => {
    if (t < s.first || t > s.last) return null
    for (let i = 1; i < s.ts.length; i++) {
      if (t <= s.ts[i]) {
        const t0 = s.ts[i - 1]
        const t1 = s.ts[i]
        if (t1 === t0) return s.vs[i]
        return s.vs[i - 1] + ((s.vs[i] - s.vs[i - 1]) * (t - t0)) / (t1 - t0)
      }
    }
    return s.vs[s.vs.length - 1]
  }

  // Sample at every line-store vertex. Store membership changes only at a
  // vertex, and a mean of the present stores is linear between vertices, so the
  // average line is exact. The band edges are only sampled here, so where two
  // stores cross between vertices the ribbon cuts that corner and reads a touch
  // narrow. That is cosmetic — it never bridges stores that do not overlap.
  const sampleTs = [...new Set(lineStores.flatMap((s) => s.ts))].sort(
    (a, b) => a - b,
  )
  const samples = sampleTs.map((t) => {
    const vals: number[] = []
    for (const s of lineStores) {
      const v = valueAt(s, t)
      if (v !== null) vals.push(v)
    }
    return {
      t,
      lo: Math.min(...vals),
      hi: Math.max(...vals),
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    }
  })

  // Join two adjacent samples only when one store spans the whole gap between
  // them. Otherwise they belong to stores that never shared a moment, and a
  // line across them is the cross-store slope this chart exists to avoid.
  const runs: (typeof samples)[] = []
  let run: typeof samples = []
  for (let i = 0; i < samples.length; i++) {
    const connected =
      run.length > 0 &&
      lineStores.some(
        (s) => s.first <= samples[i - 1].t && s.last >= samples[i].t,
      )
    if (connected) {
      run.push(samples[i])
    } else {
      if (run.length) runs.push(run)
      run = [samples[i]]
    }
  }
  if (run.length) runs.push(run)

  const bandPaths: string[] = []
  const avgSegments: string[] = []
  let hasWidth = false
  const pt = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`
  for (const r of runs) {
    avgSegments.push(
      r
        .map((s, j) => `${j === 0 ? 'M' : 'L'}${pt(getX(s.t), getY(s.avg))}`)
        .join(' '),
    )
    // A ribbon needs two samples and some spread; a run that is one point or a
    // lone store (hi === lo throughout) has no visible area.
    if (r.length >= 2 && r.some((s) => s.hi > s.lo)) {
      hasWidth = true
      const top = r
        .map((s, j) => `${j === 0 ? 'M' : 'L'}${pt(getX(s.t), getY(s.hi))}`)
        .join(' ')
      const bottom = [...r]
        .reverse()
        .map((s) => `L${pt(getX(s.t), getY(s.lo))}`)
        .join(' ')
      bandPaths.push(`${top} ${bottom} Z`)
    }
  }

  return {
    bandPaths,
    avgPathD: avgSegments.join(' '),
    dots,
    hasWidth,
    validCount,
  }
}

interface PriceBandProps {
  records: ChartEntry[]
  width?: number
  height?: number
  pad?: number
  strokeWidth?: number
  className?: string
}

/**
 * The ficha's combined price glance. Unlike the per-store Sparkline it never
 * joins two different stores into one line: it shows the average across the
 * stores tracked over time, a min–max band where they overlap, and a dot for
 * any store seen only once. Renders nothing when there is no priced history.
 */
export function PriceBand({
  records,
  width = 120,
  height = 42,
  pad = 6,
  strokeWidth = 1.5,
  className = 'phs__sparkline',
}: PriceBandProps) {
  const { bandPaths, avgPathD, dots, validCount } = bandGeometry(
    records,
    width,
    height,
    pad,
  )

  if (validCount === 0) return null

  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`}>
      {bandPaths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="var(--color-primary-bg, rgba(10,132,255,0.15))"
        />
      ))}
      {avgPathD && (
        <path
          d={avgPathD}
          stroke="var(--color-primary, #0a84ff)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x.toFixed(1)}
          cy={d.y.toFixed(1)}
          r="2"
          fill="var(--color-primary, #0a84ff)"
        />
      ))}
    </svg>
  )
}
