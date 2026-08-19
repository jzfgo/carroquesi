import { ArrowDown, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatPrice } from '../lib/formatPrice'
import { isTripOpen } from '../lib/isTripOpen'
import type { CostSummary } from '../lib/itemCost'
import { storeKey } from '../lib/storeKey'
import type { DueSuggestion, ElsewhereMatch, ListItem } from '../types'
import { ItemCard } from './ItemCard'
import './ItemList.css'
import './paper.css'
import { SuggestionRow } from './SuggestionRow'

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
  totalItems?: number
  footer?: ReactNode
  /** The purchase stack (18a) — settled trips + proto-tickets, fetched by the
   *  Stack component and injected so this presentational list stays data-free.
   *  Renders below the footer, where the item-derived «Comprados» block was. */
  stack?: ReactNode
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
  /**
   * What the stack's own search read found: null while it is still answering
   * (or search is off), else its result count. The full no-results card only
   * paints over a settled zero — never over history results, never while the
   * other read is in flight.
   */
  stackHits?: number | null
  /** Habit reminders shown inline at the tail of a populated list (20b). */
  suggestions?: DueSuggestion[]
  /** Accept a suggestion — writes it onto the list with its avg quantity. */
  onSuggestionAdd?: (s: DueSuggestion) => void
  /** Dismiss a suggestion — «no este mes», records a TTL and drops it. */
  onSuggestionDismiss?: (s: DueSuggestion) => void
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
  totalItems,
  footer,
  stack,
  displayStore = (raw) => raw,
  onCloseTrip,
  searching = false,
  query = '',
  elsewhereMatch = null,
  onAddFromSearch,
  stackHits = null,
  suggestions = [],
  onSuggestionAdd,
  onSuggestionDismiss,
}: Props) {
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

  // The pending sheet (active + cart) alone. A search dead end keys off this,
  // not the whole list: settled records live in the stack below, so a term that
  // matches only history leaves the pending sheet blank and must still say so.
  const pendingEmpty = active.length === 0 && cart.length === 0

  // Inline "Sueles comprar" (20b): at most three, and never a line already on
  // this trip. A suggestion is derived from purchase history, so by definition
  // it sits in the settled records below — deduping against those would hide
  // nearly every real suggestion. We only guard against a collision with what
  // is already written for *this* trip: the pending list and the cart. The
  // server usually filters those too, but a name typed by hand in the meantime
  // could still collide.
  const onList = new Set(
    [...active, ...cart].map((i) => i.name.trim().toLowerCase()),
  )
  const shownSuggestions = suggestions
    .filter((s) => !onList.has(s.name.trim().toLowerCase()))
    .slice(0, 3)

  // Nothing pending matches the search. Whether this is a dead end depends on
  // the OTHER read: the stack searches the whole purchase history, and its
  // results render below this component's output. The full no-results card
  // (16c) is reserved for when both reads came back empty — over real history
  // results it would announce «nothing» above the proof there is something.
  // While the stack search is still answering (stackHits == null), or when it
  // found records, the results stand alone with nothing above them.
  if (searching && query.trim() !== '' && pendingEmpty) {
    if (stackHits !== 0) {
      return <div className="item-list">{stack}</div>
    }

    // No-results search (16c): a search that matched nothing anywhere. This
    // covers the sheet with a flat surface instead of drawing on paper — a
    // blank sheet would read as an empty list, and there is no list to show
    // mid-search. A search dead end must still offer the way out: adding what
    // you looked for.
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
        {stack}
      </div>
    )
  }

  // Blank sheet (16c): nothing pending and nothing in the cart, so the paper
  // stays — the blank sheet is the message, whether the list is brand new or
  // everything has settled into the stack below. Caveat is the house voice
  // (not a line someone wrote), one instruction with the bar's real format,
  // and an arrow at the input below. No mascot: it was earned on the
  // dashboard, and rule 9 keeps it to where nothing is behind — here the
  // board is.
  if (pendingEmpty) {
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
        {/* Even a brand-new list can record a shop it never tracked: the stack
            carries the always-present «Guardar un ticket» door. */}
        {stack}
      </div>
    )
  }

  // Group pending items under a header per target shop. Comparison goes by
  // storeKey() and the label through the registry's display name (the JAV-82
  // rule); an item with several shops files under its first one. Items with
  // no shop close the sheet under «Sin tienda» (20a) — a scanned add lands
  // there, and its place at the tail is what says it is new — unless nothing
  // has a shop, in which case a header would announce the obvious. Groups
  // keep the order of first appearance — the order the household wrote them
  // in.
  const activeByStore: {
    key: string
    label: string | null
    items: ListItem[]
  }[] = []
  const groupIndex = new Map<string, (typeof activeByStore)[number]>()
  let storelessGroup: (typeof activeByStore)[number] | null = null
  for (const item of active) {
    const raw = item.stores[0]
    const key = raw ? storeKey(raw) : ''
    let group = groupIndex.get(key)
    if (!group) {
      group = { key, label: raw ? displayStore(raw) : null, items: [] }
      groupIndex.set(key, group)
      if (key === '') {
        storelessGroup = group
      } else {
        activeByStore.push(group)
      }
    }
    group.items.push(item)
  }
  if (storelessGroup) {
    if (activeByStore.length > 0) storelessGroup.label = 'Sin tienda'
    activeByStore.push(storelessGroup)
  }

  return (
    <div className="item-list">
      {/* One solid sheet, perforated across the middle (30a). Above the tear,
          what's still to buy; below it the talón, where the cart lines sit
          under a printed rubric and the close-trip seal. The head never
          leaves: with everything in the cart it stays at zero, and its dashed
          underline folds into the perforation right below it — one cut, not
          two rules with nothing between them. */}
      <section className="paper paper--pending" aria-label="Por comprar">
        <p
          className={`paper__title${
            active.length === 0 ? ' paper__title--cut' : ''
          }`}
        >
          <span className="paper__title-text">Por comprar</span>
          <span className="paper__title-meta">
            {pendingCost && (
              <CostBadge cost={pendingCost} className="item-list__label-cost" />
            )}
            <span className="paper__title-count">
              {totalItems !== undefined && totalItems !== active.length
                ? `${active.length} de ${totalItems}`
                : `${active.length}`}
            </span>
          </span>
        </p>
        {active.length > 0 && (
          <>
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

            {/* "Sueles comprar" (20b): up to three habit reminders written in
                  muted ink under a dashed rule, at the very tail of the pending
                  list. A suggestion is a line the house hasn't written yet, so
                  it sits after everything it has. It never reaches the header
                  count, and nothing renders when there is nothing to suggest —
                  no empty rule announcing the absence. */}
            {shownSuggestions.length > 0 && (
              <div className="item-list__suggestions">
                <p className="item-list__suggestions-label">Sueles comprar</p>
                {shownSuggestions.map((s) => (
                  <SuggestionRow
                    key={s.name}
                    suggestion={s}
                    onAdd={(x) => onSuggestionAdd?.(x)}
                    onDismiss={(x) => onSuggestionDismiss?.(x)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {cart.length > 0 && (
          <div className="talon" role="group" aria-label="En el carro">
            <div className="perf" aria-hidden />
            {/* The rubric and the seal share one row: the count on the left,
                  the close-trip stamp right where a closed ticket shows its
                  total. The stamp opens the close-trip sheet (JAV-160). */}
            <div className="talon__head">
              <span className="talon__rubric">En el carro · {cart.length}</span>
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
      {footer}

      {/* The stack (18a): settled trips + proto-tickets, below the sheet — the
          per-trip successor to the old item-derived «Comprados» block. */}
      {stack}
    </div>
  )
}
