import { ChevronDown, Tag } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss'
import type { CloseLine } from '../lib/closeLines'
import { formatPrice } from '../lib/formatPrice'
import { parseInput } from '../lib/parseInput'
import './ResolveLineSheet.css'

interface Props {
  /** The receipt line the matcher could not place. */
  line: CloseLine
  /** The rows of the close sheet no receipt line has claimed yet. */
  candidates: CloseLine[]
  onResolve: (line: CloseLine) => void
  onClose: () => void
}

/** Which of the two answers was given, if either. */
type Answer = { kind: 'row'; key: string } | { kind: 'new' } | null

/**
 * Which product a receipt line was.
 *
 * A line the matcher could not place has two possible causes and the sheet
 * puts them in that order. Either it is something already on this sheet that
 * no line has claimed — usually one tap — or it was never on the list and has
 * to be created.
 *
 * One action for both, because creating is only the step before assigning.
 * The chevron is the way out, and whether the line is saved at all is the
 * row's checkbox on the close sheet.
 */
export function ResolveLineSheet({
  line,
  candidates,
  onResolve,
  onClose,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const swipe = useSwipeToDismiss(sheetRef, onClose)
  const id = useId()

  // Filled from the paper, because most of the time the product's name is
  // already in the printed string and only needs tidying.
  const [typed, setTyped] = useState(line.receiptLine ?? '')
  const [answer, setAnswer] = useState<Answer>(null)

  const parsed = useMemo(() => parseInput(typed), [typed])
  const typedName = parsed.name.trim()

  // Only the brand sigil earns a preview. The amounts come from the paper and
  // the shop is stated once by the close sheet, so a preview of either would
  // show something this sheet then drops.
  const recognised = parsed.brand !== null
  const showPreview = answer?.kind === 'new' && recognised

  const canResolve =
    answer !== null && (answer.kind === 'row' || typedName !== '')

  function handleResolve() {
    if (answer === null || !canResolve) return
    // The paper's own row, keeping its key, its raw string and its amounts.
    // Only the product is being answered. A person said which one, so the row
    // reads as confirmed rather than as another guess.
    const resolved: CloseLine = {
      ...line,
      included: true,
      matchState: 'literal',
    }
    if (answer.kind === 'row') {
      const picked = candidates.find((c) => c.key === answer.key)
      if (!picked) return
      onResolve({
        ...resolved,
        itemId: picked.itemId,
        name: picked.name,
        brand: picked.brand,
        fromCart: picked.fromCart,
      })
      return
    }
    onResolve({
      ...resolved,
      itemId: null,
      name: typedName,
      brand: parsed.brand,
    })
  }

  // The figure the paper printed beside the line, not one worked out from the
  // price. This block is here to be checked against the paper, so every
  // character of it has to be on the paper.
  const figures = [
    line.quantity,
    line.receiptAmount == null ? null : formatPrice(line.receiptAmount),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="rls" ref={sheetRef}>
      <div className="rls__handle" {...swipe} />

      <div className="rls__head">
        <h2 className="rls__title">Asignar producto</h2>
        <button
          type="button"
          className="rls__out"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <ChevronDown size={18} />
        </button>
      </div>

      <div className="rls__paper">
        <span className="rls__raw">{line.receiptLine}</span>
        <span className="rls__figures">{figures}</span>
      </div>

      {candidates.length > 0 && (
        <fieldset className="rls__group">
          <legend className="rls__legend">
            {`Pendientes de asignar · ${candidates.length}`}
          </legend>
          {candidates.map((candidate) => (
            <label className="rls__option" key={candidate.key}>
              <input
                type="radio"
                className="rls__radio"
                name={`${id}-answer`}
                checked={answer?.kind === 'row' && answer.key === candidate.key}
                onChange={() => setAnswer({ kind: 'row', key: candidate.key })}
              />
              <span className="rls__option-name">{candidate.name}</span>
              <span className="rls__option-state">
                {candidate.fromCart ? 'en el carro' : 'sigue en la lista'}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {/* Dimmed once a row is the answer, so the sheet never looks as though
          both are. Nothing is dimmed before either was touched. */}
      <div
        className={`rls__new${answer?.kind === 'row' ? ' rls__new--idle' : ''}`}
      >
        <label className="rls__legend" htmlFor={`${id}-new`}>
          Si no estaba en la lista
        </label>
        {showPreview && (
          <div className="rls__preview" data-testid="parse-preview">
            <span className="rls__preview-name">{parsed.name}</span>
            <span className="rls__preview-tag">
              <Tag size={13} aria-hidden="true" /> {parsed.brand}
            </span>
          </div>
        )}
        <input
          id={`${id}-new`}
          className="rls__field"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            setAnswer({ kind: 'new' })
          }}
        />
      </div>

      <button
        type="button"
        className="rls__assign"
        onClick={handleResolve}
        disabled={!canResolve}
      >
        Asignar
      </button>
    </div>
  )
}
