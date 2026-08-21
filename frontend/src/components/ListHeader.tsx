import { Menu, Search } from 'lucide-react'
import type { ReactNode } from 'react'
import './ListHeader.css'

interface Props {
  title: string
  emoji: string | null
  onMenuOpen: () => void
  onBack?: () => void
  onSearch?: () => void
  /** While searching, the pill occupies the title slot (21b, closed by 5c):
      the title and the action cluster give way; back stays as the way out. */
  searchSlot?: ReactNode
}

export function ListHeader({
  title,
  emoji,
  onMenuOpen,
  onBack,
  onSearch,
  searchSlot,
}: Props) {
  return (
    <header className="list-header">
      {onBack ? (
        <button
          className="list-header__back"
          onClick={onBack}
          aria-label="Volver"
        >
          <span aria-hidden>‹</span> Listas
        </button>
      ) : (
        <div className="list-header__back" aria-hidden />
      )}
      {searchSlot ?? (
        <>
          <h1 className="list-header__title">
            {emoji && (
              <span className="list-header__emoji" aria-hidden>
                {emoji}
              </span>
            )}
            {title}
          </h1>
          <div className="list-header__actions">
            {onSearch && (
              <button
                className="list-header__action"
                onClick={onSearch}
                aria-label="Buscar en la lista"
              >
                <Search size={20} />
              </button>
            )}
            <button
              className="list-header__menu"
              onClick={onMenuOpen}
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
          </div>
        </>
      )}
    </header>
  )
}
