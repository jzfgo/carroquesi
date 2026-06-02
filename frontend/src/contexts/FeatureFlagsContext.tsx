import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { getMe } from '../lib/api'

interface FeatureFlagsContextValue {
  isEnabled: (flag: string) => boolean
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useFeatureFlags(): FeatureFlagsContextValue {
  const ctx = useContext(FeatureFlagsContext)
  if (!ctx) throw new Error('useFeatureFlags must be used within FeatureFlagsProvider')
  return ctx
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user, getToken } = useAuth()
  const getTokenRef = useRef(getToken)
  useEffect(() => { getTokenRef.current = getToken }, [getToken])
  const [flags, setFlags] = useState<string[]>([])

  useEffect(() => {
    setFlags(user?.features ?? [])
  }, [user])

  useEffect(() => {
    if (!user) return

    const poll = async () => {
      try {
        const data = await getMe(getTokenRef.current) as { features?: string[] }
        setFlags(data.features ?? [])
      } catch {
        // keep last known state on error
      }
    }

    const id = setInterval(poll, 60_000)
    return () => clearInterval(id)
  }, [user])

  const isEnabled = useCallback((flag: string) => flags.includes(flag), [flags])

  return (
    <FeatureFlagsContext.Provider value={{ isEnabled }}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}
