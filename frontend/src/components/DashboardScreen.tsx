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
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnline } from '../hooks/useOnline'
import { usePageTitle } from '../hooks/usePageTitle'
import type { FeedbackPayload } from '../lib/api'
import {
  createList,
  deleteList,
  getLists,
  setDefaultList,
  submitFeedback,
  updateList,
} from '../lib/api'
import { CURATED_EMOJIS } from '../lib/curatedEmojis'
import type { ApiList } from '../types'
import { CreateListCard } from './CreateListCard'
import './DashboardScreen.css'
import { EmojiPickerSheet } from './EmojiPickerSheet'
import { FeedbackSheet } from './FeedbackSheet'
import { ListActionSheet } from './ListActionSheet'
import { SettingsSheet } from './SettingsSheet'
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
  const { user, getToken } = useAuth()
  const navigate = useNavigate()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const isOffline = !useOnline()
  usePageTitle(undefined)
  const [activeList, setActiveList] = useState<ApiList | null>(null)
  const [emojiList, setEmojiList] = useState<ApiList | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  const defaultList = lists?.find((l) => l.is_default) ?? null

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

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
      if (isOffline) {
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
    [getToken, isOffline],
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
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
      await createList(getToken, { name, emoji: randomEmoji() })
      await fetchLists()
    },
    [getToken, fetchLists, isOffline],
  )

  const handleRename = useCallback(
    async (list: ApiList, newName: string) => {
      if (isOffline) {
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
    [getToken, isOffline],
  )

  const handleEmojiChange = useCallback(
    async (list: ApiList, emoji: string | null) => {
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
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
    [getToken, isOffline],
  )

  const handleSetDefault = useCallback(
    async (list: ApiList) => {
      if (isOffline) {
        setToast('No disponible sin conexión')
        return
      }
      let snapshot: ApiList[] | null = null
      setLists((prev) => {
        snapshot = prev
        // Per-user, single default: flag the target, clear every other list.
        return prev
          ? prev.map((l) => ({ ...l, is_default: l.id === list.id }))
          : prev
      })
      setActiveList(null)
      try {
        await setDefaultList(getToken, list.id)
      } catch {
        setLists(snapshot)
        setToast('No se pudo marcar como predeterminada')
      }
    },
    [getToken, isOffline],
  )

  const handleDelete = useCallback(
    async (list: ApiList) => {
      if (isOffline) {
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
    [getToken, isOffline],
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

  return (
    <div className="dashboard-screen">
      <header className="dashboard-screen__header">
        <h1 className="dashboard-screen__title">
          <Wordmark size={26} />
        </h1>
        <button
          className="dashboard-screen__avatar"
          onClick={() => setSettingsOpen(true)}
          aria-label="Ajustes"
          aria-haspopup="dialog"
        >
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user.displayName} />
          ) : (
            <span>{user?.displayName?.[0] ?? '?'}</span>
          )}
        </button>
      </header>
      <main className="dashboard-screen__lists">
        {lists.length === 0 ? (
          <div className="dashboard-screen__empty">
            <CreateListCard isFirst onCreate={handleCreate} />
          </div>
        ) : (
          <section className="dashboard-screen__panel">
            <div className="dashboard-screen__eyebrow">
              <h2 className="dashboard-screen__eyebrow-label">Tus listas</h2>
              <span className="dashboard-screen__eyebrow-count">
                {lists.length}
              </span>
            </div>
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
                    currentUserId={user?.id ?? ''}
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
            <CreateListCard onCreate={handleCreate} />
          </section>
        )}
      </main>
      {activeList && (
        <ListActionSheet
          listId={activeList.id}
          listName={activeList.name}
          currentUserId={user?.id ?? ''}
          ownerId={activeList.owner_id}
          isDefault={activeList.is_default}
          onRename={(newName) => void handleRename(activeList, newName)}
          onDelete={() => void handleDelete(activeList)}
          onSetDefault={() => void handleSetDefault(activeList)}
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
      {settingsOpen && (
        <SettingsSheet
          defaultListName={defaultList?.name ?? null}
          onFeedback={() => {
            // One sheet at a time: settings hands over to the feedback sheet.
            setSettingsOpen(false)
            setFeedbackOpen(true)
          }}
          onToast={setToast}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
