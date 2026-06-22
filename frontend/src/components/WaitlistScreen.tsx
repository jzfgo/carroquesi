import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { submitWaitlistSignup } from '../lib/api';
import { auth } from '../lib/firebase';
import './WaitlistScreen.css';
import { Wordmark } from './Wordmark';

interface WaitlistScreenProps {
  inviteToken?: string;
  inviterName?: string;
  listName?: string;
}

export function WaitlistScreen({
  inviteToken,
  inviterName,
  listName,
}: WaitlistScreenProps = {}) {
  usePageTitle('Acceso anticipado');
  const { signIn, signOut, isWaitlisted } = useAuth();
  const [email, setEmail] = useState(() => auth.currentUser?.email ?? '');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [isAlreadyAllowed, setIsAlreadyAllowed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) return;

    // Simple client side validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg('Introduce un correo válido.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const res = await submitWaitlistSignup(cleanEmail, inviteToken);
      if (res.allowed_at) {
        setIsAlreadyAllowed(true);
      } else {
        setSubmittedEmail(cleanEmail);
      }
    } catch {
      setErrorMsg('Algo fue mal, inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const googleEmail = auth.currentUser?.email;
  const displayError =
    errorMsg ||
    (isWaitlisted && googleEmail
      ? `La cuenta ${googleEmail} no está registrada en el acceso anticipado. Introduce tu correo arriba para apuntarte.`
      : '');

  if (isAlreadyAllowed) {
    return (
      <div className="waitlist" role="status">
        <h1 className="waitlist__title">
          <Wordmark size={56} />
        </h1>
        <span className="waitlist__hand">¡bienvenid@!</span>
        <h2 className="waitlist__success-headline">¡Ya tienes acceso!</h2>
        <p className="waitlist__success-copy">
          Tu correo <strong>{email}</strong> ya está aprobado. Inicia sesión con
          Google para entrar.
        </p>

        <button
          className="waitlist__google-cta"
          onClick={() => void signIn()}
          style={{ marginTop: '2rem' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuar con Google
        </button>

        <button
          className="waitlist__cancel"
          onClick={() => setIsAlreadyAllowed(false)}
          style={{ marginTop: '1rem' }}
        >
          Volver
        </button>
      </div>
    );
  }

  if (submittedEmail) {
    return (
      <div className="waitlist" role="status">
        <h1 className="waitlist__title">
          <Wordmark size={56} />
        </h1>
        <span className="waitlist__hand">¡apuntad@!</span>
        <h2 className="waitlist__success-headline">Ya estás en la lista</h2>
        <p className="waitlist__success-copy">
          {inviteToken && listName ? (
            <>
              Te avisaremos en <strong>{submittedEmail}</strong> cuando puedas
              unirte a <strong>{listName}</strong>.
            </>
          ) : (
            <>
              Te avisaremos en <strong>{submittedEmail}</strong> cuando haya un
              hueco. ¡Gracias por el interés!
            </>
          )}
        </p>
        <button
          className="waitlist__cancel"
          onClick={() => void signOut()}
          style={{ marginTop: '2rem' }}
        >
          Salir
        </button>
      </div>
    );
  }

  return (
    <div className="waitlist">
      <h1 className="waitlist__title">
        <Wordmark size={56} />
      </h1>
      <p className="waitlist__tag">Juntos compramos mejor</p>

      <div className="waitlist__badge">Acceso anticipado</div>

      {inviteToken ? (
        <p className="waitlist__copy">
          {inviterName ? (
            <>
              <strong>{inviterName}</strong> te ha invitado a unirse
              {listName ? (
                <>
                  {' '}
                  a <strong>{listName}</strong>
                </>
              ) : (
                ''
              )}
              . Apúntate y te damos acceso en cuanto podamos.
            </>
          ) : (
            <>
              Has recibido una invitación. Apúntate y te damos acceso en cuanto
              podamos.
            </>
          )}
        </p>
      ) : (
        <p className="waitlist__copy">
          Estamos abriendo poco a poco. Déjanos tu correo y te avisamos en
          cuanto haya un hueco para ti.
        </p>
      )}

      <form className="waitlist__form" onSubmit={handleSubmit} noValidate>
        <input
          type="email"
          className="waitlist__input"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isSubmitting}
          aria-label="Correo electrónico"
          required
        />
        <button
          className="waitlist__cta"
          type="submit"
          disabled={isSubmitting || !email.trim()}
        >
          {isSubmitting ? 'Apuntando...' : 'Apuntarme a la lista'}
        </button>
      </form>

      {displayError && (
        <p className="waitlist__error" role="alert">
          {displayError}
        </p>
      )}

      <div className="waitlist__divider">
        <span>o</span>
      </div>

      <button className="waitlist__google-cta" onClick={() => void signIn()}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          aria-hidden="true"
        >
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        Continuar con Google
      </button>

      {(isWaitlisted || auth.currentUser) && (
        <button className="waitlist__cancel" onClick={() => void signOut()}>
          Salir
        </button>
      )}
    </div>
  );
}
