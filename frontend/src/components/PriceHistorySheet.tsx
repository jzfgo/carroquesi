import { useEffect, useState } from 'react'
import { getPriceHistory } from '../lib/api'
import type { ListItem, PriceHistoryResponse, StoreGroup } from '../types'
import './PriceHistorySheet.css'

type Scope = 'this_list' | 'my_lists' | 'all'

interface Props {
  item: ListItem
  listId: string
  getToken: () => Promise<string>
  onLogPrice: () => void
  onClose: () => void
}

function formatPrice(amount: number, pricePer: 'KILOGRAM' | null): string {
  return pricePer === 'KILOGRAM' ? `€${amount.toFixed(2)}/kg` : `€${amount.toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

function Sparkline({ records }: { records: StoreGroup['records'] }) {
  if (records.length < 2) {
    return (
      <svg className="phs__sparkline" viewBox="0 0 60 28">
        {records.length === 1 && <circle cx="30" cy="14" r="2" fill="#0a84ff" />}
      </svg>
    )
  }
  const prices = [...records].reverse().map(r => r.amount)
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1
  const w = 60, h = 28, pad = 4
  const pts = prices.map((p, i) => ({
    x: pad + (i / (prices.length - 1)) * (w - 2 * pad),
    y: pad + ((max - p) / range) * (h - 2 * pad),
  }))
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${h} L${pts[0].x.toFixed(1)},${h} Z`
  return (
    <svg className="phs__sparkline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={areaD} fill="rgba(10,132,255,0.15)" />
      <path d={pathD} stroke="#0a84ff" strokeWidth="1.5" fill="none" />
    </svg>
  )
}

export default function PriceHistorySheet({ item, listId, getToken, onLogPrice, onClose: _onClose }: Props) {
  const [scope, setScope] = useState<Scope>('this_list')
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null)
  const [expandedStore, setExpandedStore] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getPriceHistory(getToken, listId, item.id, scope).then(data => {
      if (!cancelled) setHistory(data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [scope, getToken, listId, item.id])

  const hasExpanded = expandedStore !== undefined

  function toggleStore(store: string | null) {
    setExpandedStore(prev => prev === store ? undefined : store)
  }

  return (
    <div className="phs">
      <div className="phs__handle" />
      <div className="phs__title">{item.name}</div>
      <div className="phs__scope">
        {(['this_list', 'my_lists', 'all'] as Scope[]).map(s => (
          <button key={s}
            className={`phs__scope-btn${scope === s ? ' phs__scope-btn--active' : ''}`}
            onClick={() => { setScope(s); setExpandedStore(undefined) }}>
            {s === 'this_list' ? 'Esta lista' : s === 'my_lists' ? 'Mis listas' : 'Todos'}
          </button>
        ))}
      </div>

      {history?.community_price != null && (
        <div className="phs__community">
          <span>🌍 Comunidad</span>
          <span className="phs__community-price">~{formatPrice(history.community_price, history.community_price_per)}</span>
          <span className="phs__community-info"
            title="Precio medio de la comunidad de Open Prices, filtrado a tiendas españolas cuando hay datos disponibles. Puede no reflejar los precios actuales.">ⓘ</span>
        </div>
      )}

      <div className="phs__content">
        {history?.groups.length === 0 && (
          <div className="phs__empty">No hay precios registrados.</div>
        )}
        {history?.groups.map(group => {
          const isExpanded = expandedStore === group.store
          const isDimmed = hasExpanded && !isExpanded
          const latest = group.records[0]
          const amounts = group.records.map(r => r.amount)
          const minAmt = Math.min(...amounts), maxAmt = Math.max(...amounts)

          return (
            <div key={group.store ?? '__none__'}
              className={`phs__store-row${isDimmed ? ' phs__store-row--dimmed' : ''}`}
              onClick={() => toggleStore(group.store)}>
              <div className="phs__store-summary">
                <div className="phs__store-info">
                  <div className="phs__store-name">{group.store ? `🏪 ${group.store}` : 'Sin tienda'}</div>
                  <div className="phs__store-meta">
                    {group.records.length} {group.records.length === 1 ? 'precio' : 'precios'} · último {formatDate(latest.recorded_at)}
                  </div>
                </div>
                <Sparkline records={group.records} />
                <div className="phs__store-price">{formatPrice(latest.amount, latest.price_per)}</div>
              </div>
              {isExpanded && (() => {
                const prices = [...group.records].reverse().map(r => r.amount)
                const min2 = Math.min(...prices), max2 = Math.max(...prices), range2 = max2 - min2 || 1
                const w = 200, h = 48, pad = 6
                const pts2 = prices.map((p, i) => ({
                  x: (pad + (i / (prices.length - 1)) * (w - 2 * pad)).toFixed(1),
                  y: (pad + ((max2 - p) / range2) * (h - 2 * pad)).toFixed(1),
                }))
                const pathD2 = pts2.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
                const areaD2 = `${pathD2} L${pts2[pts2.length - 1].x},${h} L${pts2[0].x},${h} Z`
                return (
                  <div className="phs__expand">
                    {prices.length >= 2 && (
                      <svg className="phs__expand-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                        <path d={areaD2} fill="rgba(10,132,255,0.15)" />
                        <path d={pathD2} stroke="#0a84ff" strokeWidth="2" fill="none" />
                      </svg>
                    )}
                    <div className="phs__expand-stats">
                      <div className="phs__stat"><strong>{formatPrice(latest.amount, latest.price_per)}</strong>Último</div>
                      <div className="phs__stat"><strong>{formatPrice(minAmt, latest.price_per)}</strong>Mínimo</div>
                      <div className="phs__stat"><strong>{formatPrice(maxAmt, latest.price_per)}</strong>Máximo</div>
                    </div>
                    <div className="phs__expand-records">
                      {group.records.map(r => (
                        <div key={r.id} className="phs__record-row">
                          <span>{formatDate(r.recorded_at)}</span>
                          <span className="phs__record-amount">{formatPrice(r.amount, r.price_per)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>

      <button className="phs__log-btn" onClick={onLogPrice}>+ Registrar precio</button>
    </div>
  )
}
