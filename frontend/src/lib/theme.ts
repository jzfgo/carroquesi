/** Appearance is a property of the screen you are looking at, not of the
 *  account you are signed in to: the same household reads the same list on a
 *  phone in bed and on a tablet in the kitchen, and those two want different
 *  answers. So this lives in localStorage and never travels to the backend.
 *
 *  It is modelled as a store rather than React state on purpose. The value is
 *  already external — it lives in localStorage and is partly owned by the OS —
 *  and two unrelated places read it, so a provider would only add a wrapper
 *  every test and every entry point would have to remember. useSyncExternalStore
 *  over this module is the honest shape. */
const KEY = 'cqs_theme'

export type ThemePreference = 'light' | 'dark' | 'system'

/** What actually gets painted, once the preference and the OS have both had
 *  their say. `system` is not one of these — it is a way of deferring. */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'light',
  'dark',
  'system',
]

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStored(): ThemePreference {
  try {
    const raw = localStorage.getItem(KEY)
    return isPreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function prefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light'
  return preference
}

/** The class goes on <html>, not <body>, and that is load-bearing rather than
 *  a matter of taste: every semantic alias in colorsAndType.css is declared on
 *  :root as `var(--some-palette-entry)`, and a custom property is substituted
 *  on the element that declares it. Overriding the palette on a descendant
 *  would repaint --paper-0 but leave --bg holding the old value. Same element,
 *  no such split. See the header of colorsAndType.css. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('theme-dark', theme === 'dark')
  root.classList.toggle('theme-light', theme === 'light')

  // The browser's own chrome is the one surface the stylesheet cannot reach,
  // and on a phone it sits directly against the sheet. It has to be --paper-0
  // of the mode that won, or the top of the screen belongs to the other one.
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', theme === 'dark' ? '#252731' : '#eef1f5')
}

// ── the store ──────────────────────────────────────────────────────────────

type Listener = () => void

const listeners = new Set<Listener>()

// Snapshots must be referentially stable between reads or useSyncExternalStore
// will loop, so both are cached and only recomputed when something has changed.
let preferenceCache: ThemePreference | null = null
let resolvedCache: ResolvedTheme | null = null
let watchingSystem = false

function emit(): void {
  listeners.forEach((listener) => listener())
}

function refresh(): void {
  const next = resolveTheme(getThemePreference())
  if (next === resolvedCache) return
  resolvedCache = next
  applyTheme(next)
  emit()
}

/** Attached once, for the lifetime of the page, and only ever read while the
 *  preference is `system` — an explicit light or dark does not care what the
 *  phone does at sunset. */
function watchSystem(): void {
  if (watchingSystem) return
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mq) return
  watchingSystem = true
  mq.addEventListener('change', () => {
    if (getThemePreference() !== 'system') return
    refresh()
  })
}

/** Paints the stored preference before React mounts, so a dark-mode phone never
 *  flashes a white sheet on the way in. `refresh` deliberately paints only on a
 *  *change*, which means the very first paint has to be asked for explicitly —
 *  call this once from the entry point. Idempotent. */
export function initTheme(): void {
  applyTheme(getResolvedTheme())
}

export function subscribeTheme(listener: Listener): () => void {
  watchSystem()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Defaults to `system`: until someone says otherwise, the right answer is the
 *  one their phone already gave every other app. */
export function getThemePreference(): ThemePreference {
  preferenceCache ??= readStored()
  return preferenceCache
}

export function getResolvedTheme(): ResolvedTheme {
  resolvedCache ??= resolveTheme(getThemePreference())
  return resolvedCache
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(KEY, preference)
  } catch {
    // ignore quota/security errors — the session still honours the choice,
    // it just will not be remembered next time.
  }
  if (preference === preferenceCache) return
  preferenceCache = preference
  // The resolved theme may not have moved — light to system on a light phone
  // paints the same — but the preference did, and the segment shows that.
  refresh()
  emit()
}

/** Test seam: drops the cached snapshots so a suite can start from a clean
 *  localStorage without leaking the previous test's choice.
 *
 *  `watchingSystem` has to be cleared too, and it is the one that bites: it
 *  guards a listener attached for the lifetime of the page, so once any test
 *  has subscribed, `watchSystem` early-returns for the rest of the file. A
 *  later test that installs a fresh `matchMedia` mock would then never be
 *  registered against it — and a test asserting the OS flip is picked up would
 *  pass while listening to nothing. */
export function resetThemeForTests(): void {
  preferenceCache = null
  resolvedCache = null
  watchingSystem = false
}
