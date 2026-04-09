import { useEffect, useState } from 'react'

export function ThemeManager({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('terminal-theme')
    // If no saved theme, check system preference or default to cobalt
    if (savedTheme && ['cobalt', 'dracula', 'monokai'].includes(savedTheme)) {
      return savedTheme
    }
    return 'cobalt'
  })

  useEffect(() => {
    // Apply theme to root element
    const root = document.documentElement
    root.setAttribute('data-theme', currentTheme)
    
    // Save theme preference
    localStorage.setItem('terminal-theme', currentTheme)
  }, [currentTheme])

  const switchTheme = (theme: string) => {
    if (['cobalt', 'dracula', 'monokai'].includes(theme)) {
      setCurrentTheme(theme)
    }
  }

  return (
    <div className="theme-manager">
      {children}
    </div>
  )
}
