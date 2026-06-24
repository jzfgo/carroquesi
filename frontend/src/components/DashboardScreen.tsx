import type { DragEndEvent } from '@dnd-kit/core'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePWAInstall } from '../hooks/usePWAInstall'
import type { FeedbackPayload } from '../lib/api'
import {
  createList,
  deleteList,
  getLists,
  submitFeedback,
  updateList,
} from '../lib/api'
import { CURATED_EMOJIS } from '../lib/curatedEmojis'
import type { ApiList } from '../types'
import { CreateListCard } from './CreateListCard'
import './DashboardScreen.css'
import { EmojiPickerSheet } from './EmojiPickerSheet'
import { FeedbackSheet } from './FeedbackSheet'
import { InstallBanner } from './InstallBanner'
import { ListActionSheet } from './ListActionSheet'
import { SortableListCard } from './SortableListCard'
import { Toast } from './Toast'
import { Wordmark } from './Wordmark'

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
  const map = new Map(lists.map((l) => [l.id, l]))
  const sorted = order.flatMap((id) => (map.has(id) ? [map.get(id)!] : []))
  const rest = lists.filter((l) => !order.includes(l.id))
  return [...sorted, ...rest]
}

function loadDashboardCache(userId: string): ApiList[] | null {
  try {
    const raw = localStorage.getItem(`cqs_dashboard_cache_${userId}`)
    return raw ? (JSON.parse(raw) as ApiList[]) : null
  } catch {
    return null
  }
}

function saveDashboardCache(userId: string, lists: ApiList[]) {
  try {
    localStorage.setItem(`cqs_dashboard_cache_${userId}`, JSON.stringify(lists))
  } catch {
    /* storage unavailable */
  }
}

function randomEmoji(): string {
  return CURATED_EMOJIS[Math.floor(Math.random() * CURATED_EMOJIS.length)]
}

export function DashboardScreen() {
  const { user, getToken, signOut } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  usePageTitle(undefined)
  const [activeList, setActiveList] = useState<ApiList | null>(null)
  const [emojiList, setEmojiList] = useState<ApiList | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  const fetchLists = useCallback(
    async (silent = false) => {
      const cached = loadDashboardCache(user!.id)
      if (cached) {
        const ordered = applyOrder(cached, loadOrder(user!.id))
        setLists(ordered)
      } else if (!silent) {
        setLists(null)
        setFetchError(false)
      }
      try {
        const data = (await getLists(getToken)) as ApiList[]
        const ordered = applyOrder(data, loadOrder(user!.id))
        setLists(ordered)
        saveDashboardCache(user!.id, data)
      } catch {
        if (!cached && !silent) setFetchError(true)
      }
    },
    [getToken, user],
  )

  const handleFeedbackSubmit = useCallback(
    async (payload: FeedbackPayload) => {
      if (!navigator.onLine) {
        setToast('No se pudo enviar el feedback')
        return
      }
      setFeedbackSubmitting(true)
      try {
        await submitFeedback(getToken, payload)
        setFeedbackOpen(false)
        setToast('Feedback enviado')
      } catch {
        setToast('No se pudo enviar el feedback')
      } finally {
        setFeedbackSubmitting(false)
      }
    },
    [getToken],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      setLists((prev) => {
        if (!prev) return prev
        const oldIndex = prev.findIndex((l) => l.id === active.id)
        const newIndex = prev.findIndex((l) => l.id === over.id)
        const next = arrayMove(prev, oldIndex, newIndex)
        saveOrder(
          user!.id,
          next.map((l) => l.id),
        )
        return next
      })
    },
    [user],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: shows cached data synchronously while fresh fetch is in flight
    void fetchLists()
  }, [fetchLists])

  const handleCreate = useCallback(
    async (name: string) => {
      if (!navigator.onLine) {
        setToast('No disponible sin conexión')
        return
      }
      await createList(getToken, { name, emoji: randomEmoji() })
      await fetchLists()
    },
    [getToken, fetchLists],
  )

  const handleRename = useCallback(
    async (list: ApiList, newName: string) => {
      if (!navigator.onLine) {
        setToast('No disponible sin conexión')
        return
      }
      let snapshot: ApiList[] | null = null
      setLists((prev) => {
        snapshot = prev
        return prev
          ? prev.map((l) => (l.id === list.id ? { ...l, name: newName } : l))
          : prev
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
      setLists((prev) => {
        snapshot = prev
        return prev
          ? prev.map((l) => (l.id === list.id ? { ...l, emoji } : l))
          : prev
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
      if (!navigator.onLine) {
        setToast('No disponible sin conexión')
        return
      }
      setActiveList(null)
      try {
        await deleteList(getToken, list.id)
        setLists((prev) => (prev ? prev.filter((l) => l.id !== list.id) : prev))
      } catch {
        setToast('No se pudo eliminar la lista')
      }
    },
    [getToken],
  )

  if (fetchError) {
    return (
      <div className="dashboard-screen dashboard-screen--centered">
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          No se pudieron cargar tus listas
        </p>
        <button
          className="dashboard-screen__retry"
          onClick={() => void fetchLists()}
        >
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
        <h1 className="dashboard-screen__title">
          <Wordmark size={26} />
        </h1>
        <div className="dashboard-screen__avatar-wrapper" ref={menuRef}>
          <button
            className="dashboard-screen__avatar"
            onClick={() => setMenuOpen((o) => !o)}
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
                  onClick={() => {
                    void promptInstall()
                    setMenuOpen(false)
                  }}
                >
                  Instalar app
                </button>
              )}
              <button
                className="dashboard-screen__avatar-menu-item"
                role="menuitem"
                onClick={() => {
                  setFeedbackOpen(true)
                  setMenuOpen(false)
                }}
              >
                Enviar feedback
              </button>
              <button
                className="dashboard-screen__avatar-menu-item"
                role="menuitem"
                onClick={() => {
                  void signOut()
                  setMenuOpen(false)
                }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>
      {isOffline && (
        <div className="offline-banner" role="status">
          Sin conexión
        </div>
      )}
      <main className="dashboard-screen__lists">
        <InstallBanner
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          promptInstall={promptInstall}
        />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={lists.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            {lists.map((list) => (
              <SortableListCard
                key={list.id}
                list={list}
                isOwner={list.owner_id === (user?.id ?? '')}
                onClick={() => {
                  navigate(`/lists/${list.id}`)
                  setActiveList(null)
                }}
                onMenuOpen={() => {
                  setActiveList(list)
                }}
                onEmojiTap={() => {
                  setEmojiList(list)
                }}
              />
            ))}
          </SortableContext>
        </DndContext>
        <CreateListCard isFirst={lists.length === 0} onCreate={handleCreate} />
      </main>
      {activeList && (
        <ListActionSheet
          listId={activeList.id}
          listName={activeList.name}
          currentUserId={user?.id ?? ''}
          isOwner={activeList.owner_id === (user?.id ?? '')}
          onRename={(newName) => void handleRename(activeList, newName)}
          onDelete={() => void handleDelete(activeList)}
          onClose={() => setActiveList(null)}
        />
      )}
      {emojiList && (
        <EmojiPickerSheet
          current={emojiList.emoji}
          onSelect={(emoji) => void handleEmojiChange(emojiList, emoji)}
          onClose={() => setEmojiList(null)}
        />
      )}
      {feedbackOpen && (
        <FeedbackSheet
          defaultEmail={user?.email}
          isSubmitting={feedbackSubmitting}
          onSubmit={(payload) => void handleFeedbackSubmit(payload)}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
