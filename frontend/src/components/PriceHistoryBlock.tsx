import { ChevronDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { formatAmount } from '../lib/formatPrice'
import { formatShortDate } from '../lib/formatShortDate'
import type { ChartEntry } from '../lib/priceNormalization'
import './PriceHistoryBlock.css'

interface StoreGroup {
  store: string | null
  records: ChartEntry[]
}

function groupByStore(entries: ChartEntry[]): StoreGroup[] {
  const map = new Map<string, StoreGroup>()
  for (const entry of entries) {
    const key = entry.store ?? '__none__'
    if (!map.has(key)) map.set(key, { store: entry.store, records: [] })
    map.get(key)!.records.push(entry)
  }
  for (const group of map.values()) {
    group.records.sort((a, b) => {
      if (!a.purchased_at && !b.purchased_at) return 0
      if (!a.purchased_at) return 1
      if (!b.purchased_at) return -1
      return b.purchased_at.localeCompare(a.purchased_at)
    })
  }
  return [...map.values()].sort((a, b) => {
    const aDate = a.records[0]?.purchased_at ?? ''
    const bDate = b.records[0]?.purchased_at ?? ''
    return bDate.localeCompare(aDate)
  })
}

/**
 * The figure a shop actually recorded, which is the one that leads every row.
 * Rule 10: every amount in a history is one somebody confirmed, so a derived
 * one never takes its place — it goes beside it, carrying its ≈.
 */
function recordedAmount(r: ChartEntry): string | null {
  if (r.originalAmount === null) return null
  return formatAmount(r.originalAmount, r.originalPricePer as 'KILOGRAM' | null)
}

/** The €/kg the app worked out, when it is not simply the recorded figure. */
function convertedAmount(r: ChartEntry): string | null {
  if (r.displayAmount === null) return null
  if (r.originalPricePer === (r.displayPricePer as string | null)) return null
  return `≈ ${formatAmount(r.displayAmount, r.displayPricePer)}`
}

/**
 * The records the three figures may be computed over.
 *
 * displayAmount is the only field on one consistent scale: when the history
 * normalises, every entry that could convert holds €/kg and the rest hold null.
 * Falling back to originalAmount for those would put a per-unit price and a
 * per-kilo price in the same comparison, and print the answer under whichever
 * unit came first — a figure nobody ever paid.
 */
function comparableRecords(records: ChartEntry[]): ChartEntry[] {
  return records.filter((r) => r.displayAmount !== null)
}

/**
 * The whole history as one curve, for the top of the sheet. It answers "is it
 * going up" without asking anyone to read a number, which is the reason 22a
 * puts it beside the price rather than under the records.
 */
export function PriceSparkline({ entries }: { entries: ChartEntry[] }) {
  // A shop that recorded no amount is left out rather than drawn as a break.
  // The records below are where a gap is the point; up here the curve is only
  // ever the prices there are, and severing it at a missing one says the price
  // did something, which is exactly what nobody knows.
  const byDate = comparableRecords(entries).sort((a, b) =>
    (b.purchased_at ?? '').localeCompare(a.purchased_at ?? ''),
  )
  return <Chart records={byDate} />
}

function Chart({ records, tall }: { records: ChartEntry[]; tall?: boolean }) {
  const reversed = [...records].reverse()
  const amounts = reversed.map((r) => r.displayAmount ?? r.originalAmount)
  const valid = amounts.filter((a): a is number => a !== null)

  const w = tall ? 200 : 60
  const h = tall ? 48 : 28
  const pad = tall ? 6 : 4

  // Position each point by when it happened, not by its index, so a gap of
  // months does not read the same as a gap of days.
  const times = reversed.map((r) =>
    r.purchased_at ? new Date(r.purchased_at).getTime() : null,
  )
  const validTimes = times.filter((t): t is number => t !== null)
  const minMs = validTimes.length > 0 ? Math.min(...validTimes) : 0
  const maxMs = validTimes.length > 0 ? Math.max(...validTimes) : 0
  const timeRange = maxMs - minMs
  const getX = (i: number): number => {
    const even =
      reversed.length === 1
        ? w / 2
        : pad + (i / (reversed.length - 1)) * (w - 2 * pad)
    if (timeRange === 0 || times[i] === null) return even
    return pad + ((times[i]! - minMs) / timeRange) * (w - 2 * pad)
  }

  if (valid.length < 2) return null

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1
  // A flat series sits in the middle rather than along the top edge.
  const getY = (amount: number) =>
    min === max ? h / 2 : pad + ((max - amount) / range) * (h - 2 * pad)

  const pts = amounts.map((a, i) => ({
    x: getX(i),
    y: a === null ? null : getY(a),
  }))

  const line = pts
    .map((pt, i) => {
      if (pt.y === null) return null
      const prev = i > 0 ? pts[i - 1] : null
      const cmd = prev === null || prev.y === null ? 'M' : 'L'
      return `${cmd}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    })
    .filter(Boolean)
    .join(' ')

  // Fill under each unbroken run of two or more points. A run of one has no
  // area, and filling across a gap would draw a price nobody recorded.
  const areas: string[] = []
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
        areas.push(
          `${runLine} L${run[run.length - 1].x.toFixed(1)},${h} L${run[0].x.toFixed(1)},${h} Z`,
        )
      }
      runStart = null
    }
  }

  return (
    <svg
      className={tall ? 'phb__chart' : 'phb__sparkline'}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {areas.map((d, i) => (
        <path key={i} d={d} className="phb__chart-area" />
      ))}
      {line && (
        <path
          d={line}
          className="phb__chart-line"
          strokeWidth={tall ? 2 : 1.5}
          fill="none"
        />
      )}
    </svg>
  )
}

function StoreDetail({ records }: { records: ChartEntry[] }) {
  // Records arrive newest first, so the first comparable one is the last price.
  const comparable = comparableRecords(records)
  const amounts = comparable.map((r) => r.displayAmount as number)
  const pricePer = comparable[0]?.displayPricePer ?? null

  const stats: [string, number | null][] = [
    ['Mínimo', amounts.length > 0 ? Math.min(...amounts) : null],
    ['Máximo', amounts.length > 0 ? Math.max(...amounts) : null],
    ['Último', amounts.length > 0 ? amounts[0] : null],
  ]

  return (
    <div className="phb__detail">
      <Chart records={records} tall />
      <div className="phb__stats">
        {stats.map(([label, value]) => (
          <div key={label} className="phb__stat">
            <strong className="t-mono">
              {value === null ? '—' : formatAmount(value, pricePer)}
            </strong>
            {label}
          </div>
        ))}
      </div>
      <ul className="phb__records">
        {records.map((r, i) => {
          const recorded = recordedAmount(r)
          const converted = convertedAmount(r)
          return (
            <li key={i} className="phb__record">
              <span className="phb__record-date t-mono">
                {r.purchased_at ? formatShortDate(r.purchased_at) : '—'}
              </span>
              {recorded === null ? (
                // A shop that wrote nothing down is part of the history, not a
                // hole to hide. It says so, in the ink of something secondary.
                <span className="phb__record-none">sin precio</span>
              ) : (
                <span className="phb__record-amount t-mono">
                  {recorded}
                  {converted && (
                    <span className="phb__record-converted">{converted}</span>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface Props {
  entries: ChartEntry[]
  onLogPrice?: () => void
}

/**
 * The price block of the item sheet: what each shop charges, and what it
 * charged before. A shop opens where it stands — the others are neither moved
 * nor faded, because rule 5 says dimming is a change of ink and there is
 * nothing here that needs saying more quietly.
 */
export function PriceHistoryBlock({ entries, onLogPrice }: Props) {
  const [openStore, setOpenStore] = useState<string | null | undefined>(
    undefined,
  )
  const groups = groupByStore(entries)

  return (
    <div className="phb">
      {groups.length === 0 && (
        <p className="phb__empty">Todavía no hay precios.</p>
      )}
      {groups.map((group) => {
        const isOpen = openStore === group.store
        const latest = group.records[0]
        const figure = latest.originalAmount ?? latest.displayAmount
        const key = group.store ?? '__none__'
        return (
          <div className="phb__store" key={key}>
            <button
              className="phb__store-row"
              onClick={() =>
                setOpenStore((prev) =>
                  prev === group.store ? undefined : group.store,
                )
              }
              aria-expanded={isOpen}
            >
              <span className="phb__store-info">
                <span className="phb__store-name">
                  {group.store ?? 'Sin tienda'}
                </span>
                <span className="phb__store-meta">
                  {group.records.length}{' '}
                  {group.records.length === 1 ? 'precio' : 'precios'}
                  {latest.purchased_at
                    ? ` · último ${formatShortDate(latest.purchased_at)}`
                    : ''}
                </span>
              </span>
              <Chart records={group.records} />
              <span className="phb__store-price t-mono">
                {figure === null
                  ? '—'
                  : formatAmount(
                      figure,
                      latest.originalAmount !== null
                        ? (latest.originalPricePer as 'KILOGRAM' | null)
                        : latest.displayPricePer,
                    )}
              </span>
              <ChevronDown
                className={`phb__chevron${isOpen ? ' phb__chevron--open' : ''}`}
                size={18}
                aria-hidden
              />
            </button>
            {isOpen && <StoreDetail records={group.records} />}
          </div>
        )
      })}
      {onLogPrice && (
        <button className="phb__log" onClick={onLogPrice}>
          Registrar un precio
          <Plus size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}
