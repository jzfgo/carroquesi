import { useEffect, useState } from 'react'
import { THEMES } from '../lib/themes'
import './ThemeSwitcher.css'

export function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState<string>(THEMES[0])

  useEffect(() => {
    const savedTheme = localStorage.getItem('terminal-theme') || THEMES[0]
    setCurrentTheme(savedTheme)
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  const switchTheme = (theme: string) => {
    if (THEMES.includes(theme)) {
      setCurrentTheme(theme)
      localStorage.setItem('terminal-theme', theme)
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  return (
    <div className="theme-switcher">
      <div className="theme-switcher__buttons">
        {THEMES.map((theme) => (
          <button
            key={theme}
            className={`theme-button ${currentTheme === theme ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme(theme)}
            aria-label={`Cambiar a tema ${theme}`}
          >
            {theme.charAt(0).toUpperCase() + theme.slice(1).replace(/-/g, ' ')}
          </button>
        ))}
      </div>
    </div>
  )
}
