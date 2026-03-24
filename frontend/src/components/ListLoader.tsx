import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getLists, createList } from '../lib/api'
import { ListScreen } from './ListScreen'

interface ApiList {
  id: string
  name: string
  owner_id: string
  created_at: string
  updated_at: string
}

export function ListLoader() {
  const { getToken } = useAuth()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [listName, setListName] = useState('')
  const [creating, setCreating] = useState(false)

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

  if (fetchError) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          gap: '1rem',
        }}
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          No se pudo cargar tu lista
        </p>
        <button onClick={() => void fetchLists()}>Reintentar</button>
      </div>
    )
  }

  if (lists === null) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-primary)',
            animation: 'spin 0.8s linear infinite',
            display: 'block',
          }}
        />
      </div>
    )
  }

  if (lists.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          gap: '1rem',
          padding: '2rem',
        }}
      >
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          Aún no tienes ninguna lista
        </p>
        <input
          value={listName}
          onChange={(e) => setListName(e.target.value)}
          placeholder="Nombre de la lista"
          style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--color-border)',
            fontSize: '1rem',
            width: '100%',
            maxWidth: 320,
          }}
        />
        <button
          onClick={async () => {
            if (!listName.trim()) return
            setCreating(true)
            await createList(getToken, listName.trim())
            await fetchLists()
            setCreating(false)
          }}
          disabled={creating || !listName.trim()}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.375rem',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          Crear lista
        </button>
      </div>
    )
  }

  return <ListScreen listId={lists[0].id} />
}
