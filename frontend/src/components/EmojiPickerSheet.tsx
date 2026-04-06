import { useEffect } from 'react'
import './EmojiPickerSheet.css'
import { CURATED_EMOJIS } from '../lib/curated-emojis'

interface Props {
  current: string | null
  onSelect: (emoji: string | null) => void
  onClose: () => void
}

export function EmojiPickerSheet({ current, onSelect, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <>
      <div className="emoji-picker-sheet__overlay" onClick={onClose} />
      <div
        className="emoji-picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Elegir emoji"
      >
        <div className="emoji-picker-sheet__handle" />
        <p className="emoji-picker-sheet__title">Elegir emoji</p>
        <div className="emoji-picker-sheet__grid">
          <button
            className={`emoji-picker-sheet__item emoji-picker-sheet__item--none${current === null ? ' emoji-picker-sheet__item--active' : ''}`}
            onClick={() => onSelect(null)}
            aria-label="Ninguno"
          >
            ∅
          </button>
          {CURATED_EMOJIS.map(emoji => (
            <button
              key={emoji}
              className={`emoji-picker-sheet__item${emoji === current ? ' emoji-picker-sheet__item--active' : ''}`}
              onClick={() => onSelect(emoji)}
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
