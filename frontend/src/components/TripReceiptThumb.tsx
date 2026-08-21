import { Camera, Receipt } from 'lucide-react'
import { useState } from 'react'
import type { TripReceiptState } from '../hooks/useTripReceipt'

interface Props {
  /** Never `off` here — the card simply does not render the thumb then. */
  state: Exclude<TripReceiptState, { status: 'off' }>
  /** Open the stored paper fullscreen (solid state). */
  onView: () => void
  /** Launch a scan to fill the hole (dashed state). */
  onScan: () => void
}

/**
 * The cuadrito in a purchase header (25b): one hole, two states. Solid with
 * the real miniature when the paper exists; dashed with a camera when it
 * does not — the same «por confirmar» language as inherited prices. Both
 * share one footprint so the header never jumps when a trip gains its paper.
 */
export function TripReceiptThumb({ state, onView, onScan }: Props) {
  // A miniature the bucket cannot serve (upload still in flight, or it
  // failed after the mint) falls back to the receipt icon: the record of
  // the paper exists either way.
  const [broken, setBroken] = useState(false)

  if (state.status === 'empty') {
    return (
      <button
        type="button"
        className="trip-thumb trip-thumb--empty"
        onClick={onScan}
        aria-label="Escanear el ticket"
      >
        <Camera size={15} strokeWidth={1.8} aria-hidden />
      </button>
    )
  }

  const miniature =
    state.status === 'image' && state.thumbUrl != null && !broken
  return (
    <button
      type="button"
      className="trip-thumb trip-thumb--solid"
      onClick={onView}
      disabled={state.status === 'loading'}
      aria-label="Ver el ticket"
    >
      {miniature ? (
        <img
          className="trip-thumb__img"
          src={state.thumbUrl ?? undefined}
          alt=""
          onError={() => setBroken(true)}
        />
      ) : state.status !== 'loading' ? (
        <Receipt size={16} strokeWidth={1.8} aria-hidden />
      ) : null}
      {state.status === 'pdf' && state.pages != null && (
        <span className="trip-thumb__pages">{state.pages}</span>
      )}
    </button>
  )
}
