import { useRef, useState } from 'react'
import './CreateListSheet.css'
import { Sheet, type SheetHandle } from './Sheet'

// Not crypto.randomUUID: it exists only in a secure context, and the app is
// also reviewed over plain http on the LAN.
function newCreateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

interface Props {
  /** The emoji the list arrives with — picked once when the sheet opens. */
  emoji: string
  /**
   * Resolves true when the list exists and the sheet can close, false to
   * keep the sheet open with the typed name. `createKey` stays the same
   * across retries of the same name.
   */
  onCreate: (name: string, emoji: string, createKey: string) => Promise<boolean>
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
  // One key per name: a retry after a failure may be a repeat of a create
  // that did land, so it must reuse the key. A new name is a new list.
  const createKey = useRef(newCreateKey())

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    let created = false
    try {
      created = await onCreate(trimmed, emoji, createKey.current)
    } catch {
      // Treated like a refusal: the typed name must survive.
    }
    if (created) sheetRef.current?.close()
    else setCreating(false)
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
          onChange={(e) => {
            setName(e.target.value)
            createKey.current = newCreateKey()
          }}
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
