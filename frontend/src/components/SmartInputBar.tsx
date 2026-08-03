import { ArrowUp, ScanBarcode, Sparkles, Store, Tag, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { clientSideSuggestions } from '../lib/suggestions'
import type { ListItem, ParsedInput, Suggestion } from '../types'
import './SmartInputBar.css'

const SIGIL_FIELDS: Record<string, 'brand' | 'stores'> = {
  '#': 'brand',
  '@': 'stores',
}

function getActiveSigil(
  raw: string,
): { sigil: string; partial: string } | null {
  const words = raw.split(/\s+/)
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i]
    if (w && '#@+'.includes(w[0])) {
      return { sigil: w[0], partial: w.slice(1) }
    }
  }
  return null
}

function hasSigil(parsed: ParsedInput): boolean {
  return (
    parsed.quantity !== null ||
    parsed.brand !== null ||
    parsed.stores.length > 0
  )
}

const ALL_SIGILS = new Set(['+', '#', '@', '|'])

/**
 * Returns the new input value after a chip tap, or null if no change is needed.
 * - If the input ends with a bare sigil (e.g. "Leche #"), replace it with the new sigil.
 * - Otherwise append the sigil if not already present anywhere in the input.
 */
function sigilChipAction(currentValue: string, sigil: string): string | null {
  const trimmed = currentValue.trimEnd()
  const words = trimmed ? trimmed.split(/\s+/) : []
  const lastWord = words[words.length - 1] ?? ''
  const endsWithBareSigil = lastWord.length === 1 && ALL_SIGILS.has(lastWord)

  if (endsWithBareSigil) {
    if (lastWord === sigil) return null // same chip tapped again, just refocus
    words[words.length - 1] = sigil
    return words.join(' ')
  }

  if (sigil !== '@' && currentValue.includes(sigil)) return null
  const sep = currentValue === '' || currentValue.endsWith(' ') ? '' : ' '
  return currentValue + sep + sigil
}

const LEGEND_CHIPS: { sigil: string; label: string }[] = [
  { sigil: '+', label: 'cant.' },
  { sigil: '#', label: 'marca' },
  { sigil: '@', label: 'tienda' },
  { sigil: '|', label: 'cod. barras' },
]

interface Props {
  value: string
  parsed: ParsedInput
  items: ListItem[]
  suggestions: Suggestion[]
  onChange: (v: string) => void
  onSubmit: () => void
  onSuggestionAdd?: (suggestion: Suggestion) => void
  onClear: () => void
  onScanRequest: () => void
  onEanSearch: (ean: string) => void
  eanLoading?: boolean
  eanError?: string | null
  inferredStoreChip?: string | null
  onDismissInferredStore?: () => void
  dueSuggestionsCount?: number
  onDueSuggestionsOpen?: () => void
}

