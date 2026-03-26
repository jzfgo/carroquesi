import { useState, useEffect } from 'react'
import './TagEditSheet.css'
import type { ListItem, TagField } from '../types'
import { clientSideSuggestions } from '../lib/suggestions'

const TAG_META: Record<TagField, { emoji: string; label: string }> = {
  variety:  { emoji: '✨', label: 'Variedad' },
  brand:    { emoji: '🏷️', label: 'Marca' },
  store:    { emoji: '🏪', label: 'Tienda' },
  quantity: { emoji: '🔢', label: 'Cantidad' },
}

interface Props {
  item: ListItem
  field: TagField
  items: ListItem[]
  onSave: (value: string | null) => void
  onClose: () => void
}

export function TagEditSheet({ item, field, items, onSave, onClose }: Props) {
  const tagValues = { variety: item.variety, brand: item.brand, store: item.store, quantity: item.quantity } satisfies Record<TagField, string | null>
  const currentValue = tagValues[field]
  const [input, setInput] = useState(currentValue ?? '')
  const { emoji, label } = TAG_META[field]

  const suggestions = field !== 'quantity'
    ? clientSideSuggestions(items, field, input)
    : []

  function handleSave() {
    const trimmed = input.trim()
    onSave(trimmed.length > 0 ? trimmed : null)
  }

  useEffect(() => {
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onDocKeyDown)
    return () => document.removeEventListener('keydown', onDocKeyDown)
  }, [onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <>
    <div className="tag-edit-sheet__overlay" onClick={onClose} />
    <div className="tag-edit-sheet">
      <div className="tag-edit-sheet__header">
        <span>{emoji} {label}</span>
        <span className="tag-edit-sheet__item-name"> · {item.name}</span>
      </div>

      <div className="tag-edit-sheet__input-row">
        <input
          className="tag-edit-sheet__input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          aria-label={label}
        />
        <button className="tag-edit-sheet__save" onClick={handleSave} aria-label="Guardar">
          Guardar
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="tag-edit-sheet__suggestions">
          {suggestions.map(s => (
            <button key={s} className="tag-edit-sheet__suggestion" onClick={() => setInput(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {currentValue !== null && (
        <button
          className="tag-edit-sheet__remove"
          onClick={() => onSave(null)}
          aria-label={`Eliminar ${label}`}
        >
          Eliminar {label}
        </button>
      )}
    </div>
    </>
  )
}
