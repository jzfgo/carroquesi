import { Store } from 'lucide-react'
import { useState } from 'react'
import { storeKey } from '../lib/storeKey'
import { clientSideSuggestions } from '../lib/suggestions'
import type { ListItem } from '../types'
import { Sheet } from './Sheet'
import './StoreEditSheet.css'

interface Props {
  item: ListItem
  items: ListItem[]
  onSave: (stores: string[]) => void
  onClose: () => void
}

export function StoreEditSheet({ item, items, onSave, onClose }: Props) {
  const [input, setInput] = useState('')
  const currentStores = item.stores

  // Compare by key so a spelling variant of a store already on the item
  // is neither suggested nor added next to it.
  const currentKeys = new Set(currentStores.map(storeKey))
  const suggestions = clientSideSuggestions(items, 'stores', input).filter(
    (s) => !currentKeys.has(storeKey(s)),
  )

  function addStore(name: string) {
    const trimmed = name.trim()
    if (!trimmed || currentKeys.has(storeKey(trimmed))) return
    onSave([...currentStores, trimmed])
  }

  function removeStore(name: string) {
    onSave(currentStores.filter((s) => s !== name))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addStore(input)
    }
  }

  return (
    <Sheet className="store-edit-sheet" label="Tiendas" onClose={onClose}>
      <div className="store-edit-sheet__header">
        <span>
          <Store size={15} /> Tiendas
        </span>
        <span className="store-edit-sheet__item-name"> · {item.name}</span>
      </div>

      {currentStores.length > 0 && (
        <div className="store-edit-sheet__chips">
          {currentStores.map((store) => (
            <span key={store} className="store-edit-sheet__chip">
              {store}
              <button
                className="store-edit-sheet__chip-remove"
                onClick={() => removeStore(store)}
                aria-label={`Eliminar ${store}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="store-edit-sheet__input-row">
        <input
          className="store-edit-sheet__input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Añadir tienda…"
          autoFocus
          aria-label="Nueva tienda"
        />
        <button
          className="store-edit-sheet__add"
          onClick={() => addStore(input)}
          aria-label="Añadir tienda"
        >
          +
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="store-edit-sheet__suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              className="store-edit-sheet__suggestion"
              onClick={() => addStore(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
