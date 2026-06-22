import { useEffect, useRef } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import { CURATED_EMOJIS } from '../lib/curatedEmojis'
import './EmojiPickerSheet.css'

interface Props {
  current: string | null
  onSelect: (emoji: string | null) => void
  onClose: () => void
}

export function EmojiPickerSheet({ current, onSelect, onClose }: Props) {
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
      <div className="emoji-picker-sheet__overlay" onClick={onClose} />
      <div
        className="emoji-picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Elegir emoji"
        ref={sheetRef}
      >
        <div className="emoji-picker-sheet__handle" {...swipe} />
        <p className="emoji-picker-sheet__title">Elegir emoji</p>
        <div className="emoji-picker-sheet__grid">
          <button
            className={`emoji-picker-sheet__item emoji-picker-sheet__item--none${current === null ? ' emoji-picker-sheet__item--active' : ''}`}
            onClick={() => onSelect(null)}
            aria-label="Ninguno"
          >
            ∅
          </button>
          {CURATED_EMOJIS.map((emoji) => (
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
