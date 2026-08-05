/* eslint-disable react-refresh/only-export-components --
   This module is a set of pure chart helpers plus one small SVG component that
   draws from them. They belong together, and fast-refresh has nothing to keep
   warm here. */
import { formatPrice } from './formatPrice'
import type { ChartEntry } from './priceNormalization'

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
