import { useRef } from 'react'
import { clientSideSuggestions } from '../lib/suggestions'
import type { ListItem, ParsedInput } from '../types'
import './SmartInputBar.css'

const SIGIL_FIELDS: Record<string, 'brand' | 'stores'> = {
  '#': 'brand', '@': 'stores',
}

function getActiveSigil(raw: string): { sigil: string; partial: string } | null {
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
  return parsed.quantity !== null || parsed.brand !== null || parsed.stores.length > 0
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
  suggestions: string[]
  onChange: (v: string) => void
  onSubmit: () => void
  onClear: () => void
  onScanRequest: () => void
  onEanSearch: (ean: string) => void
  eanLoading?: boolean
  eanError?: string | null
  inferredStoreChip?: string | null
  onDismissInferredStore?: () => void
}

export function SmartInputBar({ value, parsed, items, suggestions, onChange, onSubmit, onClear, onScanRequest, onEanSearch, eanLoading, eanError, inferredStoreChip, onDismissInferredStore }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const activeSigil = getActiveSigil(value)
  const fieldSigil = activeSigil && SIGIL_FIELDS[activeSigil.sigil]
    ? activeSigil.sigil as '#' | '@'
    : null

  const displaySuggestions = fieldSigil
    ? clientSideSuggestions(items, SIGIL_FIELDS[fieldSigil], activeSigil!.partial)
    : suggestions.slice(0, 5)

  const inEanMode = parsed.ean != null
  const showPreview = !inEanMode && hasSigil(parsed)
  const hasName = parsed.name.trim().length > 0
  const nameError = showPreview && !hasName

  function applySuggestion(suggestion: string) {
    if (!activeSigil) {
      onChange(suggestion)
      return
    }
    const words = value.split(/\s+/)
    words[words.length - 1] = activeSigil.sigil + suggestion + ' '
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
              🏪 {inferredStoreChip} <span aria-hidden="true">✕</span>
            </button>
          )}
          {displaySuggestions.map((s, i) => (
            <button key={s} className={`smart-input__suggestion${i === 0 ? ' smart-input__suggestion--top' : ''}`}
              onClick={() => applySuggestion(s)}>
              {s}
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
              {parsed.brand && <span className="smart-input__preview-tag">🏷️ {parsed.brand}</span>}
              {parsed.stores.map(s => (
                <span key={s} className="smart-input__preview-tag">🏪 {s}</span>
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
          {nameError && <span className="smart-input__preview-error">Sin nombre de producto</span>}
          {!nameError && <span className="smart-input__preview-name">{parsed.name}</span>}
          {parsed.quantity && <span className="smart-input__preview-qty">{parsed.quantity}</span>}
          {parsed.brand && <span className="smart-input__preview-tag">🏷️ {parsed.brand}</span>}
          {parsed.stores.map(s => (
            <span key={s} className="smart-input__preview-tag">🏪 {s}</span>
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
        <input
          className="smart-input__field"
          type="text"
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && hasName && !inEanMode) onSubmit() }}
          placeholder="Añadir producto…"
          aria-label="Añadir producto"
        />
        {value ? (
          <button
            className="smart-input__clear"
            onClick={() => { onClear(); inputRef.current?.focus() }}
            aria-label="Borrar"
            type="button"
          >
            <span className="smart-input__clear-icon" aria-hidden="true" />
          </button>
        ) : (
          <button
            className="smart-input__scan"
            onClick={onScanRequest}
            aria-label="Escanear código de barras"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="0" y="2" width="1" height="20" />
              <rect x="2" y="2" width="2" height="20" />
              <rect x="5" y="2" width="1" height="20" />
              <rect x="7" y="2" width="1" height="20" />
              <rect x="9" y="2" width="2" height="20" />
              <rect x="12" y="2" width="1" height="20" />
              <rect x="14" y="2" width="2" height="20" />
              <rect x="17" y="2" width="1" height="20" />
              <rect x="19" y="2" width="1" height="20" />
              <rect x="21" y="2" width="2" height="20" />
            </svg>
          </button>
        )}
        <button
          className="smart-input__add"
          onClick={onSubmit}
          disabled={!hasName || inEanMode}
          aria-label="Añadir"
        >
          <span aria-hidden="true" className="smart-input__add-icon" />
        </button>
      </div>
    </div>
  )
}
