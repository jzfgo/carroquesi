import { Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import './SmartSearchPill.css'

interface Props {
  query: string
  onChange: (q: string) => void
  onClose: () => void
}

/**
 * The in-list search pill (handoff 21b): search takes over the title-area slot
 * as an accent-bordered sheet of paper. The same sigils as the input bar are
 * parsed downstream by `filterItems` (strictStore is on for search — `@tienda`
 * means "I mean this", so storeless items drop). Opening focuses the field so
 * the keyboard is up on the same tap that revealed it.
 */
export function SmartSearchPill({ query, onChange, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="search-pill" role="search">
      <Search className="search-pill__icon" size={15} aria-hidden />
      <input
        ref={inputRef}
        className="search-pill__input"
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="@tienda #marca nombre…"
        aria-label="Buscar en la lista"
      />
      <button
        type="button"
        className="search-pill__clear"
        onClick={onClose}
        aria-label="Cerrar búsqueda"
      >
        <X size={15} />
      </button>
    </div>
  )
}
