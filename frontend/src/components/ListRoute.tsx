import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getList, ApiError } from '../lib/api'
import { usePageTitle } from '../hooks/usePageTitle'
import { ListScreen } from './ListScreen'
import type { ApiList } from '../types'

export function ListRoute() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { getToken } = useAuth()
  // Capture once at mount; clear state so back/forward doesn't re-trigger
  const [autoOpenReceiptScan] = useState(
    !!(location.state as { openReceiptScan?: boolean } | null)?.openReceiptScan
  )
  useEffect(() => {
    if (autoOpenReceiptScan) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [list, setList] = useState<ApiList | null>(null)
  const [error, setError] = useState<'not_found' | 'forbidden' | 'unknown' | null>(null)
  usePageTitle(list?.name ?? undefined)

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

  if (!list) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-primary)',
          animation: 'spin 0.8s linear infinite',
          display: 'block',
        }} />
      </div>
    )
  }

  return (
    <ListScreen
      listId={list.id}
      listName={list.name}
      listEmoji={list.emoji}
      listOwnerId={list.owner_id}
      autoOpenReceiptScan={autoOpenReceiptScan}
      onBack={() => navigate('/')}
    />
  )
}
