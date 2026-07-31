import { Crown, Link2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { useToast } from '../hooks/useToast'
import {
  ApiError,
  createOpenInvite,
  getListMembers,
  removeMember,
} from '../lib/api'
import { isRetryable } from '../lib/refusalCopy'
import { refusalMessage } from '../lib/refusalCopy'
import './ListMembersSheet.css'
import { Toast } from './Toast'

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
  /**
   * Called when the person reading this sheet has just left the list — their
   * own «Salir», landed. The screen behind this sheet is a list they are no
   * longer in, and nothing else would ever say so: the poll swallows the 403s
   * it starts getting, and `ListRoute` decides «Lista no encontrada» on mount.
   */
  onLeft?: () => void
}

type LoadState = 'loading' | 'error' | 'ready'

const MAX_MEMBERS = 5

export function ListMembersSheet({
  listId,
  currentUserId,
  isOwner,
  onClose,
  onLeft,
}: Props) {
  const { getToken } = useAuth()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [members, setMembers] = useState<BackendMember[]>([])
  const [inviteLimitReached, setInviteLimitReached] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const { toast, showToast, dismissToast } = useToast()
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

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
    // Whether this tap ends *this* person's relationship with the list. One
    // handler backs «Expulsar» and «Salir», and the two differ in exactly this.
    const leaving = userId === currentUserId
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    try {
      await removeMember(getToken, listId, userId)
      // Leaving a list has to leave the list. Otherwise the sheet closes onto
      // the screen for a list they are no longer in — fully interactive, and
      // nothing corrects it: the poll starts 403ing and swallows it by design,
      // `ListRoute` decided on mount, and this sheet read its members once. So
      // they go on tapping items in, each write answering «sin permiso en esa
      // lista» with no retry, and offline the ops queue and land as terminal
      // rows in «Cambios sin enviar» whose only door is «Descartarlos».
      //
      // Same rule `handleDelete` keeps for the owner, reached from the other
      // side: there it is a 404 saying the list is gone, here it is a success.
      if (leaving) onLeft?.()
    } catch (err) {
      // Already gone, which is what «Expulsar» asked for. The same endpoint
      // backs «Salir», so somebody leaving on their own phone is the ordinary
      // way this 404 happens — and restoring their row would put a person back
      // into a household they have just left, under a notice saying the
      // removal failed when it did not.
      //
      // Worse here than it was for an item: this sheet has no poll of its own,
      // `load()` runs once when it opens, so the resurrected row would stay
      // until somebody closed and reopened it.
      if (err instanceof ApiError && err.status === 404) {
        // Already gone — and if it was *this* person's membership, they are
        // just as out of the list as a success would have left them.
        if (leaving) onLeft?.()
        return
      }
      setMembers(snapshot)
      showToast('No se pudo eliminar el miembro')
    }
  }

  async function handleCopyInvite() {
    setInviteLimitReached(false)
    setFallbackUrl(null)
    try {
      const data = (await createOpenInvite(getToken, listId)) as { id: string }
      // Creating an invite is the demonstrated sharing intent that makes the
      // notification priming card eligible, even while the list is still solo.
      localStorage.setItem('push-sharing-intent', '1')
      const url = `${window.location.origin}/i/${data.id}`
      try {
        await navigator.clipboard.writeText(url)
        showToast('Enlace copiado')
      } catch {
        setFallbackUrl(url)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setInviteLimitReached(true)
        return
      }
      // Anything else used to be swallowed whole: the tap did nothing, said
      // nothing, and left no trace. A tap that vanishes is the one thing this
      // app is not allowed to do, and there is nothing to retry *into* here —
      // the invite was never created — so the notice carries the way to ask
      // again.
      // The same sentence every other write says for the same fact — a 403
      // here means you are not in this list, and that is not «no se pudo».
      showToast(
        refusalMessage(err, 'No se pudo crear el enlace'),
        isRetryable(err instanceof ApiError ? err.status : 0)
          ? {
              label: 'Reintentar',
              tone: 'tomate',
              onAct: () => void handleCopyInvite(),
            }
          : undefined,
      )
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
        <div className="list-members-sheet__handle" {...swipe} />

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

            {members.map((member) => {
              const isCurrentUser = member.user_id === currentUserId
              const isOwnerRow = isCurrentUser && isOwner

              return (
                <div
                  key={member.user_id}
                  className="list-members-sheet__member-row"
                >
                  <div className="list-members-sheet__avatar">
                    {member.photo_url ? (
                      <img src={member.photo_url} alt={member.display_name} />
                    ) : (
                      <span>
                        {member.display_name?.[0]?.toUpperCase() ?? '?'}
                      </span>
                    )}
                  </div>
                  <span className="list-members-sheet__member-name">
                    {member.display_name}
                    {isOwnerRow && (
                      <span className="list-members-sheet__owner-badge">
                        <Crown size={11} /> Propietario
                      </span>
                    )}
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
                    onFocus={(e) => e.target.select()}
                  />
                ) : (
                  <button
                    className="list-members-sheet__invite-btn"
                    onClick={() => void handleCopyInvite()}
                    disabled={inviteLimitReached}
                  >
                    <Link2 size={15} /> Copiar enlace de invitación
                  </button>
                )}
                {inviteLimitReached && (
                  <p className="list-members-sheet__invite-limit">
                    Límite de invitaciones alcanzado. Espera a que expiren o
                    sean aceptadas.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            action={toast.action}
            onDismiss={dismissToast}
          />
        )}
      </div>
    </>
  )
}
