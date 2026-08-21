import { ChevronRight } from 'lucide-react'
import { useSwipeToDismissRow } from '../hooks/useSwipeToDismissRow'
import { formatFrequency, formatLastPurchase } from '../lib/suggestions'
import type { DueSuggestion } from '../types'
import './SuggestionRow.css'

interface Props {
  suggestion: DueSuggestion
  /** Writes the suggestion onto the list (avg qty applied) — the accept tap. */
  onAdd: (s: DueSuggestion) => void
  /** «No este mes»: records a dismissal TTL and drops the row — the swipe. */
  onDismiss: (s: DueSuggestion) => void
}

/**
 * A single "Sueles comprar" row (handoff 20b) — a line the house hasn't written
 * yet. It borrows the in-cart row's muted voice: the household's hand in
 * `--ink-2`, no price. What marks it as a suggestion rather than a product is
 * the *dashed* circle; there is no `+`/`×` icon, because inside the paper there
 * is only ink (DESIGN.md, Grayscale Ink Rule).
 *
 * The whole visible row is the accept target — tapping "writes it": the circle
 * fills and the item jumps up into its store group (the caller's reactive
 * re-render). Dismissal is a horizontal swipe (`useSwipeToDismissRow`), with a
 * visually-hidden button so it stays keyboard/AT-reachable while the paper
 * keeps no visible control for it.
 */
export function SuggestionRow({ suggestion, onAdd, onDismiss }: Props) {
  const swipe = useSwipeToDismissRow(() => onDismiss(suggestion))

  // The two current chips fused into one meta line, using the same helpers the
  // old sheet did — «CADA SEMANA · LA ÚLTIMA HACE 9 DÍAS» (uppercased in CSS).
  const meta = `${formatFrequency(suggestion.median_interval_days)} · ${formatLastPurchase(
    suggestion.days_since_last,
  )}`

  return (
    <div
      className={`suggestion-row${swipe.dismissing ? ' suggestion-row--dismissing' : ''}`}
      style={swipe.style}
      // While sliding out the row is spent — hide it from AT so a dismissed
      // suggestion is never read as still actionable.
      aria-hidden={swipe.dismissing || undefined}
      {...swipe.handlers}
    >
      <button
        type="button"
        className="suggestion-row__accept"
        onClick={() => onAdd(suggestion)}
        aria-label={`Añadir ${suggestion.name}`}
      >
        <span className="suggestion-row__circle" aria-hidden />
        <span className="suggestion-row__text">
          <span className="suggestion-row__name">{suggestion.name}</span>
          <span className="suggestion-row__meta">{meta}</span>
        </span>
        <ChevronRight
          size={16}
          className="suggestion-row__chevron"
          aria-hidden
        />
      </button>
      <button
        type="button"
        className="suggestion-row__dismiss-sr"
        onClick={() => onDismiss(suggestion)}
      >
        Descartar sugerencia
      </button>
    </div>
  )
}
