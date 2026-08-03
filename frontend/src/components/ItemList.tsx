import { ArrowDown, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatPrice } from '../lib/formatPrice'
import { isTripOpen } from '../lib/isTripOpen'
import type { CostSummary } from '../lib/itemCost'
import { purchasedDateLabel } from '../lib/itemCost'
import { storeKey } from '../lib/storeKey'
import type { ElsewhereMatch, ListItem } from '../types'
import { ItemCard } from './ItemCard'
import './ItemList.css'
import './paper.css'

type Status = 'loading' | 'error' | 'success'

interface Props {
  status: Status
  items: ListItem[]
  onTogglePurchased: (itemId: string) => void
  /** Row tap — opens the item action sheet for that item. */
  onOpenActions: (itemId: string) => void
  onRetry: () => void
  onClone?: (itemId: string) => void
  pendingCost?: CostSummary | null
  purchasedCostByDate?: Map<string, CostSummary | null>
  totalItems?: number
  footer?: ReactNode
  /** Resolves a raw store string to the list's canonical display name. */
  displayStore?: (raw: string) => string
  /** Opens the close-trip sheet from the seal. Wired in JAV-160. */
  onCloseTrip?: () => void
  /** Search mode is on — tells a no-results search apart from an empty list. */
  searching?: boolean
  /** The raw search query, echoed in the no-results state (16c). */
  query?: string
  /** A same-name hit in another list, for the no-results third line (JAV-138). */
  elsewhereMatch?: ElsewhereMatch | null
  /** Adds the current query as a new item from the no-results state. */
  onAddFromSearch?: () => void
}

function CostBadge({
  cost,
  className,
}: {
  cost: CostSummary
  className: string
}) {
  return (
    <span className={className}>
      {cost.partial ? '≥ ' : ''}
      {formatPrice(cost.total)}
    </span>
  )
}

