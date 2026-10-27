import type { AuthUser } from '../contexts/AuthContext'

// The last profile the backend confirmed for this device. A cold start with
// no network cannot ask the server who the user is, but Firebase still knows
// they are signed in. Without this copy the app would treat them as unknown
// and show the waitlist. The Firebase uid guards against a profile left
// behind by another account.
const KEY = 'cqs_user'

export function loadCachedUser(uid: string): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { uid?: string; user?: AuthUser }
    return cached.uid === uid && cached.user ? cached.user : null
  } catch {
    return null
  }
}

export function saveCachedUser(uid: string, user: AuthUser): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ uid, user }))
  } catch {
    // Storage can be unavailable (private mode, quota). The next offline cold
    // start then waits for the network instead of painting the dashboard.
  }
}

export function clearCachedUser(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
