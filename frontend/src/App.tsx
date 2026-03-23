import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SignInScreen } from './components/SignInScreen'
import { ListLoader } from './components/ListLoader'

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-primary)',
            animation: 'spin 0.8s linear infinite',
            display: 'block',
          }}
        />
      </div>
    )
  }

  if (!user) return <SignInScreen />
  return <ListLoader />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
