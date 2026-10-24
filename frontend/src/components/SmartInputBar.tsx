import { ArrowUp, ScanBarcode, Store, Tag, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { parseInput } from '../lib/parseInput'
import { clientSideSuggestions } from '../lib/suggestions'
import type { ListItem, ParsedInput, Suggestion } from '../types'
import './SmartInputBar.css'

const SIGIL_FIELDS: Record<string, 'brand' | 'stores'> = {
  '#': 'brand',
  '@': 'stores',
}

// The sigil token the caret is still inside: from the last sigil to the end
// of the input, unless a closed quote has already finished it. Positions are
// kept by masking complete quoted values, so a sigil character inside one
// never counts.
function getActiveSigil(
  raw: string,
): { sigil: string; partial: string; start: number } | null {
  const masked = raw.replace(/"[^"]*"|'[^']*'/g, (m) => 'x'.repeat(m.length))
  const match = /(?:^|\s)([#@+|])(?!.*\s[#@+|])/s.exec(masked)
  if (!match) return null
  const start = match.index + match[0].length - 1
  if (masked.slice(start) !== raw.slice(start)) return null
  return {
    sigil: raw[start],
    partial: raw.slice(start + 1).replace(/^["']/, ''),
    start,
  }
}

// A value with spaces only survives the parser when quoted.
function sigilValue(label: string): string {
  if (!/\s/.test(label)) return label
  const quote = label.includes('"') ? "'" : '"'
  return quote + label + quote
}

function hasSigil(parsed: ParsedInput): boolean {
  return (
    parsed.quantity !== null ||
    parsed.brand !== null ||
    parsed.stores.length > 0
  )
}

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

  // What the input already carries, without the token being typed. The parser
  // keeps only the first brand, so once one is set a second offers nothing.
  const committed = fieldSigil
    ? parseInput(value.slice(0, activeSigil!.start))
    : null

  const displaySuggestions = fieldSigil
    ? fieldSigil === '#' && committed!.brand
      ? []
      : clientSideSuggestions(
          items,
          SIGIL_FIELDS[fieldSigil],
          activeSigil!.partial,
          // A store followed by a space is finished too. The store key ignores
          // spaces, so without this it would still offer itself. Brands skip
          // this: a store's own label (Dia) shares its name.
          fieldSigil === '#'
            ? []
            : /\s$/.test(activeSigil!.partial)
              ? [...committed!.stores, activeSigil!.partial]
              : committed!.stores,
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
    if (!fieldSigil) {
      if (typeof suggestion === 'string') {
        onChange(suggestion)
      } else {
        onSuggestionAdd?.(suggestion)
      }
      return
    }
    onChange(
      value.slice(0, activeSigil!.start) +
        fieldSigil +
        sigilValue(suggestionLabel(suggestion)) +
        ' ',
    )
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

      <div className="smart-input__row">
        <input
          className="smart-input__field"
          type="text"
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hasName) onSubmit()
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
          // send button — an up-arrow, not a "+". A named EAN saves too: the
          // code rides along and gets associated on create.
          <button
            className="smart-input__add"
            onClick={onSubmit}
            onMouseDown={(e) => e.preventDefault()}
            disabled={!hasName}
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
