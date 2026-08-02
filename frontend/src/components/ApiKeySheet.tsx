import { Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import './ApiKeySheet.css'
import { Sheet, type SheetHandle } from './Sheet'

interface Props {
  /** Plaintext key to display, or null when the user already has one (unrecoverable). */
  apiKey: string | null
  /** Name of the user's default list — where Siri-added items will land. */
  defaultListName?: string | null
  onCopy: () => void
  onImport: () => void
  /** Rotate the key. Resolves once done; the parent updates `apiKey` with the new value. */
  onRegenerate: () => Promise<void>
  onClose: () => void
}

const MASK = '••••••••••••••••'

export function ApiKeySheet({
  apiKey,
  defaultListName,
  onCopy,
  onImport,
  onRegenerate,
  onClose,
}: Props) {
  const sheetRef = useRef<SheetHandle>(null)
  const [confirming, setConfirming] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const cancelConfirm = () => {
    if (!regenerating) setConfirming(false)
  }

  async function handleConfirmRegenerate() {
    setRegenerating(true)
    await onRegenerate()
    setRegenerating(false)
    setConfirming(false)
  }

  return (
    <Sheet
      ref={sheetRef}
      className="api-key-sheet"
      label={confirming ? 'Regenerar clave' : 'Atajo de Siri'}
      onClose={onClose}
      // In the confirm sub-state, dismissing (swipe / scrim / Escape) goes
      // back to the key view rather than closing the whole sheet.
      onDismiss={confirming ? cancelConfirm : undefined}
    >
      {confirming ? (
        <>
          <h2 className="api-key-sheet__title">Regenerar clave</h2>
          <p className="api-key-sheet__warning">
            Se invalidará tu clave actual y tendrás que pegar la nueva en el
            atajo.
          </p>
          <button
            type="button"
            className="api-key-sheet__confirm-btn"
            disabled={regenerating}
            onClick={() => void handleConfirmRegenerate()}
          >
            {regenerating ? 'Regenerando…' : 'Sí, regenerar'}
          </button>
          <button
            type="button"
            className="api-key-sheet__cancel-btn"
            disabled={regenerating}
            onClick={cancelConfirm}
          >
            Cancelar
          </button>
        </>
      ) : (
        <>
          <h2 className="api-key-sheet__title">Atajo de Siri</h2>
          <p className="api-key-sheet__instructions">
            Añade el atajo y pega tu clave en su acción de texto, en la app
            Shortcuts.
          </p>
          {defaultListName && (
            <p className="api-key-sheet__target">
              Los productos se añadirán a <strong>{defaultListName}</strong>.
            </p>
          )}

          <div className="api-key-sheet__key">
            <code>{apiKey ?? MASK}</code>
            {apiKey && (
              <button type="button" onClick={onCopy} aria-label="Copiar clave">
                <Copy size={16} />
              </button>
            )}
          </div>
          {!apiKey && (
            <p className="api-key-sheet__hint">
              Tu clave está oculta. Regenérala para obtener una nueva.
            </p>
          )}

          <button
            type="button"
            className="api-key-sheet__import"
            onClick={onImport}
          >
            Añadir a Shortcuts
          </button>
          <button
            type="button"
            className="api-key-sheet__regenerate"
            onClick={() => setConfirming(true)}
          >
            Regenerar clave
          </button>
          <button
            type="button"
            className="api-key-sheet__close"
            onClick={() => sheetRef.current?.close()}
          >
            Cerrar
          </button>
        </>
      )}
    </Sheet>
  )
}
