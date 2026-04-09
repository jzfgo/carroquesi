import { useEffect, useState } from 'react'

export function ThemeManager({ children }: { children: React.ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('terminal-theme')
    // If no saved theme, default to monokai-pro
    if (savedTheme && [
      'monokai-pro',
      'catppuccin-mocha', 'everforest', 'kanagawa', 'rose-pine', 'bamboo', 'melange',
      'tokyo-night', 'cyberdream', 'nightfox', 'oxocarbon',
      'gruvbox', 'nord', 'onedark', 'solarized', 'ayu',
      'moonfly', 'nordic', 'sonokai', 'miasma', 'edge', 'oceanic-next', 'palenight', 'horizon', 'nightfly'
    ].includes(savedTheme)) {
      return savedTheme
    }
    return 'monokai-pro'
  })

  useEffect(() => {
    // Apply theme to root element
    const root = document.documentElement
    root.setAttribute('data-theme', currentTheme)

    // Save theme preference
    localStorage.setItem('terminal-theme', currentTheme)
  }, [currentTheme])

  const switchTheme = (theme: string) => {
    if ([
      'monokai-pro',
      'catppuccin-mocha', 'everforest', 'kanagawa', 'rose-pine', 'bamboo', 'melange',
      'tokyo-night', 'cyberdream', 'nightfox', 'oxocarbon',
      'gruvbox', 'nord', 'onedark', 'solarized', 'ayu',
      'moonfly', 'nordic', 'sonokai', 'miasma', 'edge', 'oceanic-next', 'palenight', 'horizon', 'nightfly'
    ].includes(theme)) {
      setCurrentTheme(theme)
    }
  }

  return (
    <div className="theme-manager">
      {children}
    </div>
  )
}
