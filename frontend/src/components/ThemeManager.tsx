import { useEffect } from 'react'
import { useTheme } from '../hooks/useTheme'
import { applyTheme } from '../lib/theme'

/**
 * Paints the stored preference onto <html> once the app is alive, and keeps
 * subscribing so an OS change at sunset reaches the document. The preference
 * itself lives in lib/theme, not here — this component owns nothing but the
 * class on the root element.
 */
export function ThemeManager({ children }: { children: React.ReactNode }) {
  const { resolved } = useTheme()

  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  return <>{children}</>
}
