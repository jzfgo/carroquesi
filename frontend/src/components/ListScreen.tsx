import { useState, useEffect, useCallback, useMemo } from 'react'
import './ListScreen.css'
import { ListHeader } from './ListHeader'
import { ProgressBar } from './ProgressBar'
import { ItemList } from './ItemList'
import { SmartInputBar } from './SmartInputBar'
import { TagEditSheet } from './TagEditSheet'
import { Toast } from './Toast'
import { ListMembersSheet } from './ListMembersSheet'
import { parseInput } from '../parseInput'
import { useAuth } from '../contexts/AuthContext'
import { useListItems } from '../hooks/useListItems'
import { getSuggestions } from '../lib/api'
import type { EditingTag, TagField } from '../types'

interface Props {
  listId: string
  listName: string
  listOwnerId: string
  onBack?: () => void
}

export function ListScreen({ listId, listName, listOwnerId, onBack }: Props) {
  const { getToken, user } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [editingTag, setEditingTag] = useState<EditingTag | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const currentUserId = user!.id
  const isOwner = listOwnerId === currentUserId

  const parsed = useMemo(() => parseInput(inputValue), [inputValue])
  const { status, items, members, togglePurchased, addItem, updateTag, retry } =
    useListItems(listId, getToken, setToast)

  // Debounced suggestions — only when name has 2+ chars
  useEffect(() => {
    const q = parsed.name.trim()
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleTagClick = useCallback((itemId: string, field: TagField) => {
    setEditingTag({ itemId, field })
  }, [])

  const handleSubmit = useCallback(() => {
    if (!parsed.name.trim()) return
    void addItem(parsed)
    setInputValue('')
  }, [parsed, addItem])

  const purchasedCount = items.filter((i) => i.purchased).length

  return (
    <div className="list-screen">
      <ListHeader title={listName} onMenuOpen={() => setMenuOpen(true)} onBack={onBack} />
      <ProgressBar purchased={purchasedCount} total={items.length} />
      <ItemList
        status={status}
        items={items}
        members={members}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onRetry={retry}
      />
      {editingTag && (() => {
        const editedItem = items.find(i => i.id === editingTag.itemId)
        if (!editedItem) return null
        return (
          <TagEditSheet
            key={`${editingTag.itemId}-${editingTag.field}`}
            item={editedItem}
            field={editingTag.field}
            items={items}
            onSave={(value) => { void updateTag(editingTag.itemId, editingTag.field, value); setEditingTag(null) }}
            onClose={() => setEditingTag(null)}
          />
        )
      })()}
      {menuOpen && (
        <ListMembersSheet
          listId={listId}
          currentUserId={currentUserId}
          isOwner={isOwner}
          onClose={() => setMenuOpen(false)}
        />
      )}
      {!editingTag && !menuOpen && (
        <SmartInputBar
          value={inputValue}
          parsed={parsed}
          items={items}
          suggestions={suggestions}
          onChange={setInputValue}
          onSubmit={handleSubmit}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
