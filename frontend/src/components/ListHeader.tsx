import { Menu } from 'lucide-react'
import './ListHeader.css'

interface Props {
  title: string
  emoji: string | null
  onMenuOpen: () => void
  onBack?: () => void
}

export function ListHeader({ title, emoji, onMenuOpen, onBack }: Props) {
  return (
    <header className="list-header">
      {onBack ? (
        <button className="list-header__back" onClick={onBack} aria-label="Volver">
          <span aria-hidden>‹</span> Listas
        </button>
      ) : (
        <div className="list-header__back" aria-hidden />
      )}
      <h1 className="list-header__title">
        {emoji && <span className="list-header__emoji" aria-hidden>{emoji}</span>}
        {title}
      </h1>
      <button
        className="list-header__menu"
        onClick={onMenuOpen}
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>
    </header>
  )
}
