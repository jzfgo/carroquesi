import './ListCard.css'
import { ProgressBar } from './ProgressBar'
import type { ApiList } from '../types'

interface Props {
  list: ApiList
  onClick: () => void
}

export function ListCard({ list, onClick }: Props) {
  const { name, item_count, purchased_count } = list
  return (
    <button className="list-card" onClick={onClick}>
      <span className="list-card__name">{name}</span>
      <ProgressBar purchased={purchased_count} total={item_count} />
      {item_count > 0 && (
        <span className="list-card__subtitle">
          {purchased_count} de {item_count} comprados
        </span>
      )}
    </button>
  )
}
