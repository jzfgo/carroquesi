import { useEffect, useMemo, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { HELD_FOR_ADD, targetsOf, type QueuedOp } from '../lib/offlineQueue'
import {
  failureCause,
  isRetryable,
  opKind,
  ORPHANED,
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
  /** Whether this line is offered a retry of its own. */
  canRetry: boolean
  /** Whether «Reintentar los N» sends it. A wider set — see below. */
  inRetryAll: boolean
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
  //
  // Not while a retry is running, though. Clearing a failure is what makes an
  // op sendable, and it announces itself — so the rows empty the instant the
  // retry starts, long before anything has been sent. Closing there would take
  // the sheet away at the moment it is doing its job, and answer with silence
  // followed by a toast if it went wrong.
  useEffect(() => {
    if (rejected.length === 0 && !busy) onClose()
  }, [rejected.length, busy, onClose])

  const rows = useMemo<Row[]>(() => {
    // An op whose add has not gone through points at a `tmp-…` id the server
    // has never seen. Sending it alone would PATCH that id, 404, and come back
    // irrecoverable while the add that would have fixed it is still sitting
    // there — so it gets no retry of its own.
    //
    // It does go out with «Reintentar los N», which is one drain pass: the add
    // runs first, the pass learns its real id, and the dependent is rewritten
    // behind it. Leaving it out of that pass is what would strand it for good,
    // because the add succeeds, stops being here, and the dependent is left
    // pointing at an id nothing can resolve any more.
    const strandedOn = new Map<string, QueuedOp>()
    for (const op of rejected) if (op.tempId) strandedOn.set(op.tempId, op)

    return rejected
      .slice()
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      .map((op) => {
        const status = op.failure?.status ?? 0
        // Every id the op needs — a close names one per line, and it waits on
        // an add for the same reason an edit does. `targetsOf` already answers
        // «nothing» for an add, so there is no second rule about them here.
        const waitingOn = targetsOf(op)
          .map((id) => strandedOn.get(id))
          .filter((waited) => waited !== undefined)

        // Held with nothing that can still resolve it — its add was discarded,
        // or is itself refused for good. Terminal either way: a retry would
        // clear it, drain, be held again, and say the same thing every time it
        // is pressed. An add that can never go in leaves its dependent exactly
        // as stranded as no add at all, so both read the same here.
        //
        // «Every one of them», not «any of them», and the same question
        // `inRetryAll` asks below: a close goes out only when all of its adds
        // land, so one dead add among two strands it exactly as completely as
        // one dead add on its own.
        const canStillLand =
          waitingOn.length > 0 &&
          waitingOn.every((waited) => isRetryable(waited.failure?.status ?? 0))
        const orphaned = status === HELD_FOR_ADD && !canStillLand
        const cause = orphaned ? ORPHANED : failureCause(status, op.type)

        return {
          op,
          why: `${opKind(op)} · ${whenLabel(op.enqueuedAt, now)} · ${cause}`,
          canRetry: isRetryable(status) && !orphaned && waitingOn.length === 0,
          // Sent by the retry-all whenever it can stand on its own, or when
          // *every* add it waits on is going out in the same pass. One close
          // can name two, and one of them being retryable is not enough — the
          // button would be counting a line it could never send.
          inRetryAll:
            isRetryable(status) &&
            !orphaned &&
            waitingOn.every((waited) =>
              isRetryable(waited.failure?.status ?? 0),
            ),
        }
      })
  }, [rejected, now])

  const retryAll = rows.filter((r) => r.inRetryAll)

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
          {/* Counted against what pressing it actually sends. A button
              offering to retry nothing is not a control (rule 6). */}
          {retryAll.length > 0 && (
            <button
              className="unsent__retry-all"
              disabled={busy}
              onClick={() =>
                void run(() => onRetry(retryAll.map((r) => r.op.id)))
              }
            >
              {retryAll.length === 1
                ? 'Reintentar el cambio'
                : `Reintentar los ${retryAll.length}`}
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
