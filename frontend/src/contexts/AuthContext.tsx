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
import { ApiError, setReceiptConsent, syncUser } from '../lib/api'
import {
  clearCachedUser,
  loadCachedUser,
  saveCachedUser,
} from '../lib/cachedUser'
import { DEV_USER_ID } from '../lib/environment'
import { getFirebaseAuth } from '../lib/firebase'
import { disablePush, syncPushToken } from '../lib/push'

export type ReceiptConsent = 'granted' | 'declined' | null

export interface AuthUser {
  id: string
  displayName: string
  photoUrl: string | null
  email: string
  features: string[]
  // null means the user was never asked; the consent sheet reads this to
  // decide whether to intercept the first scan. See recordReceiptConsent.
  receiptConsent: ReceiptConsent
}

interface AuthContextValue {
  user: AuthUser | null
  getToken: () => Promise<string>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
  isWaitlisted: boolean
  recordReceiptConsent: (consent: 'granted' | 'declined') => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Same cadence as the list poll.
const SYNC_RETRY_MS = 5000

function isWaitlistAnswer(err: ApiError): boolean {
  if (err.status !== 403) return false
  try {
    return (
      (JSON.parse(err.message) as { detail?: unknown }).detail === 'waitlist'
    )
  } catch {
    return false
  }
}

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
            receipt_consent?: ReceiptConsent
          }
          setUser({
            id: d.id,
            displayName: d.display_name,
            photoUrl: d.photo_url,
            email: d.email,
            features: d.features ?? [],
            receiptConsent: d.receipt_consent ?? null,
          })
        })
        .catch(() => {})
        .finally(() => setLoading(false))
      return
    }

    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const sync = async (fbUser: FirebaseUser) => {
      clearTimeout(retryTimer)
      try {
        const data = (await syncUser(() => getIdToken(fbUser, false))) as {
          id: string
          display_name: string
          photo_url: string | null
          email: string
          features?: string[]
          receipt_consent?: ReceiptConsent
        }
        if (firebaseUserRef.current !== fbUser) return
        const synced: AuthUser = {
          id: data.id,
          displayName: data.display_name,
          photoUrl: data.photo_url,
          email: data.email,
          features: data.features ?? [],
          receiptConsent: data.receipt_consent ?? null,
        }
        saveCachedUser(fbUser.uid, synced)
        setUser(synced)
        setIsWaitlisted(false)
        setLoading(false)
      } catch (err) {
        if (firebaseUserRef.current !== fbUser) return
        // Only an answer from the server can say the user has no access.
        if (
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          clearCachedUser()
          setUser(null)
          setIsWaitlisted(isWaitlistAnswer(err))
          setLoading(false)
          return
        }
        // Any other failure: the server was not reached, or it answered
        // without saying the user has no access (5xx, 404, 429). Firebase
        // says the user is signed in, so never fall through to the waitlist:
        // paint the last confirmed profile, or keep loading if there is none,
        // and try again later.
        const cached = loadCachedUser(fbUser.uid)
        if (cached) {
          setUser((prev) => prev ?? cached)
          setLoading(false)
        }
        // Two failed syncs can overlap; keep only one retry armed.
        clearTimeout(retryTimer)
        retryTimer = setTimeout(() => void sync(fbUser), SYNC_RETRY_MS)
      }
    }

    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (fbUser) => {
      firebaseUserRef.current = fbUser
      clearTimeout(retryTimer)
      if (fbUser) {
        setLoading(true)
        void sync(fbUser)
      } else {
        clearCachedUser()
        setUser(null)
        setIsWaitlisted(false)
        setLoading(false)
      }
    })
    return () => {
      clearTimeout(retryTimer)
      unsubscribe()
    }
  }, [])

  // useCallback so the identity is stable: getToken is handed to consumers
  // that put it in effect dependency arrays (useListSeen), where a fresh
  // function each render would re-fire their effects for no reason. It
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

  // Records the receipt-scanning decision and reflects it locally so the gate
  // and the settings toggle update without waiting for the next user sync. The
  // PUT is idempotent server-side, so re-sending the same decision is fine.
  const recordReceiptConsent = useCallback(
    async (consent: 'granted' | 'declined') => {
      await setReceiptConsent(getToken, consent)
      setUser((prev) => {
        if (!prev) return prev
        const next = { ...prev, receiptConsent: consent }
        const uid = firebaseUserRef.current?.uid
        if (uid) saveCachedUser(uid, next)
        return next
      })
    },
    [getToken],
  )

  const signIn = async () => {
    await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider())
  }

  const signOut = async () => {
    // Before dropping credentials: a shared or handed-down phone must not keep
    // receiving the previous user's lists. Best-effort — a failure here must
    // never block signing out.
    await disablePush(getToken).catch(() => undefined)
    await firebaseSignOut(getFirebaseAuth())
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        getToken,
        signIn,
        signOut,
        loading,
        isWaitlisted,
        recordReceiptConsent,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
