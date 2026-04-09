import { useEffect, useState } from 'react'

import { THEMES } from '../lib/themes'

export function ThemeManager({ children }: { children: React.ReactNode }) {
  const [currentTheme] = useState<string>(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('terminal-theme')
    // If no saved theme, default to monokai-pro
    if (savedTheme && THEMES.includes(savedTheme)) {
      return savedTheme
    }
    return THEMES[0]
  })

  useEffect(() => {
    // Apply theme to root element
    const root = document.documentElement
    root.setAttribute('data-theme', currentTheme)

    // Save theme preference
    localStorage.setItem('terminal-theme', currentTheme)
  }, [currentTheme])

  return (
    <div className="theme-manager">
      {children}
    </div>
  )
}
