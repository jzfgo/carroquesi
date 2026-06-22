import { Hash, Tag } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { clientSideSuggestions } from '../lib/suggestions'
import type { ListItem, TagField } from '../types'
import './TagEditSheet.css'

const TAG_META: Record<TagField, { icon: React.ReactNode; label: string }> = {
  brand: { icon: <Tag size={14} />, label: 'Marca' },
  quantity: { icon: <Hash size={14} />, label: 'Cantidad' },
}

interface Props {
  item: ListItem
  field: TagField
  items: ListItem[]
  onSave: (value: string | null) => void
  onClose: () => void
}

export function TagEditSheet({ item, field, items, onSave, onClose }: Props) {
  const tagValues = { brand: item.brand, quantity: item.quantity } satisfies Record<TagField, string | null>
  const currentValue = tagValues[field]
  const [input, setInput] = useState(currentValue ?? '')
  const { icon, label } = TAG_META[field]
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

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
      <div className="tag-edit-sheet" ref={sheetRef}>
        <div className="tag-edit-sheet__handle" {...swipe} />
        <div className="tag-edit-sheet__header">
          <span>{icon} {label}</span>
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
