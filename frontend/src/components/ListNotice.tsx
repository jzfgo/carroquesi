import { CircleAlert, CloudOff } from 'lucide-react'
import './ListNotice.css'

interface Props {
  isOffline: boolean
  /** Writes still on their way out. */
  pendingCount: number
  /** Writes the server refused, which are going nowhere on their own. */
  rejectedCount: number
  onShowRejected: () => void
}

/**
 * What this list has to say about itself, under its own rubric.
 *
 * A shopping list with no signal is not broken — the supermarket is where
 * there is no coverage — so nothing here is red, nothing is a diagnostic and
 * nothing offers a retry: the queue drains itself when the network is back,
 * and a button would pretend somebody has to press it.
 */
export function ListNotice({
  isOffline,
  pendingCount,
  rejectedCount,
  onShowRejected,
}: Props) {
  if (!isOffline && rejectedCount === 0) return null

  return (
    <div className="list-notice">
      {isOffline && (
        <div className="list-notice__row" role="status">
          <CloudOff size={14} strokeWidth={1.8} aria-hidden />
          <span>Sin conexión{offlinePromise(pendingCount)}</span>
        </div>
      )}
      {/* A refused write outlives the outage that caused it, so this shows
          with or without a connection. Without it the only way back to those
          writes is a notice that leaves after six seconds, which is the
          disappearance the sheet exists to end. */}
      {rejectedCount > 0 && (
        <div className="list-notice__row list-notice__row--rejected">
          <CircleAlert size={14} strokeWidth={1.8} aria-hidden />
          <span>
            {rejectedCount === 1
              ? '1 cambio sin enviar'
              : `${rejectedCount} cambios sin enviar`}
          </span>
          <button className="list-notice__cta" onClick={onShowRejected}>
            Ver cuáles
          </button>
        </div>
      )}
    </div>
  )
}

/** A promise, not a count of trouble. Nothing queued, nothing to promise. */
function offlinePromise(pendingCount: number): string {
  if (pendingCount === 0) return ''
  return pendingCount === 1
    ? ' · 1 cambio se enviará solo'
    : ` · ${pendingCount} cambios se enviarán solos`
}
