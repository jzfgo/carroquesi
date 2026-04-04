import { useState, useEffect, useCallback, useRef } from 'react'
import './DashboardScreen.css'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { getLists, createList, updateList, deleteList } from '../lib/api'
import { SortableListCard } from './SortableListCard'
import { CreateListCard } from './CreateListCard'
import { ListScreen } from './ListScreen'
import { ListActionSheet } from './ListActionSheet'
import { InstallBanner } from './InstallBanner'
import { EmojiPickerSheet, CURATED_EMOJIS } from './EmojiPickerSheet'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { useLocation } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ApiList } from '../types'

function loadOrder(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(`list-order-${userId}`)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function saveOrder(userId: string, ids: string[]) {
  localStorage.setItem(`list-order-${userId}`, JSON.stringify(ids))
}

function applyOrder(lists: ApiList[], order: string[] | null): ApiList[] {
  if (!order) return lists
  const map = new Map(lists.map(l => [l.id, l]))
  const sorted = order.flatMap(id => (map.has(id) ? [map.get(id)!] : []))
  const rest = lists.filter(l => !order.includes(l.id))
  return [...sorted, ...rest]
}

function randomEmoji(): string {
  return CURATED_EMOJIS[Math.floor(Math.random() * CURATED_EMOJIS.length)]
}

export function DashboardScreen() {
  const { user, getToken, signOut } = useAuth()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [selectedList, setSelectedList] = useState<ApiList | null>(null)
  usePageTitle(selectedList?.name ?? undefined)
  const [activeList, setActiveList] = useState<ApiList | null>(null)
  const [emojiList, setEmojiList] = useState<ApiList | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const openListIdRef = useRef<string | null>(
    (location.state as { openListId?: string } | null)?.openListId ?? null
  )
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall()

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  const fetchLists = useCallback(async () => {
    setLists(null)
    setFetchError(false)
    try {
      const data = (await getLists(getToken)) as ApiList[]
      const ordered = applyOrder(data, loadOrder(user!.id))
      setLists(ordered)
      if (openListIdRef.current) {
        const list = ordered.find(l => l.id === openListIdRef.current)
        if (list) setSelectedList(list)
        openListIdRef.current = null
      }
    } catch {
      setFetchError(true)
    }
  }, [getToken, user])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLists(prev => {
      if (!prev) return prev
      const oldIndex = prev.findIndex(l => l.id === active.id)
      const newIndex = prev.findIndex(l => l.id === over.id)
      const next = arrayMove(prev, oldIndex, newIndex)
      saveOrder(user!.id, next.map(l => l.id))
      return next
    })
  }, [user])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLists()
  }, [fetchLists])

  const handleCreate = useCallback(
    async (name: string) => {
      await createList(getToken, { name, emoji: randomEmoji() })
      await fetchLists()
    },
    [getToken, fetchLists],
  )

  const handleRename = useCallback(
    async (list: ApiList, newName: string) => {
      let snapshot: ApiList[] | null = null
      setLists(prev => {
        snapshot = prev
        return prev ? prev.map(l => l.id === list.id ? { ...l, name: newName } : l) : prev
      })
      setActiveList(null)
      try {
        await updateList(getToken, list.id, { name: newName })
      } catch {
        setLists(snapshot)
        setToast('No se pudo renombrar la lista')
      }
    },
    [getToken],
  )

  const handleEmojiChange = useCallback(
    async (list: ApiList, emoji: string | null) => {
      let snapshot: ApiList[] | null = null
      setLists(prev => {
        snapshot = prev
        return prev ? prev.map(l => l.id === list.id ? { ...l, emoji } : l) : prev
      })
      setEmojiList(null)
      try {
        await updateList(getToken, list.id, { emoji })
      } catch {
        setLists(snapshot)
        setToast('No se pudo cambiar el emoji')
      }
    },
    [getToken],
  )

  const handleDelete = useCallback(
    async (list: ApiList) => {
      setActiveList(null)
      try {
        await deleteList(getToken, list.id)
        setLists(prev => prev ? prev.filter(l => l.id !== list.id) : prev)
      } catch {
        setToast('No se pudo eliminar la lista')
      }
    },
    [getToken],
  )

  if (selectedList) {
    return (
      <ListScreen
        listId={selectedList.id}
        listName={selectedList.name}
        listEmoji={selectedList.emoji}
        listOwnerId={selectedList.owner_id}
        onBack={() => setSelectedList(null)}
      />
    )
  }

  if (fetchError) {
    return (
      <div className="dashboard-screen dashboard-screen--centered">
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          No se pudieron cargar tus listas
        </p>
        <button className="dashboard-screen__retry" onClick={() => void fetchLists()}>
          Reintentar
        </button>
      </div>
    )
  }

  if (lists === null) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        className="dashboard-screen dashboard-screen--centered"
      >
        <span className="dashboard-screen__spinner" />
      </div>
    )
  }

  const showInstallEntry = (isInstallable || isIOS) && !isInstalled

  return (
    <div className="dashboard-screen">
      <header className="dashboard-screen__header">
        <h1 className="dashboard-screen__title">CarroQueSí</h1>
        <div className="dashboard-screen__avatar-wrapper" ref={menuRef}>
          <button
            className="dashboard-screen__avatar"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menú de usuario"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt={user.displayName} />
            ) : (
              <span>{user?.displayName?.[0] ?? '?'}</span>
            )}
          </button>
          {menuOpen && (
            <div className="dashboard-screen__avatar-menu" role="menu">
              {showInstallEntry && (
                <button
                  className="dashboard-screen__avatar-menu-item"
                  role="menuitem"
                  onClick={() => { void promptInstall(); setMenuOpen(false) }}
                >
                  Instalar app
                </button>
              )}
              <button
                className="dashboard-screen__avatar-menu-item"
                role="menuitem"
                onClick={() => { void signOut(); setMenuOpen(false) }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="dashboard-screen__lists">
        <InstallBanner
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          promptInstall={promptInstall}
        />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={lists.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {lists.map((list) => (
              <SortableListCard
                key={list.id}
                list={list}
                isOwner={list.owner_id === (user?.id ?? '')}
                onClick={() => { setSelectedList(list); setActiveList(null) }}
                onMenuOpen={() => { setActiveList(list) }}
                onEmojiTap={() => { setEmojiList(list) }}
              />
            ))}
          </SortableContext>
        </DndContext>
        <CreateListCard isFirst={lists.length === 0} onCreate={handleCreate} />
      </main>
      {activeList && (
        <ListActionSheet
          list={activeList}
          isOwner={activeList.owner_id === (user?.id ?? '')}
          onRename={newName => void handleRename(activeList, newName)}
          onDelete={() => void handleDelete(activeList)}
          onClose={() => setActiveList(null)}
        />
      )}
      {emojiList && (
        <EmojiPickerSheet
          current={emojiList.emoji}
          onSelect={emoji => void handleEmojiChange(emojiList, emoji)}
          onClose={() => setEmojiList(null)}
        />
      )}
      {toast && (
        <div className="dashboard-screen__toast" role="alert">{toast}</div>
      )}
    </div>
  )
}
