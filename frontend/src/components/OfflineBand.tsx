import { Cloud, CloudOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOnline } from '../hooks/useOnline'
import './OfflineBand.css'

const RECONNECTED_MS = 2000
const EXIT_MS = 300

// hidden → offline → reconnected → leaving → hidden. The reconnected and
// leaving phases exist so the user sees the recovery, not just an absence.
type Phase = 'hidden' | 'offline' | 'reconnected' | 'leaving'

/** App-wide band shown while offline; the app is read-only underneath it. */
export function OfflineBand() {
  const online = useOnline()
  const [phase, setPhase] = useState<Phase>(online ? 'hidden' : 'offline')

  useEffect(() => {
    if (!online) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- phase mirrors an external store transition
      setPhase('offline')
      return
    }
    // Back online: announce it briefly, then slide the band away. The guards
    // make these no-ops when the band was never shown (a cold online start).
    setPhase((prev) => (prev === 'offline' ? 'reconnected' : prev))
    const toLeaving = window.setTimeout(
      () => setPhase((prev) => (prev === 'reconnected' ? 'leaving' : prev)),
      RECONNECTED_MS,
    )
    const toHidden = window.setTimeout(
      () => setPhase((prev) => (prev === 'leaving' ? 'hidden' : prev)),
      RECONNECTED_MS + EXIT_MS,
    )
    return () => {
      window.clearTimeout(toLeaving)
      window.clearTimeout(toHidden)
    }
  }, [online])

  if (phase === 'hidden') return null
  const backOnline = phase !== 'offline'
  const classes = [
    'offline-banner',
    'offline-banner--overlay',
    backOnline ? 'offline-banner--back-online' : '',
    phase === 'leaving' ? 'offline-banner--leaving' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes} role="status">
      {backOnline ? (
        <Cloud size={14} strokeWidth={1.8} aria-hidden />
      ) : (
        <CloudOff size={14} strokeWidth={1.8} aria-hidden />
      )}
      {backOnline ? 'De nuevo en línea' : 'Sin conexión — solo lectura'}
    </div>
  )
}
