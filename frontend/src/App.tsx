import React from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DashboardScreen } from './components/DashboardScreen'
import { InviteScreen } from './components/InviteScreen'
import { ListRoute } from './components/ListRoute'
import { SignInScreen } from './components/SignInScreen'
import { ThemeManager } from './components/ThemeManager'
import { WaitlistScreen } from './components/WaitlistScreen'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext'

function AuthRoute({ element }: { element: React.ReactElement }) {
  const { user, loading, isWaitlisted } = useAuth()
  if (loading) return null
  if (isWaitlisted) return <WaitlistScreen />
  if (!user) {
    if (import.meta.env.VITE_WAITLIST_ENABLED === 'true') {
      return <WaitlistScreen />
    }
    return <SignInScreen />
  }
  return element
}

function AppContent() {
  const { user, loading, isWaitlisted } = useAuth()

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

  if (isWaitlisted) return <WaitlistScreen />
  if (!user) {
    if (import.meta.env.VITE_WAITLIST_ENABLED === 'true') {
      return <WaitlistScreen />
    }
    return <SignInScreen />
  }
  return <DashboardScreen />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeatureFlagsProvider>
          <ThemeManager>
            <Routes>
              <Route path="/invite/:id" element={<InviteScreen />} />
              <Route path="/lists/:id" element={<AuthRoute element={<ListRoute />} />} />
              <Route path="*" element={<AppContent />} />
            </Routes>
          </ThemeManager>
        </FeatureFlagsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
