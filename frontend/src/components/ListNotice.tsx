import { CircleAlert } from 'lucide-react'
import './ListNotice.css'

interface Props {
  /** Writes the server refused, which are going nowhere on their own. */
  rejectedCount: number
  onShowRejected: () => void
}

/**
 * What this list has to say about itself, under its own rubric.
 *
 * Not whether there is a signal — that belongs to the device rather than to
 * this list, and `OfflineBand` says it once for the whole app, above the
 * router, where no sheet can cover it and no scroll can carry it away. This
 * used to say it too, in the same words, and only while the top of the list
 * happened to be on screen.
 */
export function ListNotice({ rejectedCount, onShowRejected }: Props) {
  if (rejectedCount === 0) return null

  return (
    <div className="list-notice">
      {/* A refused write outlives the outage that caused it, so this shows
          with or without a connection. Without it the only way back to those
          writes is a notice that leaves after six seconds, which is the
          disappearance the sheet exists to end. */}
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
    </div>
  )
}
