import { useSyncExternalStore } from 'react'
import {
  getResolvedTheme,
  getThemePreference,
  setThemePreference,
  subscribeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme'

interface UseTheme {
  /** What the person chose, including `system` — this is what the segment
   *  shows as selected. */
  preference: ThemePreference
  /** What is actually painted right now. */
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

/** No provider: the value is external device state, so it is read straight from
 *  the store in lib/theme. Every caller sees the same snapshot and re-renders
 *  together, wherever in the tree it sits. */
export function useTheme(): UseTheme {
  const preference = useSyncExternalStore(
    subscribeTheme,
    getThemePreference,
    getThemePreference,
  )
  const resolved = useSyncExternalStore(
    subscribeTheme,
    getResolvedTheme,
    getResolvedTheme,
  )
  return { preference, resolved, setPreference: setThemePreference }
}
