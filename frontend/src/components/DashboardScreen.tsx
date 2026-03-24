import { useState, useEffect, useCallback } from 'react'
import './DashboardScreen.css'
import { useAuth } from '../contexts/AuthContext'
import { getLists, createList } from '../lib/api'
import { ListCard } from './ListCard'
import { CreateListCard } from './CreateListCard'
import { ListScreen } from './ListScreen'
import type { ApiList } from '../types'

export function DashboardScreen() {
  const { user, getToken, signOut } = useAuth()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)

  const fetchLists = useCallback(async () => {
    setLists(null)
    setFetchError(false)
    try {
      const data = (await getLists(getToken)) as ApiList[]
      setLists(data)
    } catch {
      setFetchError(true)
    }
  }, [getToken])

  useEffect(() => {
    void fetchLists()
  }, [fetchLists])

  const handleCreate = useCallback(
    async (name: string) => {
      await createList(getToken, name)
      await fetchLists()
    },
    [getToken, fetchLists],
  )

  if (selectedListId) {
    return (
      <ListScreen
        listId={selectedListId}
        onBack={() => setSelectedListId(null)}
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
            onClick={() => setSelectedListId(list.id)}
          />
        ))}
        <CreateListCard isFirst={lists.length === 0} onCreate={handleCreate} />
      </main>
    </div>
  )
}
