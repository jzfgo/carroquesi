import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getMe } from '../lib/api'
import { useAuth } from './AuthContext'

interface FeatureFlagsContextValue {
  isEnabled: (flag: string) => boolean
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useFeatureFlags(): FeatureFlagsContextValue {
  const ctx = useContext(FeatureFlagsContext)
  if (!ctx)
    throw new Error('useFeatureFlags must be used within FeatureFlagsProvider')
  return ctx
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth()
  const getTokenRef = useRef(getToken)
  useEffect(() => {
    getTokenRef.current = getToken
  }, [getToken])

  // polledFlags: null = not yet polled for the current user session
  const [polledFlags, setPolledFlags] = useState<string[] | null>(null)

  // Reset polledFlags when user identity changes (render-phase update, not inside useEffect)
  const [trackedUserId, setTrackedUserId] = useState<string | undefined>(
    user?.id,
  )
  if (trackedUserId !== user?.id) {
    setTrackedUserId(user?.id)
    setPolledFlags(null)
  }

  useEffect(() => {
    if (!user) return

    const poll = async () => {
      try {
        const data = (await getMe(getTokenRef.current)) as {
          features?: string[]
        }
        setPolledFlags(data.features ?? [])
      } catch {
        // keep last known state on error
      }
    }

    const id = setInterval(poll, 60_000)
    return () => clearInterval(id)
  }, [user])

  const isEnabled = useCallback(
    (flag: string) => (polledFlags ?? user?.features ?? []).includes(flag),
    [polledFlags, user],
  )

  return (
    <FeatureFlagsContext.Provider value={{ isEnabled }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}
