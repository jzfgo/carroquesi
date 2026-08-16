import { ShoppingCart } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { acceptInvite, ApiError, getInvitePreview } from '../lib/api'
import './InviteScreen.css'
import { Mascot } from './Mascot'
import { WaitlistScreen } from './WaitlistScreen'

type ScreenState = 'loading' | 'preview' | 'accepting' | 'error'

interface Preview {
  id: string
  list_name: string
  list_emoji: string | null
  invited_by_name: string | null
}

const NETWORK_ERROR_MESSAGE = 'No se pudo conectar. Inténtalo de nuevo.'

const ERROR_MESSAGES: Record<number, string> = {
  403: 'Esta invitación es para otra cuenta',
  404: 'Esta invitación no existe',
  409: 'La lista ya está llena — el tope son 5',
  410: 'Esta invitación ha expirado',
}

export function InviteScreen() {
  const { id: inviteId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    user,
    getToken,
    signIn,
    signOut,
    loading: authLoading,
    isWaitlisted,
  } = useAuth()
  const [screenState, setScreenState] = useState<ScreenState>('loading')
  const [preview, setPreview] = useState<Preview | null>(null)
  usePageTitle(preview ? `Invitación — ${preview.list_name}` : 'Invitación')
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isNetworkError, setIsNetworkError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const pendingAcceptRef = useRef(false)

  const showError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      setErrorStatus(err.status)
      setErrorMessage(ERROR_MESSAGES[err.status] ?? NETWORK_ERROR_MESSAGE)
      setIsNetworkError(false)
    } else {
      setErrorStatus(null)
      setErrorMessage(NETWORK_ERROR_MESSAGE)
      setIsNetworkError(true)
    }
    setScreenState('error')
  }, [])

  useEffect(() => {
    if (!inviteId) return
    void (async () => {
      setScreenState('loading')
      try {
        const data = await getInvitePreview(inviteId)
        setPreview(data)
        setScreenState('preview')
      } catch (err) {
        showError(err)
      }
    })()
  }, [inviteId, retryCount, showError])

  // Auto-accept after sign-in completes (unauthenticated flow)
  useEffect(() => {
    if (authLoading || !user || !pendingAcceptRef.current || !inviteId) return
    pendingAcceptRef.current = false
    void (async () => {
      setScreenState('accepting')
      try {
        const data = await acceptInvite(getToken, inviteId)
        // Accepting an invite is sharing intent: enable notification priming.
        localStorage.setItem('push-sharing-intent', '1')
        navigate(`/lists/${data.list_id}`)
      } catch (err) {
        showError(err)
      }
    })()
  }, [authLoading, user, inviteId, getToken, navigate, showError])

  if (isWaitlisted) {
    return (
      <WaitlistScreen
        inviteToken={inviteId}
        inviterName={preview?.invited_by_name ?? undefined}
        listName={preview?.list_name ?? undefined}
      />
    )
  }

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
      // Accepting an invite is sharing intent: enable notification priming.
      localStorage.setItem('push-sharing-intent', '1')
      navigate(`/lists/${data.list_id}`)
    } catch (err) {
      showError(err)
    }
  }

  // The invite token lives in the URL, so after signing out a refetch lands
  // back on the preview with its sign-in button.
  async function handleSwitchAccount() {
    await signOut().catch(() => undefined)
    setRetryCount((c) => c + 1)
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
              onClick={() => setRetryCount((c) => c + 1)}
            >
              Reintentar
            </button>
          )}
          {errorStatus === 403 && (
            <button
              className="invite-screen__btn"
              onClick={() => void handleSwitchAccount()}
            >
              Cambiar de cuenta
            </button>
          )}
          <Link to="/" className="invite-screen__home-link">
            Ir al inicio →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="invite-screen">
      <Mascot size={100} />
      <div className="invite-screen__card">
        <div className="invite-screen__icon">
          {preview?.list_emoji ?? <ShoppingCart size={32} />}
        </div>
        <h1 className="invite-screen__list-name">{preview?.list_name}</h1>
        {preview?.invited_by_name && (
          <p className="invite-screen__inviter">
            Invitado por {preview.invited_by_name}
          </p>
        )}
        <button
          className="invite-screen__btn"
          onClick={() => void handleAccept()}
        >
          {user ? 'Unirse a la lista' : 'Iniciar sesión para unirse'}
        </button>
      </div>
    </div>
  )
}
