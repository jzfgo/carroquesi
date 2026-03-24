import { useState, useEffect, useCallback, useMemo } from 'react'
import './ListScreen.css'
import { ListHeader } from './ListHeader'
import { ProgressBar } from './ProgressBar'
import { ItemList } from './ItemList'
import { SmartInputBar } from './SmartInputBar'
import { Toast } from './Toast'
import { parseInput } from '../parseInput'
import { useAuth } from '../contexts/AuthContext'
import { useListItems } from '../hooks/useListItems'
import { getSuggestions } from '../lib/api'
import type { TagField } from '../types'

interface Props {
  listId: string
  onBack?: () => void
}

export function ListScreen({ listId, onBack }: Props) {
  const { getToken } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const parsed = useMemo(() => parseInput(inputValue), [inputValue])
  const { status, items, members, togglePurchased, addItem, retry } =
    useListItems(listId, getToken, setToast)

  // Debounced suggestions — only when name has 2+ chars
  useEffect(() => {
    const q = parsed.name.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const data = (await getSuggestions(getToken, q)) as string[]
        setSuggestions(data)
      } catch {
        // suggestion errors are non-critical
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [parsed.name, getToken])

  const handleTogglePurchased = useCallback(
    (itemId: string) => {
      void togglePurchased(itemId)
    },
    [togglePurchased],
  )

  const handleTagClick = useCallback((_itemId: string, _field: TagField) => {
    // tag editing wired in a future task
  }, [])

  const handleSubmit = useCallback(() => {
    if (!parsed.name.trim()) return
    void addItem(parsed)
    setInputValue('')
  }, [parsed, addItem])

  const purchasedCount = items.filter((i) => i.purchased).length

  return (
    <div className="list-screen">
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Volver"
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.25rem',
            color: 'var(--color-text-secondary)',
            zIndex: 10,
          }}
        >
          ←
        </button>
      )}
      <ListHeader title="Mi lista" onMenuOpen={() => {}} />
      <ProgressBar purchased={purchasedCount} total={items.length} />
      <ItemList
        status={status}
        items={items}
        members={members}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onRetry={retry}
      />
      <SmartInputBar
        value={inputValue}
        parsed={parsed}
        items={items}
        suggestions={suggestions}
        onChange={setInputValue}
        onSubmit={handleSubmit}
      />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
