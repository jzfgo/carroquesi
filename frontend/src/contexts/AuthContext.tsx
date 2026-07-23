import {
  signOut as firebaseSignOut,
  getIdToken,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User as FirebaseUser,
} from 'firebase/auth'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, syncUser } from '../lib/api'
import { DEV_USER_ID } from '../lib/environment'
import { auth } from '../lib/firebase'
import { disablePush, syncPushToken } from '../lib/push'

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
          const d = data as {
            id: string
            display_name: string
            photo_url: string | null
            email: string
            features?: string[]
          }
          setUser({
            id: d.id,
            displayName: d.display_name,
            photoUrl: d.photo_url,
            email: d.email,
            features: d.features ?? [],
          })
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
          const data = (await syncUser(getToken)) as {
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
          if (
            err instanceof ApiError &&
            (err.status === 401 || err.status === 403)
          ) {
            setUser(null)
            setLoading(false)
            return
          }
          // A network error from syncUser should not sign the user out.
          // Keep existing session state; only clear on explicit Firebase sign-out.
          setUser((prev) => prev)
        }
      } else {
        setUser(null)
        setIsWaitlisted(false)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  // useCallback so the identity is stable: getToken is handed to consumers that
  // put it in effect dependency arrays (useListSeen, useQueueDrain), where a
  // fresh function each render would re-fire their effects for no reason. It
  // closes over nothing but a module constant and a ref, so [] is correct.
  const getToken = useCallback(async (): Promise<string> => {
    if (DEV_USER_ID) return 'dev-bypass'
    if (!firebaseUserRef.current) throw new Error('Not authenticated')
    return getIdToken(firebaseUserRef.current, false)
  }, [])

  // FCM rotates tokens silently, so refresh this device's registration once a
  // user is established. Only ever refreshes a device that already opted in —
  // syncPushToken will not create a registration on its own, so this cannot
  // resurrect notifications the user turned off.
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    void syncPushToken(getToken)
  }, [userId, getToken])

  const signIn = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider())
  }

  const signOut = async () => {
    // Before dropping credentials: a shared or handed-down phone must not keep
    // receiving the previous user's lists. Best-effort — a failure here must
    // never block signing out.
    await disablePush(getToken).catch(() => undefined)
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{ user, getToken, signIn, signOut, loading, isWaitlisted }}
    >
      {children}
    </AuthContext.Provider>
  )
}
