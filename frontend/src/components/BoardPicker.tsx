import { BOARD_NAMES, BOARDS, type Board } from '../lib/boards'
import './BoardPicker.css'

interface Props {
  value: Board
  listName: string
  onChange: (board: Board) => void
}

/**
 * Six swatches and one preview. No explanatory line underneath — the block was
 * carrying a sentence about how the board is yours and the mode is your eye's,
 * and rule 20 deleted the need for it: identity and orientation are told apart
 * by where they live, not by a caption.
 *
 * The preview stays, because it is not text. It is the check that the material
 * survives a change of light: it draws the sheet with the active mode's own
 * relief, so a board that looks fine in daylight has to prove itself at night
 * in the same block where you pick it.
 */
export function BoardPicker({ value, listName, onChange }: Props) {
  return (
    <div className="board-picker">
      <span className="board-picker__label" id="board-picker-label">
        Tablero
      </span>
      <div
        className="board-picker__swatches"
        role="radiogroup"
        aria-labelledby="board-picker-label"
      >
        {BOARDS.map((board) => (
          <button
            key={board}
            type="button"
            role="radio"
            aria-checked={board === value}
            aria-label={BOARD_NAMES[board]}
            data-board={board}
            className={`board-picker__swatch${
              board === value ? ' board-picker__swatch--on' : ''
            }`}
            onClick={() => onChange(board)}
          />
        ))}
      </div>
      <div className="board-picker__preview" data-board={value} aria-hidden>
        <div className="board-picker__preview-sheet">
          <span className="board-picker__preview-name">{listName}</span>
        </div>
      </div>
    </div>
  )
}
