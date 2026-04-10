import { useEffect, useState } from 'react'
import { getPriceHistory } from '../lib/api'
import type { ListItem, PriceEntry, PriceHistoryResponse } from '../types'
import './PriceHistorySheet.css'

type Scope = 'this_list' | 'my_lists' | 'all'

interface Props {
  item: ListItem
  listId: string
  getToken: () => Promise<string>
  onLogPrice: () => void
  onClose: () => void
}

function formatPrice(amount: number, pricePer: string | null): string {
  return pricePer === 'KILOGRAM' ? `€${amount.toFixed(2)}/kg` : `€${amount.toFixed(2)}`
}

function PriceRow({ entry }: { entry: PriceEntry }) {
  return (
    <div className="phs__store-row">
      <div className="phs__store-summary">
        <div className="phs__store-info">
          <div className="phs__store-name">{entry.store ? `🏪 ${entry.store}` : 'Sin tienda'}</div>
        </div>
        <div className="phs__store-price">{formatPrice(entry.amount, entry.price_per)}</div>
      </div>
    </div>
  )
}

export default function PriceHistorySheet({ item, listId, getToken, onLogPrice, onClose: _onClose }: Props) {
  const [scope, setScope] = useState<Scope>('this_list')
  const [history, setHistory] = useState<PriceHistoryResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    getPriceHistory(getToken, listId, item.id, scope).then(data => {
      if (!cancelled) setHistory(data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [scope, getToken, listId, item.id])

  return (
    <div className="phs">
      <div className="phs__handle" />
      <div className="phs__title">{item.name}</div>
      <div className="phs__scope">
        {(['this_list', 'my_lists', 'all'] as Scope[]).map(s => (
          <button key={s}
            className={`phs__scope-btn${scope === s ? ' phs__scope-btn--active' : ''}`}
            onClick={() => setScope(s)}>
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
        {history?.entries.length === 0 && (
          <div className="phs__empty">No hay precios registrados.</div>
        )}
        {history?.entries.map((entry, i) => (
          <PriceRow key={i} entry={entry} />
        ))}
      </div>

      <button className="phs__log-btn" onClick={onLogPrice}>+ Registrar precio</button>
    </div>
  )
}
