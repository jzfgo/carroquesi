import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getList, ApiError } from '../lib/api'
import { ListScreen } from './ListScreen'
import type { ApiList } from '../types'

export function ListRoute() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const [list, setList] = useState<ApiList | null>(null)
  const [error, setError] = useState<'not_found' | 'forbidden' | 'unknown' | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getList(getToken, id)
      .then(data => {
        if (!cancelled) setList(data as ApiList)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) setError('not_found')
        else if (err instanceof ApiError && err.status === 403) setError('forbidden')
        else setError('unknown')
      })
    return () => { cancelled = true }
  }, [id, getToken])

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', gap: 12 }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {error === 'not_found' ? 'Lista no encontrada.' : error === 'forbidden' ? 'No tienes acceso a esta lista.' : 'Error al cargar la lista.'}
        </p>
        <button onClick={() => navigate('/')} style={{ color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
          Volver al inicio
        </button>
      </div>
    )
  }

  if (!list) return null

  return (
    <ListScreen
      listId={list.id}
      listName={list.name}
      listEmoji={list.emoji}
      listOwnerId={list.owner_id}
      onBack={() => navigate('/')}
    />
  )
}
