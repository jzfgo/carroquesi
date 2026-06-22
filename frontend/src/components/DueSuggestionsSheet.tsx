import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import { formatFrequency, formatRecency } from '../lib/suggestions';
import type { DueSuggestion } from '../types';
import './DueSuggestionsSheet.css';

interface Props {
  suggestions: DueSuggestion[];
  onAdd: (s: DueSuggestion) => void;
  onDismiss: (s: DueSuggestion) => void;
  onClose: () => void;
}

export function DueSuggestionsSheet({
  suggestions,
  onAdd,
  onDismiss,
  onClose,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToDismiss(sheetRef, onClose);

  useEffect(() => {
    if (suggestions.length === 0) onClose();
  }, [suggestions.length, onClose]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (suggestions.length === 0) return null;

  return (
    <>
      <div className="due-suggestions-sheet__overlay" onClick={onClose} />
      <div
        className="due-suggestions-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Toca comprar"
        ref={sheetRef}
      >
        <div className="due-suggestions-sheet__handle" {...swipe} />
        <p className="due-suggestions-sheet__title">Toca comprar</p>
        <div className="due-suggestions-sheet__list">
          {suggestions.map((s) => {
            const meta = [s.brand, ...s.stores].filter(Boolean).join(' · ');
            return (
              <div key={s.name} className="due-suggestions-sheet__row">
                <div className="due-suggestions-sheet__info">
                  <div className="due-suggestions-sheet__name">{s.name}</div>
                  {meta && (
                    <div className="due-suggestions-sheet__meta">{meta}</div>
                  )}
                  <div className="due-suggestions-sheet__chips">
                    <span className="due-suggestions-sheet__chip--frequency">
                      {formatFrequency(s.median_interval_days)}
                    </span>
                    <span className="due-suggestions-sheet__chip--recency">
                      {formatRecency(s.days_since_last)}
                    </span>
                    {s.avg_quantity !== null && (
                      <span className="due-suggestions-sheet__chip--quantity">
                        ×{s.avg_quantity}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="due-suggestions-sheet__add"
                  onClick={() => onAdd(s)}
                  aria-label={`Añadir ${s.name}`}
                >
                  + Añadir
                </button>
                <button
                  className="due-suggestions-sheet__dismiss"
                  onClick={() => onDismiss(s)}
                  aria-label={`Ignorar ${s.name}`}
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
