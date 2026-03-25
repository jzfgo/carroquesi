import './ListHeader.css'

interface Props {
  title: string
  onMenuOpen: () => void
  onBack?: () => void
}

export function ListHeader({ title, onMenuOpen, onBack }: Props) {
  return (
    <header className="list-header">
      <button className="list-header__back" onClick={onBack} aria-label="Volver">
        <span aria-hidden>‹</span> Listas
      </button>
      <h1 className="list-header__title">{title}</h1>
      <button
        className="list-header__menu"
        onClick={onMenuOpen}
        aria-label="Abrir menú"
      >
        <span /><span /><span />
      </button>
    </header>
  )
}
