import { Bell, X } from 'lucide-react'
import { useState } from 'react'
import type { PermissionState } from '../lib/push'
import './NotificationPrimingCard.css'

const DISMISSED_KEY = 'push-priming-dismissed'

interface Props {
  canReceive: boolean
  permission: PermissionState
  /** True once the user has created or accepted an invite, or the list has 2+ members. */
  hasSharingIntent: boolean
  isIOS: boolean
  onEnable: () => void
}

/**
 * Priming, not the OS prompt. Notification permission is per-origin and granted
 * once forever, so a premature denial forecloses every list the user will ever
 * join. We ask only after sharing intent is demonstrated.
 */
export function NotificationPrimingCard({
  canReceive,
  permission,
  hasSharingIntent,
  isIOS,
  onEnable,
}: Props) {
  const [dismissed, setDismissed] = useState(() =>
    Boolean(localStorage.getItem(DISMISSED_KEY)),
  )

  if (dismissed || !hasSharingIntent) return null
  if (permission !== 'default' && permission !== 'unsupported') return null
  if (!canReceive && !isIOS) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <aside className="push-priming" role="complementary">
      <div className="push-priming__icon" aria-hidden="true">
        <Bell size={20} />
      </div>
      <div className="push-priming__body">
        {canReceive ? (
          <p className="push-priming__text">
            Te avisamos cuando alguien añada o compre algo en esta lista.
          </p>
        ) : (
          <p className="push-priming__text">
            Añade CarroQueSí a tu <strong>pantalla de inicio</strong> para
            recibir avisos de esta lista.
          </p>
        )}
        {canReceive && (
          <button className="push-priming__cta" onClick={onEnable}>
            Activar avisos
          </button>
        )}
      </div>
      <button
        className="push-priming__dismiss"
        onClick={handleDismiss}
        aria-label="Descartar"
      >
        <X size={18} />
      </button>
    </aside>
  )
}
