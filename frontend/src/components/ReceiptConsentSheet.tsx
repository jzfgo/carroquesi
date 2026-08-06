import { useRef } from 'react'
import { ReceiptConsentBody } from './ReceiptConsentBody'
import { Sheet, type SheetHandle } from './Sheet'

interface Props {
  /** Records the decision; called just before the exit animation. */
  onDecision: (consent: 'granted' | 'declined') => void
  /** Unmount point — the parent drops the sheet here, once the exit ends. */
  onClose: () => void
}

/**
 * The consent disclosure as a standalone bottom sheet, shown on the first
 * scan attempt (consent === null). A choice records the decision and plays
 * the sheet's exit; the parent decides what happens next in onClose (e.g.
 * continuing straight into the scan after a grant).
 */
export function ReceiptConsentSheet({ onDecision, onClose }: Props) {
  const sheetRef = useRef<SheetHandle>(null)
  return (
    <Sheet
      ref={sheetRef}
      className="receipt-consent-sheet"
      label="Escaneo de tickets"
      onClose={onClose}
    >
      <ReceiptConsentBody
        onDecision={(consent) => {
          onDecision(consent)
          sheetRef.current?.close()
        }}
      />
    </Sheet>
  )
}
