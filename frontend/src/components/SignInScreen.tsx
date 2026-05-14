import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { Mascot } from './Mascot'

export function SignInScreen() {
  usePageTitle()
  const { signIn } = useAuth()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        gap: '1.5rem',
        padding: '2rem',
      }}
    >
      <Mascot size={160} />
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>CarroQueSí</h1>
      <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
        Lista de compras compartida
      </p>
      <button
        onClick={() => void signIn()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: 500,
        }}
      >
        Continuar con Google
      </button>
    </div>
  )
}
