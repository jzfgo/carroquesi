import { useEffect, useRef, useState } from 'react'
import './FilterBar.css'

interface Props {
  stores: string[]
  query: string
  onChange: (q: string) => void
}

export function FilterBar({ stores, query, onChange }: Props) {
  const [mode, setMode] = useState<'chips' | 'search'>('chips')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'search') {
      const id = setTimeout(() => inputRef.current?.focus(), 320)
      return () => clearTimeout(id)
    }
  }, [mode])

  if (stores.length === 0) return null

  const activeChip = stores.find(s => query === `@${s}`) ?? null

  return (
    <div
      className={`filter-bar${mode === 'search' ? ' filter-bar--search-active' : ''}`}
      role="group"
      aria-label="Filtrar"
    >
      <div className="filter-bar__chips">
        <button
          className="filter-bar__search-btn"
          onClick={() => { setMode('search'); onChange('') }}
          aria-label="Buscar"
        >
          🔍
        </button>
        <button
          className={`filter-bar__chip${activeChip === null ? ' filter-bar__chip--active' : ''}`}
          onClick={() => onChange('')}
          aria-pressed={activeChip === null}
        >
          Todas
        </button>
        {stores.map(store => (
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
      <div className="filter-bar__search">
        <button
          className="filter-bar__close-btn"
          onClick={() => { setMode('chips'); onChange('') }}
          aria-label="Cerrar búsqueda"
        >
          ✕
        </button>
        {mode === 'search' && (
          <input
            ref={inputRef}
            className="filter-bar__input"
            type="text"
            value={query}
            onChange={e => onChange(e.target.value)}
            placeholder="@tienda #marca nombre…"
            aria-label="Buscar productos"
          />
        )}
      </div>
    </div>
  )
}
