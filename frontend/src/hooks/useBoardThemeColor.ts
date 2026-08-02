import { useEffect } from 'react'
import type { BoardName } from '../lib/boards'
import {
  getPreference,
  META_THEME_COLOR,
  resolve,
  subscribe,
} from '../lib/theme'

// DEV-ONLY PREVIEW AFFORDANCE. This hook exists for the in-list header
// side-by-side: the "board" header variant tints the browser chrome with the
// list's board colour. Only one variant ships — once the choice is made,
// either this file is deleted (variant "paper" wins) or this notice goes and
// the hook becomes the shipped behaviour (variant "board" wins).

// The browser paints its chrome from the meta tag, not from CSS, so these
// mirror the --board-* values in colorsAndType.css by hand — the same reason
// META_THEME_COLOR mirrors --paper-0.
const BOARD_THEME_COLOR: Record<BoardName, { light: string; dark: string }> = {
  kraft: { light: '#c2a982', dark: '#2a1d0a' },
  lino: { light: '#c8c2b3', dark: '#232014' },
  salvia: { light: '#a9b8a5', dark: '#12240f' },
  niebla: { light: '#a9b6c6', dark: '#0f1e33' },
  barro: { light: '#c59a8a', dark: '#331409' },
  pizarra: { light: '#a8a8ad', dark: '#1b1c24' },
}

/**
 * While enabled, overrides `meta[name=theme-color]` with the board's colour
 * for the resolved theme, tracking appearance changes the same way
 * ThemeManager does (preference subscribers plus the OS scheme query — this
 * hook's listeners register after ThemeManager's, so its value wins while
 * mounted). On cleanup the tag goes back to the paper colour for the theme
 * current at that moment, not the possibly stale value from mount time.
 */
export function useBoardThemeColor(board: BoardName, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      meta.setAttribute(
        'content',
        BOARD_THEME_COLOR[board][resolve(getPreference(), mq.matches)],
      )
    apply()
    mq.addEventListener('change', apply)
    const unsubscribe = subscribe(apply)
    return () => {
      mq.removeEventListener('change', apply)
      unsubscribe()
      meta.setAttribute(
        'content',
        META_THEME_COLOR[resolve(getPreference(), mq.matches)],
      )
    }
  }, [board, enabled])
}
