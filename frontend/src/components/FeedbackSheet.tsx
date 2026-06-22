import { useEffect, useMemo, useRef, useState } from 'react';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import type { FeedbackPayload } from '../lib/api';
import './FeedbackSheet.css';

interface Props {
  defaultEmail: string | null | undefined;
  isSubmitting: boolean;
  onSubmit: (payload: FeedbackPayload) => void;
  onClose: () => void;
}

export function FeedbackSheet({
  defaultEmail,
  isSubmitting,
  onSubmit,
  onClose,
}: Props) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const trimmedMessage = useMemo(() => message.trim(), [message]);
  const canSubmit = trimmedMessage.length > 0 && !isSubmitting;
  const sheetRef = useRef<HTMLFormElement>(null);
  const swipe = useSwipeToDismiss(sheetRef, onClose);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const trimmedEmail = email.trim();
    onSubmit({
      message: trimmedMessage,
      email: trimmedEmail.length > 0 ? trimmedEmail : null,
      source: 'manual',
    });
  }

  return (
    <>
      <div className="feedback-sheet__overlay" onClick={onClose} />
      <form
        className="feedback-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Enviar feedback"
        onSubmit={handleSubmit}
        ref={sheetRef}
      >
        <div className="feedback-sheet__handle" {...swipe} />
        <h2 className="feedback-sheet__title">Enviar feedback</h2>
        <label className="feedback-sheet__field">
          <span>Mensaje</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            placeholder="Cuéntanos qué funciona, qué falla o qué mejorarías"
          />
        </label>
        <label className="feedback-sheet__field">
          <span>Email opcional</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@email.com"
          />
        </label>
        <div className="feedback-sheet__actions">
          <button
            type="button"
            className="feedback-sheet__secondary"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="feedback-sheet__primary"
            disabled={!canSubmit}
          >
            {isSubmitting ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </form>
    </>
  );
}