export function SmartInputBar({
  value,
  parsed,
  items,
  suggestions,
  onChange,
  onSubmit,
  onSuggestionAdd,
  onClear,
  onScanRequest,
  onEanSearch,
  eanLoading,
  eanError,
  inferredStoreChip,
  onDismissInferredStore,
  dueSuggestionsCount,
  onDueSuggestionsOpen,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  // The input's focus proxies "keyboard open": on a touch device the soft
  // keyboard is up exactly while the field is focused. The pill shows only the
  // action you can't take another way right now, so this decides which trailing
  // control appears (5d) — while focused, Enter submits and the send button and
  // scanner both retire.
  const [focused, setFocused] = useState(false)
  const activeSigil = getActiveSigil(value)
  const fieldSigil =
    activeSigil && SIGIL_FIELDS[activeSigil.sigil]
      ? (activeSigil.sigil as '#' | '@')
      : null

  const displaySuggestions = fieldSigil
    ? clientSideSuggestions(
        items,
        SIGIL_FIELDS[fieldSigil],
        activeSigil!.partial,
      )
    : suggestions.slice(0, 5)

  const inEanMode = parsed.ean != null
  const showPreview = !inEanMode && hasSigil(parsed)
  const hasName = parsed.name.trim().length > 0
  const nameError = showPreview && !hasName

  function suggestionLabel(suggestion: string | Suggestion): string {
    return typeof suggestion === 'string' ? suggestion : suggestion.name
  }

  function applySuggestion(suggestion: string | Suggestion) {
    if (!activeSigil) {
      if (typeof suggestion === 'string') {
        onChange(suggestion)
      } else {
        onSuggestionAdd?.(suggestion)
      }
      return
    }
    const words = value.split(/\s+/)
    words[words.length - 1] =
      activeSigil.sigil + suggestionLabel(suggestion) + ' '
    onChange(words.join(' '))
  }

  return (
    <div className="smart-input">
      {(inferredStoreChip || displaySuggestions.length > 0) && (
        <div className="smart-input__suggestions">
          {inferredStoreChip && onDismissInferredStore && (
            <button
              className="smart-input__suggestion smart-input__suggestion--inferred"
              data-testid="inferred-store-chip"
              onClick={onDismissInferredStore}
              type="button"
            >
              <Store size={13} /> {inferredStoreChip}{' '}
              <X size={13} aria-hidden="true" />
            </button>
          )}
          {displaySuggestions.map((s, i) => (
            <button
              key={suggestionLabel(s)}
              className={`smart-input__suggestion${i === 0 ? ' smart-input__suggestion--top' : ''}`}
              onClick={() => applySuggestion(s)}
            >
              {suggestionLabel(s)}
            </button>
          ))}
        </div>
      )}

      {inEanMode && (
        <div className="smart-input__preview" data-testid="ean-preview">
          <span className="smart-input__ean-code">{parsed.ean}</span>
          {eanError ? (
            <span className="smart-input__preview-error">{eanError}</span>
          ) : (
            <>
              {parsed.brand && (
                <span className="smart-input__preview-tag">
                  <Tag size={13} /> {parsed.brand}
                </span>
              )}
              {parsed.stores.map((s) => (
                <span key={s} className="smart-input__preview-tag">
                  <Store size={13} /> {s}
                </span>
              ))}
              <button
                className="smart-input__buscar"
                onClick={() => onEanSearch(parsed.ean!)}
                disabled={!!eanLoading}
                aria-label="Buscar producto"
                type="button"
              >
                {eanLoading ? '…' : 'Buscar'}
              </button>
            </>
          )}
        </div>
      )}

      {!inEanMode && showPreview && (
        <div className="smart-input__preview" data-testid="parse-preview">
          {nameError && (
            <span className="smart-input__preview-error">
              Sin nombre de producto
            </span>
          )}
          {!nameError && (
            <span className="smart-input__preview-name">{parsed.name}</span>
          )}
          {parsed.quantity && (
            <span className="smart-input__preview-qty">{parsed.quantity}</span>
          )}
          {parsed.brand && (
            <span className="smart-input__preview-tag">
              <Tag size={13} /> {parsed.brand}
            </span>
          )}
          {parsed.stores.map((s) => (
            <span key={s} className="smart-input__preview-tag">
              <Store size={13} /> {s}
            </span>
          ))}
        </div>
      )}

      <div className="smart-input__legend">
        {LEGEND_CHIPS.map(({ sigil, label }) => (
          <button
            key={sigil}
            className={`smart-input__chip${sigil === '|' && inEanMode ? ' smart-input__chip--active' : ''}`}
            aria-label={`Añadir ${label}`}
            onClick={() => {
              const newValue = sigilChipAction(value, sigil)
              if (newValue !== null) onChange(newValue)
              inputRef.current?.focus()
            }}
          >
            <b>{sigil}</b> {label}
          </button>
        ))}
      </div>

      <div className="smart-input__row">
        {(dueSuggestionsCount ?? 0) > 0 && (
          <button
            className="smart-input__due-btn"
            onClick={onDueSuggestionsOpen}
            aria-label={`Sugerencias pendientes (${dueSuggestionsCount})`}
            type="button"
          >
            <Sparkles size={18} />
            <span className="smart-input__due-badge">
              {dueSuggestionsCount}
            </span>
          </button>
        )}
        <input
          className="smart-input__field"
          type="text"
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hasName && !inEanMode) onSubmit()
          }}
          placeholder="Añadir producto…"
          aria-label="Añadir producto"
        />
        {/* One trailing control, chosen by what you can't do another way right
            now. mousedown is swallowed so tapping never blurs the field first
            (which would swap the button out from under the tap). */}
        {value === '' ? (
          // Empty: the scanner is the alternate way in — and only while the
          // keyboard is down, because once it's up, typing is the mode.
          !focused && (
            <button
              className="smart-input__scan"
              onClick={onScanRequest}
              onMouseDown={(e) => e.preventDefault()}
              aria-label="Escanear código de barras"
              type="button"
            >
              <ScanBarcode size={20} />
            </button>
          )
        ) : focused ? (
          // Text, keyboard up: Enter sends, so the one thing you can't do
          // another way is wipe the field.
          <button
            className="smart-input__clear"
            onClick={() => {
              onClear()
              inputRef.current?.focus()
            }}
            onMouseDown={(e) => e.preventDefault()}
            aria-label="Borrar"
            type="button"
          >
            <span className="smart-input__clear-icon" aria-hidden="true" />
          </button>
        ) : (
          // Text, keyboard down: Enter is out of reach, so a single accent
          // send button — an up-arrow, not a "+".
          <button
            className="smart-input__add"
            onClick={onSubmit}
            onMouseDown={(e) => e.preventDefault()}
            disabled={!hasName || inEanMode}
            aria-label="Añadir"
            type="button"
          >
            <ArrowUp size={20} strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
