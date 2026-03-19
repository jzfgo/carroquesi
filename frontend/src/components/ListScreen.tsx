import { useState, useCallback, useMemo } from 'react'
import './ListScreen.css'
import { ListHeader } from './ListHeader'
import { ProgressBar } from './ProgressBar'
import { ItemList } from './ItemList'
import { SmartInputBar } from './SmartInputBar'
import { Toast } from './Toast'
import { parseInput } from '../parseInput'
import { MOCK_ITEMS, MOCK_MEMBERS } from '../mockData'
import type { ListItem, Member, TagField, EditingTag } from '../types'

function buildMemberMap(members: Member[]): Map<string, Member> {
  const map = new Map<string, Member>()
  members.forEach(m => {
    map.set(m.id, m)
  })
  return map
}

export function ListScreen() {
  const [items, setItems] = useState<ListItem[]>(MOCK_ITEMS)
  const [inputValue, setInputValue] = useState('')
  const [suggestions] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  // editingTag kept in state but wired through ItemCard in a future task
  const [_editingTag, _setEditingTag] = useState<EditingTag | null>(null)

  const memberMap = useMemo(() => buildMemberMap(MOCK_MEMBERS), [])
  const parsed = useMemo(() => parseInput(inputValue), [inputValue])

  const handleTogglePurchased = useCallback((itemId: string) => {
    setItems(prev => {
      // Optimistic update
      return prev.map(i => i.id === itemId ? { ...i, purchased: !i.purchased } : i)
    })
    // In prototype phase: no API call. In API phase, PATCH here with rollback on error.
    // Example rollback:
    // api.patch(...).catch(() => {
    //   setItems(prev)
    //   setToast('Could not update item')
    // })
  }, [])

  const handleTagClick = useCallback((itemId: string, field: TagField) => {
    _setEditingTag({ itemId, field })
  }, [])

  const handleSubmit = useCallback(() => {
    if (!parsed.name.trim()) return
    const newItem: ListItem = {
      id: `item-${Date.now()}`,
      list_id: 'list-001',
      name: parsed.name,
      quantity: parsed.quantity,
      variety: parsed.variety,
      brand: parsed.brand,
      store: parsed.store,
      purchased: false,
      added_by: MOCK_MEMBERS[0].id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setItems(prev => [newItem, ...prev])
    setInputValue('')
    // In API phase: POST /lists/{id}/items with rollback on error.
  }, [parsed])

  const activeCount    = items.filter(i => !i.purchased).length
  const purchasedCount = items.filter(i =>  i.purchased).length

  // activeCount used in future features (e.g. badge display)
  void activeCount

  return (
    <div className="list-screen">
      <ListHeader title="Compras del Domingo" onMenuOpen={() => {}} />
      <ProgressBar purchased={purchasedCount} total={items.length} />
      <ItemList
        status="success"
        items={items}
        members={memberMap}
        onTogglePurchased={handleTogglePurchased}
        onTagClick={handleTagClick}
        onRetry={() => {}}
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
