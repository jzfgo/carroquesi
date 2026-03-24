import { useState } from 'react'
import './CreateListCard.css'

interface Props {
  isFirst?: boolean
  onCreate: (name: string) => Promise<void>
}

export function CreateListCard({ isFirst, onCreate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  if (!expanded) {
    return (
      <button className="create-list-card" onClick={() => setExpanded(true)}>
        {isFirst ? 'Crea tu primera lista' : '+ Nueva lista'}
      </button>
    )
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setCreating(true)
    await onCreate(name.trim())
    setName('')
    setExpanded(false)
    setCreating(false)
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
          if (e.key === 'Escape') { setExpanded(false); setName('') }
        }}
      />
      <button
        disabled={!name.trim() || creating}
        onClick={() => void handleSubmit()}
      >
        Crear lista
      </button>
    </div>
  )
}
