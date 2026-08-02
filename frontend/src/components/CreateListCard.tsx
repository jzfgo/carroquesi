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
    if (isFirst) {
      // 16c first-run empty: the one empty state that earns the mascot —
      // flat surface (this is not a list yet), serif title, one sentence,
      // one button.
      return (
        <div className="create-list-empty">
          <Mascot size={104} />
          <h2 className="create-list-empty__title">Aún no tienes listas</h2>
          <p className="create-list-empty__lead">
            Empieza una y compártela en casa.
          </p>
          <button
            className="create-list-empty__cta"
            onClick={() => setExpanded(true)}
          >
            Crear la primera lista
          </button>
        </div>
      )
    }
    return (
      <button className="create-list-row" onClick={() => setExpanded(true)}>
        <span className="create-list-row__icon" aria-hidden>
          <Plus size={19} strokeWidth={2.2} />
        </span>
        <span className="create-list-row__label">Nueva lista</span>
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
    <div
      className={`create-list-input${isFirst ? ' create-list-input--alone' : ''}`}
    >
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
        className="create-list-input__submit"
        disabled={!name.trim() || creating}
        onClick={() => void handleSubmit()}
      >
        Crear lista
      </button>
      <button
        className="create-list-input__cancel"
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
