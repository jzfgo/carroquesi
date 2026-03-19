import './ListHeader.css'

interface Props {
  title: string
  onMenuOpen: () => void
}

export function ListHeader({ title, onMenuOpen }: Props) {
  return (
    <header className="list-header">
      <button className="list-header__back">
        <span aria-hidden>‹</span> Lists
      </button>
      <h1 className="list-header__title">{title}</h1>
      <button
        className="list-header__menu"
        onClick={onMenuOpen}
        aria-label="Open menu"
      >
        <span /><span /><span />
      </button>
    </header>
  )
}
