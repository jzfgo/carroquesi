import { useState, useEffect, useCallback, useRef } from 'react'
import './DashboardScreen.css'
import { useAuth } from '../contexts/AuthContext'
import { getLists, createList, renameList, deleteList } from '../lib/api'
import { ListCard } from './ListCard'
import { CreateListCard } from './CreateListCard'
import { ListScreen } from './ListScreen'
import { ListActionSheet } from './ListActionSheet'
import { useLocation } from 'react-router-dom'
import type { ApiList } from '../types'

export function DashboardScreen() {
  const { user, getToken, signOut } = useAuth()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [selectedList, setSelectedList] = useState<ApiList | null>(null)
  const [activeList, setActiveList] = useState<ApiList | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const location = useLocation()
  const openListIdRef = useRef<string | null>(
    (location.state as { openListId?: string } | null)?.openListId ?? null
  )

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  const fetchLists = useCallback(async () => {
    setLists(null)
    setFetchError(false)
    try {
      const data = (await getLists(getToken)) as ApiList[]
      setLists(data)
      if (openListIdRef.current) {
        const list = data.find(l => l.id === openListIdRef.current)
        if (list) setSelectedList(list)
        openListIdRef.current = null
      }
    } catch {
      setFetchError(true)
    }
  }, [getToken])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLists()
  }, [fetchLists])

  const handleCreate = useCallback(
    async (name: string) => {
      await createList(getToken, name)
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
        await renameList(getToken, list.id, newName)
      } catch {
        setLists(snapshot)
        setToast('No se pudo renombrar la lista')
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
        <h1 className="dashboard-screen__title">CarroQueSí</h1>
        <button
          className="dashboard-screen__avatar"
          onClick={() => void signOut()}
          aria-label="Cerrar sesión"
        >
          {user?.photoUrl ? (
            <img src={user.photoUrl} alt={user.displayName} />
          ) : (
            <span>{user?.displayName?.[0] ?? '?'}</span>
          )}
        </button>
      </header>
      <main className="dashboard-screen__lists">
        {lists.map((list) => (
          <ListCard
            key={list.id}
            list={list}
            onClick={() => { setSelectedList(list); setActiveList(null) }}
            onMenuOpen={() => { setActiveList(list) }}
          />
        ))}
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
      {toast && (
        <div className="dashboard-screen__toast" role="alert">{toast}</div>
      )}
    </div>
  )
}
