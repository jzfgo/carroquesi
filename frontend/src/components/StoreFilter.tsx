import './StoreFilter.css'

interface Props {
  stores: string[]
  active: string | null
  onSelect: (store: string | null) => void
}

export function StoreFilter({ stores, active, onSelect }: Props) {
  if (stores.length === 0) return null

  return (
    <div className="store-filter" role="group" aria-label="Filtrar por tienda">
      <button
        className={`store-filter__chip${active === null ? ' store-filter__chip--active' : ''}`}
        onClick={() => onSelect(null)}
        aria-pressed={active === null}
      >
        Todas
      </button>
      {stores.map(store => (
        <button
          key={store}
          className={`store-filter__chip${active === store ? ' store-filter__chip--active' : ''}`}
          onClick={() => onSelect(store)}
          aria-pressed={active === store}
        >
          {store}
        </button>
      ))}
    </div>
  )
}
