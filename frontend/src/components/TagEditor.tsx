import { Hash, Tag } from 'lucide-react'
import { useState } from 'react'
import { clientSideSuggestions } from '../lib/suggestions'
import type { ListItem, TagField } from '../types'
import './TagEditor.css'

const TAG_META: Record<TagField, { icon: React.ReactNode; label: string }> = {
  brand: { icon: <Tag size={14} />, label: 'Marca' },
  quantity: { icon: <Hash size={14} />, label: 'Cantidad' },
}

interface Props {
  item: ListItem
  field: TagField
  items: ListItem[]
  onSave: (value: string | null) => void
}

/** Edits a line's brand or quantity: a sub-state of the item sheet. */
export function TagEditor({ item, field, items, onSave }: Props) {
  const tagValues = {
    brand: item.brand,
    quantity: item.quantity,
  } satisfies Record<TagField, string | null>
  const currentValue = tagValues[field]
  const [input, setInput] = useState(currentValue ?? '')
  const { icon, label } = TAG_META[field]

  const suggestions =
    field !== 'quantity' ? clientSideSuggestions(items, field, input) : []

  function handleSave() {
    const trimmed = input.trim()
    onSave(trimmed.length > 0 ? trimmed : null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="tag-editor">
      <div className="tag-editor__header">
        <span>
          {icon} {label}
        </span>
        <span className="tag-editor__item-name"> · {item.name}</span>
      </div>

      <div className="tag-editor__input-row">
        <input
          className="tag-editor__input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          aria-label={label}
        />
        <button
          className="tag-editor__save"
          onClick={handleSave}
          aria-label="Guardar"
        >
          Guardar
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="tag-editor__suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              className="tag-editor__suggestion"
              onClick={() => setInput(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {currentValue !== null && (
        <button
          className="tag-editor__remove"
          onClick={() => onSave(null)}
          aria-label={`Eliminar ${label}`}
        >
          Eliminar {label}
        </button>
      )}
    </div>
  )
}
