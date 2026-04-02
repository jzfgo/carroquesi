import { useState, useEffect, useCallback, useRef } from 'react'
import './ListMembersSheet.css'
import { Toast } from './Toast'
import { useAuth } from '../contexts/AuthContext'
import { getListMembers, removeMember, createOpenInvite, ApiError } from '../lib/api'

export interface BackendMember {
  id: string
  user_id: string
  list_id: string
  display_name: string
  photo_url: string | null
  created_at: string
}

interface Props {
  listId: string
  currentUserId: string
  isOwner: boolean
  onClose: () => void
}

type LoadState = 'loading' | 'error' | 'ready'

const MAX_MEMBERS = 5

export function ListMembersSheet({ listId, currentUserId, isOwner, onClose }: Props) {
  const { getToken } = useAuth()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [members, setMembers] = useState<BackendMember[]>([])
  const [inviteLimitReached, setInviteLimitReached] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoadState('loading')
    try {
      const data = (await getListMembers(getToken, listId)) as BackendMember[]
      setMembers(data)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [getToken, listId])

  useEffect(() => {
    void (async () => {
      setLoadState('loading')
      try {
        const data = (await getListMembers(getToken, listId)) as BackendMember[]
        setMembers(data)
        setLoadState('ready')
      } catch {
        setLoadState('error')
      }
    })()
  }, [getToken, listId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    function handleClickOutside(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  async function handleRemove(userId: string) {
    const snapshot = members
    setMembers(prev => prev.filter(m => m.user_id !== userId))
    try {
      await removeMember(getToken, listId, userId)
    } catch {
      setMembers(snapshot)
      setToast('No se pudo eliminar el miembro')
    }
  }

  async function handleCopyInvite() {
    setInviteLimitReached(false)
    setFallbackUrl(null)
    try {
      const data = (await createOpenInvite(getToken, listId)) as { id: string }
      const url = `${window.location.origin}/i/${data.id}`
      try {
        await navigator.clipboard.writeText(url)
        setToast('Enlace copiado')
      } catch {
        setFallbackUrl(url)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setInviteLimitReached(true)
      }
    }
  }

  const listFull = members.length >= MAX_MEMBERS

  return (
    <>
      <div className="list-members-sheet__overlay" onClick={onClose}></div>
      <div
        className="list-members-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Miembros"
        ref={sheetRef}
      >
        <div className="list-members-sheet__handle" />

      {loadState === 'loading' && (
        <span
          className="list-members-sheet__spinner"
          role="status"
          aria-label="Cargando"
        />
      )}

      {loadState === 'error' && (
        <div className="list-members-sheet__error">
          <span>No se pudieron cargar los miembros</span>
          <button
            className="list-members-sheet__retry-btn"
            onClick={() => void load()}
          >
            Reintentar
          </button>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          <p className="list-members-sheet__section-title">
            Miembros · {members.length}
          </p>

          {members.map(member => {
            const isCurrentUser = member.user_id === currentUserId
            const isOwnerRow = isCurrentUser && isOwner

            return (
              <div key={member.user_id} className="list-members-sheet__member-row">
                <div className="list-members-sheet__avatar">
                  {member.photo_url ? (
                    <img src={member.photo_url} alt={member.display_name} />
                  ) : (
                    <span>{member.display_name?.[0]?.toUpperCase() ?? '?'}</span>
                  )}
                </div>
                <span className="list-members-sheet__member-name">
                  {member.display_name}{isOwnerRow ? ' 👑' : ''}
                </span>
                {isOwner && !isCurrentUser && (
                  <button
                    className="list-members-sheet__action-btn"
                    onClick={() => void handleRemove(member.user_id)}
                    aria-label={`Expulsar a ${member.display_name}`}
                  >
                    Expulsar
                  </button>
                )}
                {!isOwner && isCurrentUser && (
                  <button
                    className="list-members-sheet__action-btn"
                    onClick={() => void handleRemove(member.user_id)}
                    aria-label="Salir de la lista"
                  >
                    Salir
                  </button>
                )}
              </div>
            )
          })}

          {!listFull && (
            <>
              <div className="list-members-sheet__divider" />
              {fallbackUrl ? (
                <input
                  className="list-members-sheet__fallback-input"
                  readOnly
                  value={fallbackUrl}
                  aria-label="Enlace de invitación"
                  onFocus={e => e.target.select()}
                />
              ) : (
                <button
                  className="list-members-sheet__invite-btn"
                  onClick={() => void handleCopyInvite()}
                  disabled={inviteLimitReached}
                >
                  🔗 Copiar enlace de invitación
                </button>
              )}
              {inviteLimitReached && (
                <p className="list-members-sheet__invite-limit">
                  Límite de invitaciones alcanzado. Espera a que expiren o sean aceptadas.
                </p>
              )}
            </>
          )}
        </>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
    </>
  )
}
