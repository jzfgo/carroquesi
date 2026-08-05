import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { formatRowAmount } from '../lib/formatPrice'
import { formatChartDate, priceStats, Sparkline } from '../lib/priceChart'
import { normalizeEntries, type ChartEntry } from '../lib/priceNormalization'
import { storeKey } from '../lib/storeKey'
import type { PriceEntry } from '../types'

interface Props {
  entries: PriceEntry[]
  /** Resolves a raw store string to the list's canonical display name. */
  displayStore: (raw: string) => string
  /** When present, a "Registrar un precio" row opens the price editor. */
  onLogPrice?: () => void
}

type DisplayRecord =
  | { kind: 'priced'; entry: ChartEntry; at: string | null }
  | { kind: 'sin'; at: string | null }

interface StoreGroup {
  key: string
  store: string | null
  priced: ChartEntry[]
  records: DisplayRecord[]
  latestAt: string | null
}

function recordAt(record: DisplayRecord): string | null {
  return record.at
}

/**
 * Groups a product's price history by store — spelling variants share one
 * group via the store key, labelled with the registry's display name. A store
 * keeps both its priced records (for the curve and the min/max/last figures)
 * and every record including the price-less ones, because a purchase that left
 * no price is history worth showing, not a gap to hide.
 */
function groupByStore(
  entries: PriceEntry[],
  displayStore: (raw: string) => string,
): StoreGroup[] {
  const normalized = normalizeEntries(entries)
  const map = new Map<string, StoreGroup>()

  const ensure = (store: string | null): StoreGroup => {
    const key = store ? storeKey(store) : '__none__'
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        store: store ? displayStore(store) : null,
        priced: [],
        records: [],
        latestAt: null,
      }
      map.set(key, group)
    }
    return group
  }

  for (const entry of normalized.entries) {
    const group = ensure(entry.store)
    group.priced.push(entry)
    group.records.push({ kind: 'priced', entry, at: entry.purchased_at })
  }
  for (const entry of entries) {
    if (entry.amount !== null) continue
    const group = ensure(entry.store)
    group.records.push({ kind: 'sin', at: entry.purchased_at ?? null })
  }

  const byDateDesc = (a: string | null, b: string | null) => {
    if (!a && !b) return 0
    if (!a) return 1
    if (!b) return -1
    return b.localeCompare(a)
  }

  for (const group of map.values()) {
    group.priced.sort((a, b) => byDateDesc(a.purchased_at, b.purchased_at))
    group.records.sort((a, b) => byDateDesc(recordAt(a), recordAt(b)))
    group.latestAt = group.records[0] ? recordAt(group.records[0]) : null
  }

  return [...map.values()].sort((a, b) => byDateDesc(a.latestAt, b.latestAt))
}

function bareAmount(entry: ChartEntry): string {
  return formatRowAmount(entry.displayAmount ?? entry.originalAmount)
}

function ExpandedStore({ group }: { group: StoreGroup }) {
  const { min, max, latest } = priceStats(group.priced)
  const pricedForCurve = group.priced.filter((r) => r.displayAmount !== null)

  return (
    <div className="phb__expand">
      {pricedForCurve.length >= 2 && (
        <Sparkline
          records={group.priced}
          width={200}
          height={48}
          pad={6}
          strokeWidth={2}
          className="phb__curve"
        />
      )}
      {group.priced.length > 0 && (
        <div className="phb__figures">
          <span className="phb__figure">
            <span className="phb__figure-value">
              {min !== null ? formatRowAmount(min) : '—'}
            </span>
            <span className="phb__figure-label">Mínimo</span>
          </span>
          <span className="phb__figure">
            <span className="phb__figure-value">
              {max !== null ? formatRowAmount(max) : '—'}
            </span>
            <span className="phb__figure-label">Máximo</span>
          </span>
          <span className="phb__figure">
            <span className="phb__figure-value">
              {latest ? bareAmount(latest) : '—'}
            </span>
            <span className="phb__figure-label">Último</span>
          </span>
        </div>
      )}
      {group.records.map((record, i) => {
        const date = recordAt(record)
        return (
          <div key={i} className="phb__record">
            <span
              className={
                record.kind === 'sin'
                  ? 'phb__record-date phb__record-date--muted'
                  : 'phb__record-date'
              }
            >
              {date ? formatChartDate(date) : '—'}
            </span>
            {record.kind === 'sin' ? (
              <span className="phb__record-sin">sin precio</span>
            ) : (
              <span className="phb__record-amount">
                <span className="phb__record-figure">
                  {formatRowAmount(record.entry.originalAmount)}
                </span>
                {record.entry.displayAmount !== null &&
                  record.entry.originalPricePer !==
                    (record.entry.displayPricePer as string | null) && (
                    <span className="phb__record-approx">
                      ≈ {formatRowAmount(record.entry.displayAmount)}/kg
                    </span>
                  )}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Per-store price history that expands in place. Tapping a store opens its
 * curve, figures, and records beneath it; the other stores stay exactly where
 * they are and keep their full ink — no dimming, because dimming is a change of
 * ink, not a drop in opacity, and here nothing needs to recede.
 */
export function PriceHistoryBlock({
  entries,
  displayStore,
  onLogPrice,
}: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const groups = groupByStore(entries, displayStore)

  return (
    <div className="phb">
      {groups.map((group) => {
        const isExpanded = expandedKey === group.key
        const latest = group.priced[0]
        return (
          <div key={group.key} className="phb__store">
            <button
              className="phb__store-row"
              onClick={() =>
                setExpandedKey((prev) =>
                  prev === group.key ? null : group.key,
                )
              }
              aria-expanded={isExpanded}
            >
              <span className="phb__store-info">
                <span className="phb__store-name">
                  {group.store ?? 'Sin tienda'}
                </span>
                <span className="phb__store-meta">
                  {group.priced.length > 0
                    ? `${group.priced.length} ${group.priced.length === 1 ? 'precio' : 'precios'}`
                    : 'sin precio'}
                  {group.latestAt
                    ? ` · último ${formatChartDate(group.latestAt)}`
                    : ''}
                </span>
              </span>
              <span className="phb__store-price">
                {latest ? bareAmount(latest) : '—'}
              </span>
              {isExpanded ? (
                <ChevronUp size={14} className="phb__chevron" />
              ) : (
                <ChevronDown size={14} className="phb__chevron" />
              )}
            </button>
            {isExpanded && <ExpandedStore group={group} />}
          </div>
        )
      })}
      {onLogPrice && (
        <button className="phb__log-row" onClick={onLogPrice}>
          <span>Registrar un precio</span>
          <Plus size={16} />
        </button>
      )}
    </div>
  )
}
