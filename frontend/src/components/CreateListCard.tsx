import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import './CreateListCard.css'
import { Mascot } from './Mascot'

interface Props {
  isFirst?: boolean
  onCreate: (name: string) => Promise<void>
}

export function CreateListCard({ isFirst, onCreate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  if (!expanded) {
    // First run has nothing behind it, so the mascot is allowed and the action
    // is centred under it. With lists already on screen this is instead the
    // last row of the panel, drawn like every other row.
    if (isFirst) {
      return (
        <div className="create-list-card--first">
          <Mascot size={120} />
          <p className="create-list-card__empty">Aún no tienes listas</p>
          <button
            className="create-list-card create-list-card--cta"
            onClick={() => setExpanded(true)}
          >
            Crea tu primera lista
          </button>
        </div>
      )
    }
    return (
      <button
        className="create-list-card create-list-card--row"
        onClick={() => setExpanded(true)}
      >
        <Plus size={19} strokeWidth={2.2} aria-hidden />
        Nueva lista
      </button>
    )
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await onCreate(name.trim())
      setName('')
      setExpanded(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="create-list-card create-list-card--expanded">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la lista"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit()
          if (e.key === 'Escape') {
            setExpanded(false)
            setName('')
          }
        }}
      />
      <button
        disabled={!name.trim() || creating}
        onClick={() => void handleSubmit()}
      >
        Crear lista
      </button>
      <button
        className="create-list-card--cancel"
        onClick={() => {
          setExpanded(false)
          setName('')
        }}
        aria-label="Cancelar"
      >
        <X size={16} />
      </button>
    </div>
  )
}
