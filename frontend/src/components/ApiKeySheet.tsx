import { Copy } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import './ApiKeySheet.css'

interface Props {
  apiKey: string
  onCopy: () => void
  onClose: () => void
}

export function ApiKeySheet({ apiKey, onCopy, onClose }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      <div className="api-key-sheet__overlay" onClick={onClose} />
      <div
        className="api-key-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Clave de API"
        ref={sheetRef}
      >
        <div className="api-key-sheet__handle" {...swipe} />
        <h2 className="api-key-sheet__title">Tu clave de API</h2>
        <p className="api-key-sheet__instructions">
          Pega esta clave en la acción de texto del Atajo, en la app
          Shortcuts.
        </p>
        <div className="api-key-sheet__key">
          <code>{apiKey}</code>
          <button type="button" onClick={onCopy} aria-label="Copiar clave">
            <Copy size={16} />
          </button>
        </div>
        <button type="button" className="api-key-sheet__close" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </>
  )
}
