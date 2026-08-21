import { Crown, Link2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  ApiError,
  createOpenInvite,
  getListMembers,
  removeMember,
  transferOwnership,
} from '../lib/api'
import type { BackendMember } from '../types'
import './ListMembersSheet.css'
import { Sheet } from './Sheet'
import { Toast } from './Toast'

interface Props {
  listId: string
  currentUserId: string
  /** The list's owner (lists.owner_id); the crown marks this member's row. */
  ownerId: string
  onClose: () => void
  /** The current user's own removal succeeded — they are no longer a member. */
  onLeft?: () => void
  /** An answer arrived that suggests the list itself is gone or forbidden. */
  onListSuspect?: () => void
}

type LoadState = 'loading' | 'error' | 'ready'

type SubState =
  | { kind: 'members' }
  | { kind: 'confirm-remove'; member: BackendMember }
  | { kind: 'transfer' }

const MAX_MEMBERS = 5

const LABELS: Record<SubState['kind'], string> = {
  members: 'Miembros',
  'confirm-remove': 'Quitar miembro',
  transfer: 'Salir de esta lista',
}

/** The cap, said before the invite instead of after: how many still fit. */
function capacityNote(remaining: number): string {
  if (remaining <= 0) return 'La lista está completa.'
  const room = remaining === 1 ? 'Cabe 1 más' : `Caben ${remaining} más`
  return `Quien abra el enlace entra en esta lista. ${room}.`
}

/** Decorative: the member's name always sits next to it as text. */
function Avatar({ member }: { member: BackendMember }) {
  return (
    <span className="list-members-sheet__avatar" aria-hidden="true">
      {member.photo_url ? (
        <img src={member.photo_url} alt="" />
      ) : (
        <span>{member.display_name?.[0]?.toUpperCase() ?? '?'}</span>
      )}
    </span>
  )
}

