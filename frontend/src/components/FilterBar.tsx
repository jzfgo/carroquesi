import { storeKey } from '../lib/storeKey'
import './FilterBar.css'

interface Props {
  stores: string[]
  query: string
  onChange: (q: string) => void
  /** True when this mount follows a closed search: the chips ease back in
      instead of snapping. Off on a plain screen load. */
  entering?: boolean
}

/**
 * The store-filter chips — their own row, no magnifier (search lives in the
 * header now, handoff 21b). A chip is "I'm here": tapping one filters to that
 * shop while storeless items still pass (chip mode → strictStore off, handled
 * by the caller). Comparison is by `storeKey` so a chip label and a typed
 * spelling of the same shop still match.
 */
export function FilterBar({ stores, query, onChange, entering }: Props) {
  if (stores.length === 0) return null

  const activeChip = query.startsWith('@')
    ? (stores.find((s) => storeKey(query.slice(1)) === storeKey(s)) ?? null)
    : null

  return (
    <div
      className={`filter-bar${entering ? ' filter-bar--enter' : ''}`}
      role="group"
      aria-label="Filtrar por tienda"
    >
      <div className="filter-bar__chips">
        <button
          className={`filter-bar__chip${activeChip === null ? ' filter-bar__chip--active' : ''}`}
          onClick={() => onChange('')}
          aria-pressed={activeChip === null}
        >
          Todas
        </button>
        {stores.map((store) => (
          <button
            key={store}
            className={`filter-bar__chip${activeChip === store ? ' filter-bar__chip--active' : ''}`}
            onClick={() => onChange(`@${store}`)}
            aria-pressed={activeChip === store}
          >
            {store}
          </button>
        ))}
      </div>
    </div>
  )
}
