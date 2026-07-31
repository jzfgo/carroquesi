import { ChevronRight, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { getPriceHistory } from '../lib/api'
import { formatPrice } from '../lib/formatPrice'
import { formatShortDate } from '../lib/formatShortDate'
import { itemTrail } from '../lib/itemTrail'
import { normalizeEntries, type ChartEntry } from '../lib/priceNormalization'
import type { ListItem, Member, TagField } from '../types'
import './ItemDetailSheet.css'
import { PriceHistoryBlock, PriceSparkline } from './PriceHistoryBlock'

type SubState = 'detail' | 'rename' | 'confirm-delete'

interface Props {
  item: ListItem
  listId: string
  getToken: () => Promise<string>
  members?: Map<string, Member>
  /** No signal. The rows that only *open* another sheet stay live — looking
   *  at a brand is a read — and the controls that write are drawn as
   *  unavailable. */
  isOffline?: boolean
  onRename: (newName: string) => void
  onDelete: () => void
  onClose: () => void
  onTagClick: (field: TagField | 'stores') => void
  onLogPrice: () => void
  onClone?: () => void
}

/** "Puleva · en Mercadona y Alcampo" — brand and shops, when there are any. */
function subtitle(item: ListItem): string | null {
  const shops =
    item.stores.length > 0
      ? `en ${new Intl.ListFormat('es-ES', { type: 'conjunction' }).format(item.stores)}`
      : null
  return [item.brand, shops].filter(Boolean).join(' · ') || null
}

export function ItemDetailSheet({
  item,
  listId,
  getToken,
  members,
  isOffline = false,
  onRename,
  onDelete,
  onClose,
  onTagClick,
  onLogPrice,
  onClone,
}: Props) {
  // The item already says whether it was bought. Taking it as a prop as well
  // would be one fact with two sources, free to disagree.
  const purchased = item.purchased
  const [subState, setSubState] = useState<SubState>('detail')
  const [renameValue, setRenameValue] = useState(item.name)
  const [entries, setEntries] = useState<ChartEntry[] | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  useEffect(() => {
    let cancelled = false
    // Everything you have paid, with no scope switch: which lists a price of
    // your own came from is not a question worth asking in a shop aisle.
    getPriceHistory(getToken, listId, item.id, 'my_lists')
      .then((data) => {
        if (!cancelled) setEntries(normalizeEntries(data.entries).entries)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [getToken, listId, item.id])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const addedBy = members?.get(item.added_by)?.displayName ?? null
  const trail = useMemo(
    () =>
      entries
        ? itemTrail({ addedBy, createdAt: item.created_at, entries })
        : [],
    [addedBy, item.created_at, entries],
  )

  const overlay = <div className="item-detail__overlay" onClick={onClose} />

  if (subState === 'rename') {
    const trimmed = renameValue.trim()
    return (
      <>
        {overlay}
        <div
          className="item-detail"
          role="dialog"
          aria-modal="true"
          aria-label="Renombrar producto"
          ref={sheetRef}
        >
          <div className="item-detail__handle" {...swipe} />
          <div className="item-detail__form">
            <label className="t-eyebrow" htmlFor="item-detail-rename">
              Nombre
            </label>
            <input
              id="item-detail-rename"
              className="item-detail__input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmed && !isOffline) {
                  onRename(trimmed)
                }
              }}
              autoFocus
            />
            <button
              className="item-detail__primary"
              onClick={() => onRename(trimmed)}
              disabled={!trimmed || isOffline}
            >
              Guardar
            </button>
            <button
              className="item-detail__quiet"
              onClick={() => setSubState('detail')}
            >
              Cancelar
            </button>
          </div>
        </div>
      </>
    )
  }

  if (subState === 'confirm-delete') {
    return (
      <>
        {overlay}
        <div
          className="item-detail"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar eliminación"
          ref={sheetRef}
        >
          <div className="item-detail__handle" {...swipe} />
          <div className="item-detail__form">
            <p className="item-detail__name">{item.name}</p>
            <p className="item-detail__warning">
              Esta acción no se puede deshacer.
            </p>
            <button
              className="item-detail__destructive"
              onClick={onDelete}
              disabled={isOffline}
            >
              Sí, eliminar
            </button>
            <button
              className="item-detail__quiet"
              onClick={() => setSubState('detail')}
            >
              Cancelar
            </button>
          </div>
        </div>
      </>
    )
  }

  const sub = subtitle(item)
  // A price in this app is always per unit or per weight, so the meta says
  // which — that is the thing a figure on its own does not tell you. The
  // quantity is not repeated here: it has its own row below (rule 3).
  // Every part of this line describes the price above it, the date included. An
  // item with no price has nothing for it to describe, and a date on its own
  // under «Todavía sin precio» reads as the day of a price nobody recorded.
  const lastPriceMeta =
    item.price == null
      ? ''
      : [
          item.price_per === 'KILOGRAM' ? 'el kilo' : 'la unidad',
          item.price_store,
          item.purchased_at ? formatShortDate(item.purchased_at) : null,
        ]
          .filter(Boolean)
          .join(' · ')

  // Purchased items are mostly read-only. The handoff never drew this case, so
  // the app's own rule decides it.
  const fields: { label: string; value: string; onClick?: () => void }[] = [
    {
      label: 'Nombre',
      value: item.name,
      onClick: purchased ? undefined : () => setSubState('rename'),
    },
    {
      label: 'Marca',
      value: item.brand ?? 'Sin marca',
      onClick: purchased ? undefined : () => onTagClick('brand'),
    },
    {
      label: 'Cantidad',
      value: item.quantity ?? 'Sin cantidad',
      onClick: purchased ? undefined : () => onTagClick('quantity'),
    },
    {
      label: 'Tiendas',
      value: item.stores.length > 0 ? item.stores.join(', ') : 'Cualquiera',
      onClick: purchased ? undefined : () => onTagClick('stores'),
    },
  ]

  return (
    <>
      {overlay}
      <div
        className="item-detail"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        ref={sheetRef}
      >
        <div className="item-detail__handle" {...swipe} />

        <header className="item-detail__header">
          <h2 className="item-detail__name">{item.name}</h2>
          {sub && <p className="item-detail__subtitle">{sub}</p>}
        </header>

        <div className="item-detail__scroll">
          <section className="item-detail__block">
            <h3 className="t-eyebrow item-detail__block-title">
              Último precio
            </h3>
            <div className="item-detail__last">
              <div className="item-detail__last-figure">
                {item.price != null ? (
                  <p className="item-detail__last-price t-price t-price--big">
                    {/* No /kg here: the line below already says el kilo. */}
                    {formatPrice(item.price)}
                  </p>
                ) : (
                  <p className="item-detail__no-price">Todavía sin precio</p>
                )}
                {lastPriceMeta && (
                  <p className="item-detail__last-meta">{lastPriceMeta}</p>
                )}
              </div>
              <PriceSparkline entries={entries ?? []} />
            </div>
            <PriceHistoryBlock
              entries={entries ?? []}
              onLogPrice={onLogPrice}
            />
          </section>

          <section className="item-detail__block">
            <h3 className="t-eyebrow item-detail__block-title">Producto</h3>
            <ul className="item-detail__fields">
              {fields.map(({ label, value, onClick }) => (
                <li key={label}>
                  {onClick ? (
                    <button className="item-detail__field" onClick={onClick}>
                      <span className="item-detail__field-label">{label}</span>
                      <span className="item-detail__field-value">{value}</span>
                      <ChevronRight
                        className="item-detail__field-chevron"
                        size={18}
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <div className="item-detail__field item-detail__field--static">
                      <span className="item-detail__field-label">{label}</span>
                      <span className="item-detail__field-value">{value}</span>
                    </div>
                  )}
                </li>
              ))}
              {item.ean && (
                // No chevron: the scanner is the one way an EAN gets set, and a
                // second one would be a second path to the same thing.
                <li>
                  <div className="item-detail__field item-detail__field--static">
                    <span className="item-detail__field-label">Código</span>
                    <span className="item-detail__field-value t-mono">
                      {item.ean}
                    </span>
                  </div>
                </li>
              )}
            </ul>
          </section>

          {trail.length > 0 && (
            <section className="item-detail__block">
              <h3 className="t-eyebrow item-detail__block-title">Rastro</h3>
              <p className="item-detail__trail">{trail.join(' ')}</p>
            </section>
          )}
        </div>

        <footer className="item-detail__footer">
          {/* Only for something already bought. An item still on the list has
              nothing to come back to. */}
          {purchased && onClone && (
            <button className="item-detail__primary" onClick={onClone}>
              <RotateCcw size={18} aria-hidden /> Volver a comprar
            </button>
          )}
          {!item.purchase_filed && (
            <button
              className="item-detail__quiet item-detail__quiet--danger"
              onClick={() => setSubState('confirm-delete')}
            >
              Eliminar producto
            </button>
          )}
        </footer>
      </div>
    </>
  )
}
