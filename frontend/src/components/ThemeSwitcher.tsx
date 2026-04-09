import { useEffect, useState } from 'react'
import { ThemeManager } from './ThemeManager'

export function ThemeSwitcher() {
  const [currentTheme, setCurrentTheme] = useState<string>('cobalt')

  useEffect(() => {
    const savedTheme = localStorage.getItem('terminal-theme') || 'cobalt'
    setCurrentTheme(savedTheme)
  }, [])

  const switchTheme = (theme: string) => {
    if (['cobalt', 'dracula', 'monokai'].includes(theme)) {
      setCurrentTheme(theme)
      localStorage.setItem('terminal-theme', theme)
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  return (
    <div className="theme-switcher">
      <div className="theme-switcher__buttons">
        <button 
          className={`theme-switcher__button ${currentTheme === 'cobalt' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('cobalt')}
          aria-label="Cambiar a tema Cobalt"
        >
          Cobalt
        </button>
        <button 
          className={`theme-switcher__button ${currentTheme === 'dracula' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('dracula')}
          aria-label="Cambiar a tema Dracula"
        >
          Dracula
        </button>
        <button 
          className={`theme-switcher__button ${currentTheme === 'monokai' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('monokai')}
          aria-label="Cambiar a tema Monokai"
        >
          Monokai
        </button>
      </div>
    </div>
  )
}
