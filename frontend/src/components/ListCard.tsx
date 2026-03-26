import type { CSSProperties } from 'react'
import './ListCard.css'
import { ProgressBar } from './ProgressBar'
import type { ApiList } from '../types'

interface Props {
  list: ApiList
  onClick: () => void
  onMenuOpen: () => void
  dragHandleProps?: Record<string, unknown>
  style?: CSSProperties
  isDragging?: boolean
}

export function ListCard({ list, onClick, onMenuOpen, dragHandleProps, style, isDragging }: Props) {
  const { name, item_count, purchased_count } = list
  return (
    <div className={`list-card${isDragging ? ' list-card--dragging' : ''}`} style={style}>
      <span className="list-card__drag-handle" aria-hidden {...dragHandleProps}>⠿</span>
      <button
        className="list-card__tap-target"
        onClick={onClick}
        aria-label={name}
      >
        <span className="list-card__name">{name}</span>
        <ProgressBar purchased={purchased_count} total={item_count} />
        {item_count > 0 && (
          <span className="list-card__subtitle">
            {purchased_count} de {item_count} comprados
          </span>
        )}
      </button>
      <button
        className="list-card__menu-btn"
        onClick={onMenuOpen}
        aria-label="Opciones"
      >
        ⋯
      </button>
    </div>
  )
}
