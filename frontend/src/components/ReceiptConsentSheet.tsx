import { useImperativeHandle, useRef } from 'react'
import { ReceiptConsentBody } from './ReceiptConsentBody'
import { Sheet, type SheetHandle } from './Sheet'

export interface ReceiptConsentSheetHandle {
  /** Plays the exit animation, then unmounts via onClose. */
  close: () => void
}

interface Props {
  /** Records the decision. The parent plays the exit once the write resolves. */
  onDecision: (consent: 'granted' | 'declined') => void
  /** Unmount point — the parent drops the sheet here, once the exit ends. */
  onClose: () => void
  /** Disables the actions while the decision is being written. */
  busy?: boolean
  ref?: React.Ref<ReceiptConsentSheetHandle>
}

/**
 * The consent disclosure as a standalone bottom sheet, shown on the first
 * scan attempt (consent === null) or after a prior decline. A choice is
 * reported up but the sheet stays put until the parent has persisted it: the
 * parent disables the actions (busy) during the write and calls close() only
 * once it succeeds. So a failed write leaves the sheet open to retry, and the
 * source picker can never open on the exit animation ahead of a consent that
 * was never saved.
 */
export function ReceiptConsentSheet({
  onDecision,
  onClose,
  busy = false,
  ref,
}: Props) {
  const sheetRef = useRef<SheetHandle>(null)
  useImperativeHandle(
    ref,
    () => ({ close: () => sheetRef.current?.close() }),
    [],
  )
  return (
    <Sheet
      ref={sheetRef}
      className="receipt-consent-sheet"
      label="Escaneo de tickets"
      onClose={onClose}
    >
      <ReceiptConsentBody busy={busy} onDecision={onDecision} />
    </Sheet>
  )
}
