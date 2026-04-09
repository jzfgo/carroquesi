import { useEffect, useState } from 'react'
import './ThemeSwitcher.css'

export function ThemeSwitcher() {
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
      'moonfly', 'nordic', 'sonokai', 'miasma', 'edge', 'oceanic-next', 'palenight', 'horizon'
    ].includes(theme)) {
      setCurrentTheme(theme)
      localStorage.setItem('terminal-theme', theme)
      document.documentElement.setAttribute('data-theme', theme)
    }
  }

  return (
    <div className="theme-switcher">
      <div className="theme-switcher__buttons">
        <button
          className={`theme-switcher__button ${currentTheme === 'monokai-pro' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('monokai-pro')}
          aria-label="Cambiar a tema Monokai Pro"
        >
          Monokai Pro
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'catppuccin-mocha' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('catppuccin-mocha')}
          aria-label="Cambiar a tema Catppuccin Mocha"
        >
          Catppuccin
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'everforest' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('everforest')}
          aria-label="Cambiar a tema Everforest"
        >
          Everforest
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'kanagawa' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('kanagawa')}
          aria-label="Cambiar a tema Kanagawa"
        >
          Kanagawa
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'rose-pine' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('rose-pine')}
          aria-label="Cambiar a tema Rose Pine"
        >
          Rose Pine
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'bamboo' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('bamboo')}
          aria-label="Cambiar a tema Bamboo"
        >
          Bamboo
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'melange' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('melange')}
          aria-label="Cambiar a tema Melange"
        >
          Melange
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'tokyo-night' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('tokyo-night')}
          aria-label="Cambiar a tema Tokyo Night"
        >
          Tokyo Night
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'cyberdream' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('cyberdream')}
          aria-label="Cambiar a tema Cyberdream"
        >
          Cyberdream
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'nightfox' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('nightfox')}
          aria-label="Cambiar a tema Nightfox"
        >
          Nightfox
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'oxocarbon' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('oxocarbon')}
          aria-label="Cambiar a tema Oxocarbon"
        >
          Oxocarbon
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'gruvbox' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('gruvbox')}
          aria-label="Cambiar a tema Gruvbox"
        >
          Gruvbox
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'nord' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('nord')}
          aria-label="Cambiar a tema Nord"
        >
          Nord
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'onedark' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('onedark')}
          aria-label="Cambiar a tema One Dark"
        >
          One Dark
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'solarized' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('solarized')}
          aria-label="Cambiar a tema Solarized"
        >
          Solarized
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'ayu' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('ayu')}
          aria-label="Cambiar a tema Ayu"
        >
          Ayu
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'moonfly' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('moonfly')}
          aria-label="Cambiar a tema Moonfly"
        >
          Moonfly
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'nordic' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('nordic')}
          aria-label="Cambiar a tema Nordic"
        >
          Nordic
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'sonokai' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('sonokai')}
          aria-label="Cambiar a tema Sonokai"
        >
          Sonokai
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'miasma' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('miasma')}
          aria-label="Cambiar a tema Miasma"
        >
          Miasma
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'edge' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('edge')}
          aria-label="Cambiar a tema Edge"
        >
          Edge
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'oceanic-next' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('oceanic-next')}
          aria-label="Cambir a tema Oceanic Next"
        >
          Oceanic Next
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'palenight' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('palenight')}
          aria-label="Cambiar a tema Palenight"
        >
          Palenight
        </button>
        <button
          className={`theme-switcher__button ${currentTheme === 'horizon' ? 'theme-switcher__button--active' : ''}`}
          onClick={() => switchTheme('horizon')}
          aria-label="Cambiar a tema Horizon"
        >
          Horizon
        </button>
      </div>
    </div>
  )
}
