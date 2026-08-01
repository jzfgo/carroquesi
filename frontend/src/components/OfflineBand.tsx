import { useOnline } from '../hooks/useOnline'

/** App-wide band shown while offline; the app is read-only underneath it. */
export function OfflineBand() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="offline-banner offline-banner--sticky" role="status">
      Sin conexión — solo lectura
    </div>
  )
}