export function ItemList({
  status,
  items,
  onTogglePurchased,
  onOpenActions,
  onRetry,
  onClone,
  pendingCost,
  purchasedCostByDate,
  totalItems,
  footer,
  displayStore = (raw) => raw,
  onCloseTrip,
  searching = false,
  query = '',
  elsewhereMatch = null,
  onAddFromSearch,
}: Props) {
  const [purchasedCollapsed, setPurchasedCollapsed] = useState(false)

  if (status === 'loading') {
    return (
      <div className="item-list">
        <div className="paper paper--pending">
          {[0, 1, 2].map((i) => (
            <div key={i} className="item-list__skeleton" aria-hidden />
          ))}
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="item-list">
        <div className="paper paper--pending item-list__sheet-message">
          <p>No se pudieron cargar los productos</p>
          <button className="item-list__retry" onClick={onRetry}>
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const active = items
    .filter((i) => !i.purchased)
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
    )

  // The three states split here, not on the row: in-cart is a purchased item
  // whose trip is still open, and it lives on the counterfoil below the
  // die-cut; a closed trip settles it into a record (JAV-152, DESIGN.md 30a).
  // The cart reads top-down like a receipt being rung up — earliest first,
  // an optimistic write with no stamp yet trailing the confirmed lines.
  const cart = items
    .filter((i) => i.purchased && isTripOpen(i.purchase_ends_at))
    .sort((a, b) => {
      if (!a.purchased_at) return 1
      if (!b.purchased_at) return -1
      return a.purchased_at < b.purchased_at
        ? -1
        : a.purchased_at > b.purchased_at
          ? 1
          : 0
    })

  const bought = items
    .filter((i) => i.purchased && !isTripOpen(i.purchase_ends_at))
    .sort((a, b) => {
      if (!a.purchased_at) return 1
      if (!b.purchased_at) return -1
      return b.purchased_at < a.purchased_at
        ? -1
        : b.purchased_at > a.purchased_at
          ? 1
          : 0
    })

  const listEmpty =
    active.length === 0 && cart.length === 0 && bought.length === 0

  // No-results search (16c): a search that matched nothing. This covers the
  // sheet with a flat surface instead of drawing on paper — a blank sheet
  // would read as an empty list, and there is no list to show mid-search. A
  // search dead end must still offer the way out: adding what you looked for.
  if (searching && query.trim() !== '' && listEmpty) {
    const term = query.trim()
    const boughtOn = elsewhereMatch?.last_purchased_at
      ? new Date(elsewhereMatch.last_purchased_at + 'Z').toLocaleDateString(
          'es',
          { day: 'numeric', month: 'short' },
        )
      : null
    return (
      <div className="item-list">
        <div className="item-list__search-empty">
          <p className="item-list__search-none">
            Nada con <b>{term}</b> en esta lista.
          </p>
          <button
            type="button"
            className="item-list__search-add"
            onClick={onAddFromSearch}
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden /> Añadir «{term}»
          </button>
          {elsewhereMatch && (
            <p className="item-list__search-elsewhere">
              Sí está en <b>{elsewhereMatch.list_name}</b>
              {boughtOn ? `, comprado el ${boughtOn}` : ''}.
            </p>
          )}
        </div>
      </div>
    )
  }

  // Blank list (16c): genuinely empty, so the paper stays — the blank sheet is
  // the message. Caveat is the house voice (not a line someone wrote), one
  // instruction with the bar's real format, and an arrow at the input below.
  // No mascot: it was earned on the dashboard, and rule 9 keeps it to where
  // nothing is behind — here the board is.
  if (listEmpty) {
    return (
      <div className="item-list">
        <section className="paper paper--pending" aria-label="Por comprar">
          <p className="paper__title">
            <span className="paper__title-text">Por comprar</span>
            <span className="paper__title-meta">
              <span className="paper__title-count">0</span>
            </span>
          </p>
          <div className="item-list__blank">
            <p className="item-list__blank-lead">la hoja está en blanco</p>
            <p className="item-list__blank-hint">
              Escribe abajo lo primero: «2 kg tomates pera».
            </p>
            <ArrowDown
              className="item-list__blank-arrow"
              size={16}
              strokeWidth={1.8}
              aria-hidden
            />
          </div>
        </section>
      </div>
    )
  }

  // Group pending items under a header per target shop. Comparison goes by
  // storeKey() and the label through the registry's display name (the JAV-82
  // rule); an item with several shops files under its first one, and items
  // with no shop lead the sheet under no header. Groups keep the order of
  // first appearance — the order the household wrote them in.
  const activeByStore: {
    key: string
    label: string | null
    items: ListItem[]
  }[] = []
  const groupIndex = new Map<string, (typeof activeByStore)[number]>()
  for (const item of active) {
    const raw = item.stores[0]
    const key = raw ? storeKey(raw) : ''
    let group = groupIndex.get(key)
    if (!group) {
      group = { key, label: raw ? displayStore(raw) : null, items: [] }
      groupIndex.set(key, group)
      if (key === '') {
        activeByStore.unshift(group)
      } else {
        activeByStore.push(group)
      }
    }
    group.items.push(item)
  }

  // Group settled records by local date label, preserving backend order (newest first)
  const purchasedByDate: { label: string; items: ListItem[] }[] = []
  for (const item of bought) {
    const label = purchasedDateLabel(item.purchased_at)
    const last = purchasedByDate.at(-1)
    if (last && last.label === label) {
      last.items.push(item)
    } else {
      purchasedByDate.push({ label, items: [item] })
    }
  }

  return (
    <div className="item-list">
      {/* One solid sheet, perforated across the middle (30a). Above the tear,
          what's still to buy; below it the talón, where the cart lines sit
          under a printed rubric and the close-trip seal. When nothing is left
          to buy, the "Por comprar" head disappears (16c) and the talón stands
          alone as the day's ticket — the perforation goes with the head it
          tore from. */}
      {(active.length > 0 || cart.length > 0) && (
        <section
          className="paper paper--pending"
          // Standalone talón carries its name on the inner group already, so
          // the section stays unnamed to avoid a duplicate accessible name.
          aria-label={active.length > 0 ? 'Por comprar' : undefined}
        >
          {active.length > 0 && (
            <>
              <p className="paper__title">
                <span className="paper__title-text">Por comprar</span>
                <span className="paper__title-meta">
                  {pendingCost && (
                    <CostBadge
                      cost={pendingCost}
                      className="item-list__label-cost"
                    />
                  )}
                  <span className="paper__title-count">
                    {totalItems !== undefined && totalItems !== active.length
                      ? `${active.length} de ${totalItems}`
                      : `${active.length}`}
                  </span>
                </span>
              </p>
              {activeByStore.map((group) => (
                <div key={group.key}>
                  {group.label !== null && (
                    <p className="item-list__store-label">{group.label}</p>
                  )}
                  {group.items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onTogglePurchased={onTogglePurchased}
                      onOpenActions={onOpenActions}
                      onClone={onClone}
                    />
                  ))}
                </div>
              ))}
            </>
          )}

          {cart.length > 0 && (
            <div className="talon" role="group" aria-label="En el carro">
              {active.length > 0 && <div className="perf" aria-hidden />}
              {/* The rubric and the seal share one row: the count on the left,
                  the close-trip stamp right where a closed ticket shows its
                  total. The stamp opens the close-trip sheet (JAV-160). */}
              <div className="talon__head">
                <span className="talon__rubric">
                  En el carro · {cart.length}
                </span>
                <button
                  type="button"
                  className="talon__seal"
                  onClick={() => onCloseTrip?.()}
                >
                  <span className="stamp">Cerrar compra</span>
                </button>
              </div>
              {cart.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onTogglePurchased={onTogglePurchased}
                  onOpenActions={onOpenActions}
                  onClone={onClone}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* All bought (16c): the "Por comprar" sheet is gone, not sitting at
          zero. One hand-written line closes the trip — no confetti, no button;
          refilling is just writing in the bar below. Not during a search: a
          filter that happens to leave only a cart/settled match is a view, not
          a finished list, so the "done" flourish would misread. */}
      {active.length === 0 && !searching && (
        <p className="item-list__done">¡listo ✓!</p>
      )}
      {footer}

      {bought.length > 0 && (
        <>
          <button
            className="item-list__purchased-toggle"
            onClick={() => setPurchasedCollapsed((c) => !c)}
            aria-expanded={!purchasedCollapsed}
          >
            Comprados ({bought.length})
            <span
              className={`item-list__chevron${purchasedCollapsed ? ' item-list__chevron--collapsed' : ''}`}
              aria-hidden
            />
          </button>
          {!purchasedCollapsed && (
            <section className="paper paper--settled" aria-label="Comprados">
              {purchasedByDate.map(({ label, items: group }) => (
                <div key={label}>
                  <p className="item-list__date-label">
                    <span className="item-list__label-text">{label}</span>
                    {(() => {
                      const c = purchasedCostByDate?.get(label)
                      return (
                        c && (
                          <CostBadge
                            cost={c}
                            className="item-list__date-label-cost"
                          />
                        )
                      )
                    })()}
                  </p>
                  {group.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onTogglePurchased={onTogglePurchased}
                      onOpenActions={onOpenActions}
                      onClone={onClone}
                    />
                  ))}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
