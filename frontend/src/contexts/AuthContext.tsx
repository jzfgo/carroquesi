import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  getIdToken,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { syncUser, ApiError } from '../lib/api'

export interface AuthUser {
  id: string
  displayName: string
  photoUrl: string | null
  email: string
  features: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  getToken: () => Promise<string>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
  isWaitlisted: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID as string | undefined

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isWaitlisted, setIsWaitlisted] = useState(false)
  const firebaseUserRef = useRef<FirebaseUser | null>(null)

  useEffect(() => {
    if (DEV_USER_ID) {
      // Dev bypass: skip Firebase, resolve user via backend using the seed firebase_uid
      const getToken = async () => 'dev-bypass'
      syncUser(getToken)
        .then((data) => {
          const d = data as { id: string; display_name: string; photo_url: string | null; email: string; features?: string[] }
          setUser({ id: d.id, displayName: d.display_name, photoUrl: d.photo_url, email: d.email, features: d.features ?? [] })
        })
        .catch(() => {})
        .finally(() => setLoading(false))
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      firebaseUserRef.current = fbUser
      if (fbUser) {
        setLoading(true)
        try {
          const getToken = () => getIdToken(fbUser, false)
          const data = await syncUser(getToken) as {
            id: string
            display_name: string
            photo_url: string | null
            email: string
            features?: string[]
          }
          setUser({
            id: data.id,
            displayName: data.display_name,
            photoUrl: data.photo_url,
            email: data.email,
            features: data.features ?? [],
          })
          setIsWaitlisted(false)
        } catch (err) {
          if (err instanceof ApiError && err.status === 403) {
            try {
              const body = JSON.parse(err.message)
              if (body.detail === 'waitlist') {
                setUser(null)
                setIsWaitlisted(true)
                setLoading(false)
                return
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            setUser(null)
            setLoading(false)
            return
          }
          // A network error from syncUser should not sign the user out.
          // Keep existing session state; only clear on explicit Firebase sign-out.
          setUser(prev => prev)
        }
      } else {
        setUser(null)
        setIsWaitlisted(false)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const getToken = async (): Promise<string> => {
    if (DEV_USER_ID) return 'dev-bypass'
    if (!firebaseUserRef.current) throw new Error('Not authenticated')
    return getIdToken(firebaseUserRef.current, false)
  }

  const signIn = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider())
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, getToken, signIn, signOut, loading, isWaitlisted }}>
      {children}
    </AuthContext.Provider>
  )
}
