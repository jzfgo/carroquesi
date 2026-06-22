import { X } from 'lucide-react'
import { useState } from 'react'
import './InstallBanner.css'

const DISMISSED_KEY = 'pwa-install-dismissed'

interface Props {
  isInstallable: boolean
  isInstalled: boolean
  isIOS: boolean
  promptInstall: () => Promise<void>
}

export function InstallBanner({ isInstallable, isInstalled, isIOS, promptInstall }: Props) {
  const [dismissed, setDismissed] = useState(() => Boolean(localStorage.getItem(DISMISSED_KEY)))

  if (isInstalled || dismissed || (!isInstallable && !isIOS)) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <aside className="install-banner" role="complementary">
      <div className="install-banner__icon" aria-hidden="true">CQ</div>
      <p className="install-banner__text">
        {isIOS ? (
          <>Toca <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong></>
        ) : (
          <>Instala <strong>CarroQueSí</strong> en tu pantalla de inicio</>
        )}
      </p>
      {!isIOS && (
        <button className="install-banner__cta" onClick={() => void promptInstall()}>
          Instalar
        </button>
      )}
      <button className="install-banner__dismiss" aria-label="Cerrar" onClick={handleDismiss}>
        <X size={16} />
      </button>
    </aside>
  )
}
