import { ChevronRight, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getPriceHistory } from '../lib/api'
import { formatRowAmount } from '../lib/formatPrice'
import { formatChartDate, Sparkline } from '../lib/priceChart'
import { normalizeEntries } from '../lib/priceNormalization'
import { buildRastroSegments } from '../lib/rastro'
import type { ListItem, Member, PriceEntry, TagField } from '../types'
import './ItemFichaSheet.css'
import { PriceHistoryBlock } from './PriceHistoryBlock'
import { Sheet } from './Sheet'

type SubState = 'main' | 'rename' | 'confirm-delete'

interface Props {
  item: ListItem
  members: Map<string, Member>
  displayStore: (raw: string) => string
  getToken: () => Promise<string>
  listId: string
  purchased?: boolean
  onRename: (newName: string) => void
  onEditField: (field: TagField | 'stores') => void
  onDelete: () => void
  onClone: () => void
  /** Opens the price editor; present only for a closed-trip record. */
  onLogPrice?: () => void
  onClose: () => void
}

/** «Mercadona, Alcampo» → «Mercadona y Alcampo»; three or more use a comma. */
function joinStores(names: string[]): string {
  if (names.length <= 1) return names.join('')
  if (names.length === 2) return `${names[0]} y ${names[1]}`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

interface LatestPrice {
  amount: number
  pricePer: 'KILOGRAM' | null
  store: string | null
  purchasedAt: string | null
  quantity: string | null
}

function latestPrice(
  entries: PriceEntry[],
  item: ListItem,
): LatestPrice | null {
  const priced = entries
    .filter((e): e is PriceEntry & { amount: number } => e.amount !== null)
    .sort((a, b) => (b.purchased_at ?? '').localeCompare(a.purchased_at ?? ''))
  const top = priced[0]
  if (top) {
    return {
      amount: top.amount,
      pricePer: top.price_per,
      store: top.store,
      purchasedAt: top.purchased_at ?? null,
      quantity: top.quantity ?? item.quantity,
    }
  }
  if (item.price != null) {
    return {
      amount: item.price,
      pricePer: item.price_per,
      store: item.price_store ?? item.stores[0] ?? null,
      purchasedAt: item.purchased_at,
      quantity: item.quantity,
    }
  }
  return null
}

function LastPriceBlock({
  entries,
  item,
  displayStore,
}: {
  entries: PriceEntry[]
  item: ListItem
  displayStore: (raw: string) => string
}) {
  const latest = latestPrice(entries, item)
  if (!latest) return null

  // The headline is the unit price the household pays — per kilo for weighed
  // goods, per unit otherwise — not the line total of the last trip.
  const unitSuffix = latest.pricePer === 'KILOGRAM' ? '/kg' : '/ud'
  const sub = [
    latest.store ? displayStore(latest.store) : null,
    latest.purchasedAt ? formatChartDate(latest.purchasedAt) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const curve = normalizeEntries(entries).entries.sort((a, b) =>
    (b.purchased_at ?? '').localeCompare(a.purchased_at ?? ''),
  )

  return (
    <div className="ficha__last">
      <span className="ficha__last-figures">
        <span className="ficha__eyebrow">Último precio</span>
        <span className="ficha__last-amount">
          € {formatRowAmount(latest.amount)}
          <span className="ficha__last-unit">{unitSuffix}</span>
        </span>
        {sub && <span className="ficha__last-sub">{sub}</span>}
      </span>
      {curve.length > 0 && (
        <Sparkline
          records={curve}
          width={200}
          height={42}
          pad={6}
          strokeWidth={1.5}
          className="ficha__last-curve"
        />
      )}
    </div>
  )
}

function ProductField({
  label,
  value,
  mono,
  onEdit,
}: {
  label: string
  value: string
  mono?: boolean
  onEdit?: () => void
}) {
  const body = (
    <>
      <span className="ficha__field-label">{label}</span>
      <span
        className={
          mono
            ? 'ficha__field-value ficha__field-value--mono'
            : 'ficha__field-value'
        }
      >
        {value}
      </span>
      {onEdit && <ChevronRight size={14} className="ficha__field-chevron" />}
    </>
  )
  if (onEdit) {
    return (
      <button className="ficha__field ficha__field--tappable" onClick={onEdit}>
        {body}
      </button>
    )
  }
  return <div className="ficha__field">{body}</div>
}

/**
 * The product ficha: one sheet, four blocks — what it costs, where and at what
 * price, what it is, and where it came from — plus a footer to buy it again or
 * remove it. Field edits and the rename input reuse the same per-field editors
 * as everywhere else; the sub-states swap in place and a dismiss steps back to
 * the main view rather than closing.
 */
export function ItemFichaSheet({
  item,
  members,
  displayStore,
  getToken,
  listId,
  purchased,
  onRename,
  onEditField,
  onDelete,
  onClone,
  onLogPrice,
  onClose,
}: Props) {
  const [subState, setSubState] = useState<SubState>('main')
  const [renameValue, setRenameValue] = useState(item.name)
  const [entries, setEntries] = useState<PriceEntry[]>([])
  const trimmed = renameValue.trim()

  useEffect(() => {
    let cancelled = false
    getPriceHistory(getToken, listId, item.id, 'this_list')
      .then((data) => {
        if (!cancelled) setEntries(data.entries)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [getToken, listId, item.id])

  const label =
    subState === 'rename'
      ? 'Renombrar producto'
      : subState === 'confirm-delete'
        ? 'Confirmar eliminación'
        : item.name

  const storeNames = item.stores.map(displayStore)
  const subtitle = [
    item.brand,
    storeNames.length > 0 ? `en ${joinStores(storeNames)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const rastroSegments = buildRastroSegments(item, members, entries)

  return (
    <Sheet
      className="item-ficha-sheet"
      label={label}
      onClose={onClose}
      onDismiss={subState === 'main' ? undefined : () => setSubState('main')}
    >
      {subState === 'main' && (
        <div className="ficha">
          <div className="ficha__header">
            <div className="ficha__title">{item.name}</div>
            {subtitle && <div className="ficha__subtitle">{subtitle}</div>}
          </div>

          <LastPriceBlock
            entries={entries}
            item={item}
            displayStore={displayStore}
          />

          {entries.length > 0 && (
            <PriceHistoryBlock
              entries={entries}
              displayStore={displayStore}
              onLogPrice={onLogPrice}
            />
          )}

          <div className="ficha__section">
            <div className="ficha__eyebrow ficha__section-eyebrow">
              Producto
            </div>
            <ProductField
              label="Nombre"
              value={item.name}
              onEdit={!purchased ? () => setSubState('rename') : undefined}
            />
            <ProductField
              label="Marca"
              value={item.brand ?? '—'}
              onEdit={!purchased ? () => onEditField('brand') : undefined}
            />
            <ProductField
              label="Cantidad"
              value={item.quantity ?? '—'}
              onEdit={!purchased ? () => onEditField('quantity') : undefined}
            />
            <ProductField
              label="Tiendas"
              value={storeNames.length > 0 ? storeNames.join(', ') : '—'}
              onEdit={!purchased ? () => onEditField('stores') : undefined}
            />
            <ProductField label="Código" value={item.ean ?? '—'} mono />
          </div>

          {rastroSegments.length > 0 && (
            <div className="ficha__section">
              <div className="ficha__eyebrow ficha__section-eyebrow">
                Rastro
              </div>
              <p className="ficha__rastro">
                {rastroSegments.map((seg, i) =>
                  typeof seg === 'string' ? seg : <b key={i}>{seg.b}</b>,
                )}
              </p>
            </div>
          )}

          <div className="ficha__footer">
            <button className="ficha__rebuy" onClick={onClone}>
              <RotateCcw size={16} /> Volver a comprar
            </button>
            <button
              className="ficha__delete"
              onClick={() => setSubState('confirm-delete')}
            >
              Eliminar producto
            </button>
          </div>
        </div>
      )}

      {subState === 'rename' && (
        <div className="ficha ficha--sub">
          <div className="ficha__input-row">
            <input
              className="ficha__input"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && trimmed) onRename(trimmed)
              }}
              autoFocus
              aria-label="Nombre del producto"
            />
            <button
              className="ficha__save-btn"
              onClick={() => onRename(trimmed)}
              disabled={!trimmed}
              aria-label="Guardar"
            >
              Guardar
            </button>
          </div>
          <button
            className="ficha__cancel-link"
            onClick={() => setSubState('main')}
          >
            Cancelar
          </button>
        </div>
      )}

      {subState === 'confirm-delete' && (
        <div className="ficha ficha--sub">
          <p className="ficha__confirm-name">{item.name}</p>
          <p className="ficha__warning">Esta acción no se puede deshacer.</p>
          <button
            className="ficha__confirm-btn"
            onClick={onDelete}
            aria-label="Sí, eliminar"
          >
            Sí, eliminar
          </button>
          <button
            className="ficha__cancel-btn"
            onClick={() => setSubState('main')}
          >
            Cancelar
          </button>
        </div>
      )}
    </Sheet>
  )
}
