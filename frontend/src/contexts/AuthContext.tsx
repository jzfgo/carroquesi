import {
  createContext,
  useContext,
  useEffect,
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
import { syncUser } from '../lib/api'

interface AuthUser {
  id: string
  displayName: string
  photoUrl: string | null
  email: string
}

interface AuthContextValue {
  user: AuthUser | null
  getToken: () => Promise<string>
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser)
        try {
          const getToken = () => getIdToken(fbUser, false)
          const data = await syncUser(getToken) as {
            id: string
            display_name: string
            photo_url: string | null
            email: string
          }
          setUser({
            id: data.id,
            displayName: data.display_name,
            photoUrl: data.photo_url,
            email: data.email,
          })
        } catch {
          setUser(null)
        }
      } else {
        setFirebaseUser(null)
        setUser(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const getToken = async (): Promise<string> => {
    if (!firebaseUser) throw new Error('Not authenticated')
    return getIdToken(firebaseUser, false)
  }

  const signIn = async () => {
    await signInWithPopup(auth, new GoogleAuthProvider())
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, getToken, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
