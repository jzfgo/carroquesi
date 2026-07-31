import { useEffect, useMemo, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import type { QueuedOp } from '../lib/offlineQueue'
import {
  failureCause,
  isRetryable,
  opKind,
  UNLABELLED,
  whenLabel,
} from '../lib/queueCopy'
import './UnsentChangesSheet.css'

interface Props {
  /** The refused ops for this list, oldest first is not assumed. */
  rejected: QueuedOp[]
  onRetry: (ids: string[]) => Promise<void>
  onDiscard: () => Promise<void>
  onClose: () => void
}

interface Row {
  op: QueuedOp
  why: string
  canRetry: boolean
}

/**
 * «Cambios sin enviar» — what the server refused, and where it now waits.
 *
 * Nothing is lost in silence. A rejection is ordinary in a shared app —
 * somebody deleted the product while you were editing it without coverage —
 * and those are exactly the writes somebody typed and does not want back as a
 * number in a notice that left after six seconds.
 *
 * Each line says what it was, when it was and why it did not go in, in the
 * language of the house. Retry is per line because the causes differ and one
 * of them may have resolved itself; discarding is explicit, at the foot.
 */
export function UnsentChangesSheet({
  rejected,
  onRetry,
  onDiscard,
  onClose,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)
  const [busy, setBusy] = useState(false)
  // Read once, when the sheet opens. «hoy» and «ayer» are relative to the
  // moment somebody is reading them, and a clock re-read on every render would
  // move a line from one to the other under their eyes.
  const [now] = useState(() => Date.now())

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Nothing left to answer for. Closing is the only honest state: a sheet
  // titled "unsent changes" with no rows is a screen about nothing.
  useEffect(() => {
    if (rejected.length === 0) onClose()
  }, [rejected.length, onClose])

  const rows = useMemo<Row[]>(() => {
    // An op whose add has not gone through points at a `tmp-…` id the server
    // has never seen. Sending it alone would 404 and come back irrecoverable
    // while the add that would have fixed it is still sitting there. So it is
    // discard-only until the add is dealt with; «Reintentar los N» unmarks
    // everything and drains in one pass, which is where the add goes first.
    const strandedTempIds = new Set(
      rejected.map((op) => op.tempId).filter((id): id is string => Boolean(id)),
    )
    return rejected
      .slice()
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      .map((op) => {
        const status = op.failure?.status ?? 0
        const dependsOnStranded =
          !op.tempId &&
          strandedTempIds.has((op.payload as { itemId?: string })?.itemId ?? '')
        return {
          op,
          why: `${opKind(op)} · ${whenLabel(op.enqueuedAt, now)} · ${failureCause(status, op.type)}`,
          canRetry: isRetryable(status) && !dependsOnStranded,
        }
      })
  }, [rejected, now])

  const retryable = rows.filter((r) => r.canRetry)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="unsent__overlay" onClick={onClose} />
      <div
        className="unsent"
        role="dialog"
        aria-modal="true"
        aria-label="Cambios sin enviar"
        ref={sheetRef}
      >
        <div className="unsent__handle" {...swipe} />
        <div className="unsent__head">
          <h2 className="unsent__title">Cambios sin enviar</h2>
          <p className="unsent__lede">
            El servidor los rechazó. Siguen guardados aquí.
          </p>
        </div>

        <div className="unsent__rows">
          {rows.map(({ op, why, canRetry }) => (
            <div className="unsent__row" key={op.id}>
              <span className="unsent__what">
                <span className="unsent__label">{op.label || UNLABELLED}</span>
                <span className="unsent__why">{why}</span>
              </span>
              {canRetry && (
                <button
                  className="unsent__retry"
                  disabled={busy}
                  onClick={() => void run(() => onRetry([op.id]))}
                >
                  Reintentar
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="unsent__foot">
          {/* Counted against the rows actually drawn with a retry. A button
              offering to retry nothing is not a control (rule 6). */}
          {retryable.length > 0 && (
            <button
              className="unsent__retry-all"
              disabled={busy}
              onClick={() =>
                void run(() => onRetry(retryable.map((r) => r.op.id)))
              }
            >
              {retryable.length === 1
                ? 'Reintentar el cambio'
                : `Reintentar los ${retryable.length}`}
            </button>
          )}
          <button
            className="unsent__discard"
            disabled={busy}
            onClick={() => void run(onDiscard)}
          >
            Descartarlos
          </button>
        </div>
      </div>
    </>
  )
}
