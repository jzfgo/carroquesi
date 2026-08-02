import { CURATED_EMOJIS } from '../lib/curatedEmojis'
import './EmojiPickerSheet.css'
import { Sheet } from './Sheet'

interface Props {
  current: string | null
  onSelect: (emoji: string | null) => void
  onClose: () => void
}

export function EmojiPickerSheet({ current, onSelect, onClose }: Props) {
  return (
    <Sheet
      className="emoji-picker-sheet"
      label="Elegir emoji"
      onClose={onClose}
    >
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
    </Sheet>
  )
}
