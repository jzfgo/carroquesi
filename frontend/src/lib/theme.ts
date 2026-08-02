export type ThemePreference = 'light' | 'dark' | 'system'

// The --paper-0 values. The browser paints its chrome from the meta tag, not
// from CSS, so this map must be kept in step with every theme resolution or
// the status bar shows the other theme's colour. ThemeManager applies it; the
// list screen's board override hands the tag back to it on unmount.
export const META_THEME_COLOR = { light: '#EEF1F5', dark: '#252731' } as const

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
