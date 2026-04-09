import { useEffect, useState } from 'react'
import './SettingsScreen.css'

import { THEMES } from '../lib/themes'

export function SettingsScreen() {
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
    <div className="settings-screen">
      <div className="settings-header">
        <button
          className="settings-back-button"
          onClick={() => window.location.href = '/'}
          aria-label="Volver al panel principal"
        >
          ← Volver
        </button>
        <h2 className="settings-screen__title">Configuración</h2>
      </div>

      <div className="settings-section">
        <h3 className="settings-section__title">Temas</h3>
        <div className="theme-selector">
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
    </div>
  )
}
