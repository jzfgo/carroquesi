import { useRef, useState } from 'react'
import './CreateListSheet.css'
import { Sheet, type SheetHandle } from './Sheet'

interface Props {
  /** The emoji the list arrives with — picked once when the sheet opens. */
  emoji: string
  onCreate: (name: string, emoji: string) => Promise<void>
  onClose: () => void
}

// Nueva lista (handoff 21a): one field and nothing else. The emoji arrives
// set — it is chosen when the sheet opens and shown in the tile, so what the
// user sees is what gets created; it becomes editable later from the options
// sheet, once the list has a life.
export function CreateListSheet({ emoji, onCreate, onClose }: Props) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const sheetRef = useRef<SheetHandle>(null)

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      await onCreate(trimmed, emoji)
      sheetRef.current?.close()
    } catch {
      // Leave the sheet open so the typed name survives a failed create.
      setCreating(false)
    }
  }

  return (
    <Sheet
      ref={sheetRef}
      className="create-list-sheet"
      label="Nueva lista"
      onClose={onClose}
    >
      <p className="create-list-sheet__title">Nueva lista</p>
      <div className="create-list-sheet__identity">
        <span className="create-list-sheet__emoji-tile" aria-hidden>
          {emoji}
        </span>
        <input
          autoFocus
          className="create-list-sheet__name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit()
          }}
          placeholder="Nombre de la lista"
          aria-label="Nombre de la lista"
        />
      </div>
      <button
        type="button"
        className="create-list-sheet__submit"
        disabled={!name.trim() || creating}
        onClick={() => void handleSubmit()}
      >
        Crear lista
      </button>
    </Sheet>
  )
}
