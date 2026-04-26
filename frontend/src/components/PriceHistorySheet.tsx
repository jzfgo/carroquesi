import { useEffect, useState } from 'react'
import { getPriceHistory } from '../lib/api'
import { COMMUNITY_PRICE_TOOLTIP, formatPrice } from '../lib/formatPrice'
import { normalizeEntries, type ChartEntry } from '../lib/priceNormalization'
import type { ListItem, PriceHistoryResponse } from '../types'
import './PriceHistorySheet.css'

type Scope = 'this_list' | 'my_lists' | 'all'

interface Props {
  item: ListItem
  listId: string
  getToken: () => Promise<string>
  onLogPrice: () => void
  onClose: () => void
  readOnly?: boolean
}

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function Sparkline({ records }: { records: ChartEntry[] }) {
  const reversed = [...records].reverse()
  const validAmounts = reversed
    .map(r => r.displayAmount)
    .filter((a): a is number => a !== null)

  const w = 60, h = 28, pad = 4
  const getX = (i: number) =>
    reversed.length === 1 ? w / 2 : pad + (i / (reversed.length - 1)) * (w - 2 * pad)

  if (validAmounts.length < 2) {
    return (
      <svg className="phs__sparkline" viewBox={`0 0 ${w} ${h}`}>
        {reversed.map((r, i) =>
          r.displayAmount !== null ? (
            <circle key={i} cx={getX(i).toFixed(1)} cy={h / 2} r="2" fill="var(--color-primary, #0a84ff)" />
          ) : (
            <circle key={i} cx={getX(i).toFixed(1)} cy={h / 2} r="2" fill="var(--color-primary, #0a84ff)" opacity="0.5" />
          ),
        )}
      </svg>
    )
  }

  const min = Math.min(...validAmounts)
  const max = Math.max(...validAmounts)
  const range = max - min || 1
  // Center flat series (all values equal) rather than mapping them to the top edge
  const getY = (amount: number) =>
    min === max ? h / 2 : pad + ((max - amount) / range) * (h - 2 * pad)

  const pts = reversed.map((r, i) => {
    const x = getX(i)
    if (r.displayAmount === null) return { x, y: null }
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

  // Build an area fill path for each contiguous run of ≥2 valid points
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
          .map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y!.toFixed(1)}`)
          .join(' ')
        areaPaths.push(
          `${runLine} L${run[run.length - 1].x.toFixed(1)},${h} L${run[0].x.toFixed(1)},${h} Z`,
        )
      }
      runStart = null
    }
  }

  return (
    <svg className="phs__sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {areaPaths.map((d, i) => (
        <path key={i} d={d} fill="var(--color-primary-bg, rgba(10,132,255,0.15))" />
      ))}
      {pathD && (
        <path d={pathD} stroke="var(--color-primary, #0a84ff)" strokeWidth="1.5" fill="none" />
      )}
      {pts.map((pt, i) =>
        pt.y === null ? (
          <circle
            key={i}
            cx={pt.x.toFixed(1)}
            cy={h / 2}
            r="2"
            fill="var(--color-primary, #0a84ff)"
            opacity="0.5"
          />
        ) : null,
      )}
    </svg>
  )
}

function ExpandedChart({ records }: { records: ChartEntry[] }) {
  const reversed = [...records].reverse()
  const validAmounts = reversed
    .filter(r => r.displayAmount !== null)
    .map(r => r.displayAmount as number)

  const latestRecord = records[0]
  const displayPricePer = latestRecord?.displayPricePer ?? null

  const min = validAmounts.length > 0 ? Math.min(...validAmounts) : 0
  const max = validAmounts.length > 0 ? Math.max(...validAmounts) : 0
  const range = max - min || 1
  const w = 200, h = 48, pad = 6
  const getY = (amount: number) =>
    min === max ? h / 2 : pad + ((max - amount) / range) * (h - 2 * pad)

  const pts = reversed.map((r, i) => {
    const x = (pad + (i / (reversed.length - 1)) * (w - 2 * pad)).toFixed(1)
    if (r.displayAmount === null) return { x, y: null }
    return { x, y: getY(r.displayAmount).toFixed(1) }
  })

  const pathD = pts
    .map((pt, i) => {
      if (pt.y === null) return null
      const prev = i > 0 ? pts[i - 1] : null
      const cmd = prev === null || prev.y === null ? 'M' : 'L'
      return `${cmd}${pt.x},${pt.y}`
    })
    .filter(Boolean)
    .join(' ')

  // Build area fill paths for each contiguous run of ≥2 valid points
  const areaPaths: string[] = []
  let runStart: number | null = null
  for (let i = 0; i <= pts.length; i++) {
    const isValid = i < pts.length && pts[i].y !== null
    if (isValid && runStart === null) {
      runStart = i
    } else if (!isValid && runStart !== null) {
      const run = pts.slice(runStart, i)
      if (run.length >= 2) {
        const runLine = run.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
        areaPaths.push(`${runLine} L${run[run.length - 1].x},${h} L${run[0].x},${h} Z`)
      }
      runStart = null
    }
  }

  return (
    <div className="phs__expand">
      {validAmounts.length >= 2 && (
        <svg className="phs__expand-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          {areaPaths.map((d, i) => (
            <path key={i} d={d} fill="var(--color-primary-bg, rgba(10,132,255,0.15))" />
          ))}
          {pathD && (
            <path d={pathD} stroke="var(--color-primary, #0a84ff)" strokeWidth="2" fill="none" />
          )}
        </svg>
      )}
      <div className="phs__expand-stats">
        <div className="phs__stat">
          <strong>
            {latestRecord
              ? latestRecord.displayAmount !== null
                ? formatPrice(latestRecord.displayAmount, displayPricePer)
                : formatPrice(latestRecord.originalAmount, latestRecord.originalPricePer as 'KILOGRAM' | null)
              : '—'}
          </strong>
          Último
        </div>
        <div className="phs__stat">
          <strong>{validAmounts.length > 0 ? formatPrice(min, displayPricePer) : '—'}</strong>
          Mínimo
        </div>
        <div className="phs__stat">
          <strong>{validAmounts.length > 0 ? formatPrice(max, displayPricePer) : '—'}</strong>
          Máximo
        </div>
      </div>
      <div className="phs__expand-records">
        {records.map((r, i) => (
          <div key={i} className="phs__record-row">
            <span>{r.purchased_at ? formatDate(r.purchased_at) : '—'}</span>
            <span className="phs__record-amount">
              {r.displayAmount !== null
                ? formatPrice(r.displayAmount, r.displayPricePer)
                : formatPrice(r.originalAmount, r.originalPricePer as 'KILOGRAM' | null)}
              {r.displayAmount !== null &&
                r.originalPricePer !== (r.displayPricePer as string | null) && (
                  <span className="phs__record-original">
                    {formatPrice(r.originalAmount, r.originalPricePer as 'KILOGRAM' | null)}
                  </span>
                )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PriceHistorySheet({
  item,
  listId,
  getToken,
  onLogPrice,
  readOnly,
}: Props) {
  const [scope, setScope] = useState<Scope>('this_list')
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null)
  const [expandedStore, setExpandedStore] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getPriceHistory(getToken, listId, item.id, scope)
      .then(data => {
        if (!cancelled) setHistory(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [scope, getToken, listId, item.id])

  const hasExpanded = expandedStore !== undefined

  function toggleStore(store: string | null) {
    setExpandedStore(prev => (prev === store ? undefined : store))
  }

  const normalized = history ? normalizeEntries(history.entries) : null
  const groups = normalized ? groupByStore(normalized.entries) : null

  return (
    <div className="phs">
      <div className="phs__handle" />
      <div className="phs__title">{item.name}</div>
      <div className="phs__scope">
        {(['this_list', 'my_lists', 'all'] as Scope[]).map(s => (
          <button
            key={s}
            className={`phs__scope-btn${scope === s ? ' phs__scope-btn--active' : ''}`}
            onClick={() => {
              setScope(s)
              setExpandedStore(undefined)
            }}>
            {s === 'this_list' ? 'Esta lista' : s === 'my_lists' ? 'Mis listas' : 'Todos'}
          </button>
        ))}
      </div>

      {normalized?.isNormalized && (
        <div className="phs__normalized-badge">≈ €/kg</div>
      )}

      {history?.community_price != null && (
        <div className="phs__community">
          <span>🌍 Precio estimado</span>
          <span className="phs__community-price">
            ~{formatPrice(history.community_price, history.community_price_per)}
          </span>
          <button
            className="phs__community-info"
            title={COMMUNITY_PRICE_TOOLTIP}
            aria-label="Información sobre el precio de la comunidad">
            ⓘ
          </button>
        </div>
      )}

      <div className="phs__content">
        {groups?.length === 0 && (
          <div className="phs__empty">No hay precios registrados.</div>
        )}
        {groups?.map(group => {
          const isExpanded = expandedStore === group.store
          const isDimmed = hasExpanded && !isExpanded
          const latest = group.records[0]
          const groupHasGaps = group.records.some(r => r.displayAmount === null)

          return (
            <div
              key={group.store ?? '__none__'}
              className={`phs__store-row${isDimmed ? ' phs__store-row--dimmed' : ''}`}
              onClick={() => toggleStore(group.store)}>
              <div className="phs__store-summary">
                <div className="phs__store-info">
                  <div className="phs__store-name">
                    {group.store ? `🏪 ${group.store}` : 'Sin tienda'}
                    {groupHasGaps && (
                      <span className="phs__gap-warning" title="Algunos precios no pudieron normalizarse">
                        ⚠️
                      </span>
                    )}
                  </div>
                  <div className="phs__store-meta">
                    {group.records.length}{' '}
                    {group.records.length === 1 ? 'precio' : 'precios'}
                    {latest.purchased_at
                      ? ` · último ${formatDate(latest.purchased_at)}`
                      : ''}
                  </div>
                </div>
                <Sparkline records={group.records} />
                <div className="phs__store-price">
                  {latest.displayAmount !== null
                    ? formatPrice(latest.displayAmount, latest.displayPricePer)
                    : formatPrice(latest.originalAmount, latest.originalPricePer as 'KILOGRAM' | null)}
                </div>
              </div>
              {isExpanded && <ExpandedChart records={group.records} />}
            </div>
          )
        })}
      </div>

      {!readOnly && (
        <button className="phs__log-btn" onClick={onLogPrice}>
          {item.price != null ? '✏️ Actualizar precio' : '+ Registrar precio'}
        </button>
      )}
    </div>
  )
}
