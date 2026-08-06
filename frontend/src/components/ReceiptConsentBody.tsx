import { Receipt } from 'lucide-react'
import './ReceiptConsent.css'

interface Props {
  /** Records the user's decision. */
  onDecision: (consent: 'granted' | 'declined') => void
  /** Disables the buttons while a decision is being written. */
  busy?: boolean
}

/**
 * The receipt-scanning disclosure: honest about the AI read and the stored
 * file, then two ways out. Presentational — the caller records the decision.
 * It is rendered inside its own Sheet from the scan gate
 * (ReceiptConsentSheet) and swapped into the settings sheet when the toggle
 * is turned on, so it never mounts a second sheet of its own.
 */
export function ReceiptConsentBody({ onDecision, busy = false }: Props) {
  return (
    <div className="receipt-consent">
      <span className="receipt-consent__icon" aria-hidden="true">
        <Receipt size={22} />
      </span>
      <h2 className="receipt-consent__title">Escaneo de tickets</h2>
      <p className="receipt-consent__body">
        Para leer un ticket, enviamos la foto o el PDF a la IA de Google
        (Gemini), que saca los productos y sus precios. Guardamos el ticket para
        que puedas volver a verlo.
      </p>
      <p className="receipt-consent__body">
        Puedes desactivarlo cuando quieras en Ajustes.
      </p>
      <button
        type="button"
        className="receipt-consent__accept"
        disabled={busy}
        onClick={() => onDecision('granted')}
      >
        Activar escaneo
      </button>
      <button
        type="button"
        className="receipt-consent__decline"
        disabled={busy}
        onClick={() => onDecision('declined')}
      >
        Ahora no
      </button>
    </div>
  )
}
