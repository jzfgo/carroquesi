import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getInvitePreview, acceptInvite, ApiError } from '../lib/api'
import './InviteScreen.css'

type ScreenState = 'loading' | 'preview' | 'accepting' | 'error'

interface Preview {
  id: string
  list_name: string
  invited_by_name: string | null
}

const ERROR_MESSAGES: Record<number, string> = {
  403: 'Esta invitación es para otra cuenta',
  404: 'Esta invitación no existe',
  409: 'La lista ya está llena',
  410: 'Esta invitación ha expirado',
}

export function InviteScreen() {
  const { id: inviteId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, getToken, signIn, loading: authLoading } = useAuth()
  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const pendingAcceptRef = useRef(false)

  useEffect(() => {
    if (!inviteId) return
    setScreenState('loading')
    setIsNetworkError(false)
    void (async () => {
      try {
        const data = await getInvitePreview(inviteId)
        setPreview(data)
        setScreenState('preview')
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMessage(ERROR_MESSAGES[err.status] ?? 'No se pudo conectar. Inténtalo de nuevo.')
          setIsNetworkError(false)
        } else {
          setErrorMessage('No se pudo conectar. Inténtalo de nuevo.')
          setIsNetworkError(true)
        }
        setScreenState('error')
      }
    })()
  }, [inviteId, retryCount])

  // Auto-accept after sign-in completes (unauthenticated flow)
  useEffect(() => {
    if (authLoading || !user || !pendingAcceptRef.current || !inviteId) return
    pendingAcceptRef.current = false
    setScreenState('accepting')
    void (async () => {
      try {
        const data = await acceptInvite(getToken, inviteId)
        navigate('/', { state: { openListId: data.list_id } })
      } catch (err) {
        setErrorMessage(
          err instanceof ApiError
            ? (ERROR_MESSAGES[err.status] ?? 'No se pudo conectar. Inténtalo de nuevo.')
            : 'No se pudo conectar. Inténtalo de nuevo.'
        )
        setIsNetworkError(!(err instanceof ApiError))
        setScreenState('error')
      }
    })()
  }, [authLoading, user, inviteId, getToken, navigate])

  async function handleAccept() {
    if (!inviteId) return
    if (!user) {
      pendingAcceptRef.current = true
      try {
        await signIn()
      } catch {
        pendingAcceptRef.current = false
      }
      return
    }
    setScreenState('accepting')
    try {
      const data = await acceptInvite(getToken, inviteId)
      navigate('/', { state: { openListId: data.list_id } })
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError
          ? (ERROR_MESSAGES[err.status] ?? 'No se pudo conectar. Inténtalo de nuevo.')
          : 'No se pudo conectar. Inténtalo de nuevo.'
      )
      setIsNetworkError(!(err instanceof ApiError))
      setScreenState('error')
    }
  }

  if (screenState === 'loading' || screenState === 'accepting') {
    return (
      <div
        className="invite-screen"
        role="status"
        aria-label={screenState === 'accepting' ? 'Uniéndose' : 'Cargando'}
      >
        <span className="invite-screen__spinner" />
      </div>
    )
  }

  if (screenState === 'error') {
    return (
      <div className="invite-screen">
        <div className="invite-screen__card">
          <p className="invite-screen__error">{errorMessage}</p>
          {isNetworkError && (
            <button
              className="invite-screen__btn"
              onClick={() => setRetryCount(c => c + 1)}
            >
              Reintentar
            </button>
          )}
          <a href="/" className="invite-screen__home-link">Ir al inicio →</a>
        </div>
      </div>
    )
  }

  return (
    <div className="invite-screen">
      <div className="invite-screen__card">
        <div className="invite-screen__icon">🛒</div>
        <h1 className="invite-screen__list-name">{preview?.list_name}</h1>
        {preview?.invited_by_name && (
          <p className="invite-screen__inviter">Invitado por {preview.invited_by_name}</p>
        )}
        <button className="invite-screen__btn" onClick={() => void handleAccept()}>
          {user ? 'Unirse a la lista' : 'Iniciar sesión para unirse'}
        </button>
      </div>
    </div>
  )
}
