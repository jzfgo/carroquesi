export type ThemePreference = 'light' | 'dark' | 'system'

// Read by the inline pre-paint script in index.html too — the two must agree
// on the key and on treating anything but 'light'/'dark' as 'system'.
const KEY = 'cqs_theme'

type Listener = (pref: ThemePreference) => void

const listeners = new Set<Listener>()

export function getPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === 'light' || raw === 'dark' ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function setPreference(pref: ThemePreference): void {
  try {
    // 'system' is the absent-key default, not a stored value: an explicit
    // marker would say nothing the absence doesn't already say.
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // Storage can be unavailable (private mode, quota). The preference still
    // applies for this session through the listeners below.
  }
  listeners.forEach((listener) => listener(pref))
}

/** Notifies on every setPreference call. Returns the unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resolve(
  pref: ThemePreference,
  systemDark: boolean,
): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}
