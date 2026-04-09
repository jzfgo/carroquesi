import { useState, useEffect } from 'react'
import './SettingsScreen.css'

export function SettingsScreen() {
  const [currentTheme, setCurrentTheme] = useState<string>('monokai-pro')

  useEffect(() => {
    const savedTheme = localStorage.getItem('terminal-theme') || 'monokai-pro'
    setCurrentTheme(savedTheme)
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  const switchTheme = (theme: string) => {
    if ([
      'monokai-pro',
      'catppuccin-mocha', 'everforest', 'kanagawa', 'rose-pine', 'bamboo', 'melange',
      'tokyo-night', 'cyberdream', 'nightfox', 'oxocarbon',
      'gruvbox', 'nord', 'onedark', 'solarized', 'ayu',
      'moonfly', 'nordic', 'sonokai', 'miasma', 'edge', 'oceanic-next', 'palenight', 'horizon', 'nightfly'
    ].includes(theme)) {
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
          <button
            className={`theme-button ${currentTheme === 'monokai-pro' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('monokai-pro')}
            aria-label="Cambiar a tema Monokai Pro"
          >
            Monokai Pro
          </button>
          <button
            className={`theme-button ${currentTheme === 'catppuccin-mocha' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('catppuccin-mocha')}
            aria-label="Cambiar a tema Catppuccin Mocha"
          >
            Catppuccin
          </button>
          <button
            className={`theme-button ${currentTheme === 'everforest' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('everforest')}
            aria-label="Cambiar a tema Everforest"
          >
            Everforest
          </button>
          <button
            className={`theme-button ${currentTheme === 'kanagawa' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('kanagawa')}
            aria-label="Cambiar a tema Kanagawa"
          >
            Kanagawa
          </button>
          <button
            className={`theme-button ${currentTheme === 'rose-pine' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('rose-pine')}
            aria-label="Cambiar a tema Rose Pine"
          >
            Rose Pine
          </button>
          <button
            className={`theme-button ${currentTheme === 'bamboo' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('bamboo')}
            aria-label="Cambiar a tema Bamboo"
          >
            Bamboo
          </button>
          <button
            className={`theme-button ${currentTheme === 'melange' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('melange')}
            aria-label="Cambiar a tema Melange"
          >
            Melange
          </button>
          <button
            className={`theme-button ${currentTheme === 'tokyo-night' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('tokyo-night')}
            aria-label="Cambiar a tema Tokyo Night"
          >
            Tokyo Night
          </button>
          <button
            className={`theme-button ${currentTheme === 'cyberdream' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('cyberdream')}
            aria-label="Cambiar a tema Cyberdream"
          >
            Cyberdream
          </button>
          <button
            className={`theme-button ${currentTheme === 'nightfox' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('nightfox')}
            aria-label="Cambiar a tema Nightfox"
          >
            Nightfox
          </button>
          <button
            className={`theme-button ${currentTheme === 'oxocarbon' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('oxocarbon')}
            aria-label="Cambiar a tema Oxocarbon"
          >
            Oxocarbon
          </button>
          <button
            className={`theme-button ${currentTheme === 'gruvbox' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('gruvbox')}
            aria-label="Cambiar a tema Gruvbox"
          >
            Gruvbox
          </button>
          <button
            className={`theme-button ${currentTheme === 'nord' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('nord')}
            aria-label="Cambiar a tema Nord"
          >
            Nord
          </button>
          <button
            className={`theme-button ${currentTheme === 'onedark' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('onedark')}
            aria-label="Cambiar a tema One Dark"
          >
            One Dark
          </button>
          <button
            className={`theme-button ${currentTheme === 'solarized' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('solarized')}
            aria-label="Cambiar a tema Solarized"
          >
            Solarized
          </button>
          <button
            className={`theme-button ${currentTheme === 'ayu' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('ayu')}
            aria-label="Cambiar a tema Ayu"
          >
            Ayu
          </button>
          <button
            className={`theme-button ${currentTheme === 'moonfly' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('moonfly')}
            aria-label="Cambiar a tema Moonfly"
          >
            Moonfly
          </button>
          <button
            className={`theme-button ${currentTheme === 'nordic' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('nordic')}
            aria-label="Cambiar a tema Nordic"
          >
            Nordic
          </button>
          <button
            className={`theme-button ${currentTheme === 'sonokai' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('sonokai')}
            aria-label="Cambiar a tema Sonokai"
          >
            Sonokai
          </button>
          <button
            className={`theme-button ${currentTheme === 'miasma' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('miasma')}
            aria-label="Cambiar a tema Miasma"
          >
            Miasma
          </button>
          <button
            className={`theme-button ${currentTheme === 'edge' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('edge')}
            aria-label="Cambiar a tema Edge"
          >
            Edge
          </button>
          <button
            className={`theme-button ${currentTheme === 'oceanic-next' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('oceanic-next')}
            aria-label="Cambiar a tema Oceanic Next"
          >
            Oceanic Next
          </button>
          <button
            className={`theme-button ${currentTheme === 'palenight' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('palenight')}
            aria-label="Cambiar a tema Palenight"
          >
            Palenight
          </button>
          <button
            className={`theme-button ${currentTheme === 'horizon' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('horizon')}
            aria-label="Cambiar a tema Horizon"
          >
            Horizon
          </button>
          <button
            className={`theme-button ${currentTheme === 'nightfly' ? 'theme-button--active' : ''}`}
            onClick={() => switchTheme('nightfly')}
            aria-label="Cambiar a tema Nightfly"
          >
            Nightfly
          </button>
        </div>
      </div>
    </div>
  )
}