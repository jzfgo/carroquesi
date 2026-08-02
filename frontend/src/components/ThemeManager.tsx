import { useEffect } from 'react'
import {
  getPreference,
  META_THEME_COLOR,
  resolve,
  subscribe,
  type ThemePreference,
} from '../lib/theme'

function apply(pref: ThemePreference, systemDark: boolean) {
  const root = document.documentElement
  // 'system' carries no class: the prefers-color-scheme media query in
  // colorsAndType.css is the styling, so OS flips restyle without JS help.
  root.classList.toggle('theme-light', pref === 'light')
  root.classList.toggle('theme-dark', pref === 'dark')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', META_THEME_COLOR[resolve(pref, systemDark)])
}

/**
 * Applies the appearance preference: theme class on <html> plus the meta
 * theme-color, kept live against both in-app changes (lib/theme subscribers)
 * and OS scheme flips while the preference is 'system'. The inline script in
 * index.html does the same work once, before first paint; this component owns
 * everything after.
 */
export function ThemeManager({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const applyCurrent = () => apply(getPreference(), mq.matches)
    applyCurrent()
    mq.addEventListener('change', applyCurrent)
    const unsubscribe = subscribe(applyCurrent)
    return () => {
      mq.removeEventListener('change', applyCurrent)
      unsubscribe()
    }
  }, [])
  return <>{children}</>
}
