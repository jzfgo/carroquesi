import { X } from 'lucide-react'
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
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
        {isFirst && (
          <>
            <Mascot size={120} />
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>
              Aún no tienes listas
            </p>
          </>
        )}
        <button className="create-list-card" onClick={() => setExpanded(true)}>
          {isFirst ? 'Crea tu primera lista' : '+ Nueva lista'}
        </button>
      </div>
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
          if (e.key === 'Escape') { setExpanded(false); setName('') }
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
        onClick={() => { setExpanded(false); setName('') }}
        aria-label="Cancelar"
      >
        <X size={16} />
      </button>
    </div>
  )
}