export function ListMembersSheet({
  listId,
  currentUserId,
  ownerId: initialOwnerId,
  onClose,
  onLeft,
  onListSuspect,
}: Props) {
  const { getToken } = useAuth()
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [members, setMembers] = useState<BackendMember[]>([])
  const [subState, setSubState] = useState<SubState>({ kind: 'members' })
  // Ownership can move while the sheet is open: after a transfer whose
  // follow-up leave fails, the crown must sit on the new owner.
  const [ownerId, setOwnerId] = useState(initialOwnerId)
  const [leaving, setLeaving] = useState(false)
  const [inviteLimitReached, setInviteLimitReached] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const isOwner = ownerId === currentUserId

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load() flips its loading flag before fetching, for the mount exactly as for the retry button
    void load()
  }, [load])

  async function handleRemove(userId: string) {
    const snapshot = members
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    try {
      await removeMember(getToken, listId, userId)
      // Leaving is the person's own act — staying on a list they just left
      // would strand them on a screen that no longer answers to them.
      if (userId === currentUserId) onLeft?.()
    } catch (err) {
      setMembers(snapshot)
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        userId === currentUserId
      ) {
        // The server refused an owner self-leave. The UI routes owners
        // through the transfer step, so this only fires on a stale view.
        setToast('Transfiere la propiedad antes de salir de la lista.')
        return
      }
      setToast(
        userId === currentUserId
          ? 'No se pudo salir de la lista'
          : 'No se pudo quitar el miembro',
      )
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 404)
      ) {
        onListSuspect?.()
      }
    }
  }

  async function handleTransferAndLeave(userId: string) {
    setLeaving(true)
    try {
      await transferOwnership(getToken, listId, userId)
    } catch (err) {
      setLeaving(false)
      setSubState({ kind: 'members' })
      setToast('No se pudo transferir la propiedad')
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 404)
      ) {
        onListSuspect?.()
      }
      return
    }
    setOwnerId(userId)
    try {
      await removeMember(getToken, listId, currentUserId)
      setMembers((prev) => prev.filter((m) => m.user_id !== currentUserId))
      setLeaving(false)
      setSubState({ kind: 'members' })
      onLeft?.()
    } catch (err) {
      // The list changed hands but the caller stayed: say so, and re-read
      // so the crown lands on the new owner.
      setLeaving(false)
      setSubState({ kind: 'members' })
      setToast(
        'La lista ya tiene nuevo propietario, pero no se pudo salir. Inténtalo de nuevo.',
      )
      void load()
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 404)
      ) {
        onListSuspect?.()
      }
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
        setToast('Enlace copiado')
      } catch {
        setFallbackUrl(url)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setInviteLimitReached(true)
        return
      }
      if (
        err instanceof ApiError &&
        (err.status === 403 || err.status === 404)
      ) {
        onListSuspect?.()
      }
      setToast('No se pudo crear el enlace')
    }
  }

  const others = members.filter((m) => m.user_id !== currentUserId)
  const remaining = MAX_MEMBERS - members.length
  const listFull = remaining <= 0
  // A sole owner has nobody to hand the list to, so leaving is not offered.
  const showLeave = !isOwner || others.length > 0

  return (
    <Sheet
      className="list-members-sheet"
      label={LABELS[subState.kind]}
      onClose={onClose}
      // A sub-state is a step inside the sheet: dismissing it goes back to
      // the member list, and only the list itself closes the sheet.
      onDismiss={
        subState.kind === 'members'
          ? undefined
          : () => setSubState({ kind: 'members' })
      }
    >
      {subState.kind === 'confirm-remove' && (
        <div className="list-members-sheet__confirm">
          <h2 className="list-members-sheet__confirm-title">
            ¿Quitar a {subState.member.display_name} de la lista?
          </h2>
          <button
            type="button"
            className="list-members-sheet__confirm-btn"
            onClick={() => {
              const target = subState.member.user_id
              setSubState({ kind: 'members' })
              void handleRemove(target)
            }}
          >
            Sí, quitar
          </button>
          <button
            type="button"
            className="list-members-sheet__cancel-btn"
            onClick={() => setSubState({ kind: 'members' })}
          >
            Cancelar
          </button>
        </div>
      )}

      {subState.kind === 'transfer' && (
        <div className="list-members-sheet__transfer">
          <h2 className="list-members-sheet__confirm-title">
            Salir de esta lista
          </h2>
          <p className="list-members-sheet__transfer-hint">
            Antes de salir, elige quién se queda como propietario.
          </p>
          {others.map((member) => (
            <button
              key={member.user_id}
              type="button"
              className="list-members-sheet__transfer-option"
              disabled={leaving}
              onClick={() => void handleTransferAndLeave(member.user_id)}
            >
              <Avatar member={member} />
              {member.display_name}
            </button>
          ))}
          <button
            type="button"
            className="list-members-sheet__cancel-btn"
            disabled={leaving}
            onClick={() => setSubState({ kind: 'members' })}
          >
            Cancelar
          </button>
        </div>
      )}

      {subState.kind === 'members' && (
        <>
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
              <header className="list-members-sheet__header">
                <h2 className="list-members-sheet__title">Miembros</h2>
                <span className="list-members-sheet__count">
                  {members.length} de {MAX_MEMBERS}
                </span>
              </header>

              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="list-members-sheet__member-row"
                >
                  <Avatar member={member} />
                  <span className="list-members-sheet__member-name">
                    {member.display_name}
                    {member.user_id === ownerId && (
                      <span className="list-members-sheet__owner-badge">
                        <Crown size={11} aria-hidden="true" /> Propietario
                      </span>
                    )}
                  </span>
                  {isOwner && member.user_id !== currentUserId && (
                    <button
                      className="list-members-sheet__remove-btn"
                      onClick={() =>
                        setSubState({ kind: 'confirm-remove', member })
                      }
                      aria-label={`Quitar a ${member.display_name}`}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}

              <div className="list-members-sheet__invite">
                {!listFull &&
                  (fallbackUrl ? (
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
                      <Link2 size={16} /> Copiar enlace de invitación
                    </button>
                  ))}
                {inviteLimitReached && (
                  <p className="list-members-sheet__invite-limit">
                    Límite de invitaciones alcanzado. Espera a que expiren o se
                    acepten.
                  </p>
                )}
                <p className="list-members-sheet__capacity">
                  {capacityNote(remaining)}
                </p>
              </div>

              {showLeave && (
                <div className="list-members-sheet__leave">
                  <button
                    type="button"
                    className="list-members-sheet__leave-btn"
                    onClick={() => {
                      if (isOwner) setSubState({ kind: 'transfer' })
                      else void handleRemove(currentUserId)
                    }}
                  >
                    Salir de esta lista
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </Sheet>
  )
}
