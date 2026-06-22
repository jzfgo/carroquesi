import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './FilterBar.css'

interface Props {
  stores: string[]
  query: string
  onChange: (q: string) => void
  onModeChange?: (mode: 'chips' | 'search') => void
}

export function FilterBar({ stores, query, onChange, onModeChange }: Props) {
  const [mode, setMode] = useState<'chips' | 'search'>('chips')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode === 'search') {
      const id = setTimeout(() => inputRef.current?.focus(), 320)
      return () => clearTimeout(id)
    }
  }, [mode])

  const activeChip = stores.find((s) => query === `@${s}`) ?? null

  return (
    <div
      className={`filter-bar${mode === 'search' ? ' filter-bar--search-active' : ''}`}
      role="group"
      aria-label="Filtrar"
    >
      <div
        className="filter-bar__chips"
        aria-hidden={mode === 'search'}
        inert={mode === 'search' ? true : undefined}
      >
        <button
          className="filter-bar__search-btn"
          onClick={() => {
            setMode('search')
            onChange('')
            onModeChange?.('search')
          }}
          aria-label="Buscar"
        >
          <Search size={16} />
        </button>
        {stores.length > 0 && (
          <>
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
          </>
        )}
      </div>
      <div
        className="filter-bar__search"
        aria-hidden={mode === 'chips'}
        inert={mode === 'chips' ? true : undefined}
      >
        <button
          className="filter-bar__close-btn"
          onClick={() => {
            setMode('chips')
            onChange('')
            onModeChange?.('chips')
          }}
          aria-label="Cerrar búsqueda"
        >
          <X size={16} />
        </button>
        {mode === 'search' && (
          <input
            ref={inputRef}
            className="filter-bar__input"
            type="text"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            placeholder="@tienda #marca nombre…"
            aria-label="Buscar productos"
          />
        )}
      </div>
    </div>
  )
}
