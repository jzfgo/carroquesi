import React from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DashboardScreen } from './components/DashboardScreen'
import { InviteScreen } from './components/InviteScreen'
import { ListRoute } from './components/ListRoute'
import { Loading } from './components/Loading'
import { SignInScreen } from './components/SignInScreen'
import { ThemeManager } from './components/ThemeManager'
import { WaitlistScreen } from './components/WaitlistScreen'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext'
import { usePushNavigation } from './hooks/usePushNavigation'
import { IS_WAITLIST_ENABLED } from './lib/environment'

/** Listens for notification taps app-wide; renders nothing. */
function PushNavigation() {
  usePushNavigation()
  return null
}

function AuthRoute({ element }: { element: React.ReactElement }) {
  const { user, loading, isWaitlisted } = useAuth()
  if (loading) return null
  if (isWaitlisted) return <WaitlistScreen />
  if (!user) {
    if (IS_WAITLIST_ENABLED) {
      return <WaitlistScreen />
    }
    return <SignInScreen />
  }
  return element
}

function AppContent() {
  const { user, loading, isWaitlisted } = useAuth()

  if (loading) {
    return <Loading />
  }

  if (isWaitlisted) return <WaitlistScreen />

  if (!user) {
    if (IS_WAITLIST_ENABLED) {
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
            <PushNavigation />
            <Routes>
              <Route path="/invite/:id" element={<InviteScreen />} />
              <Route
                path="/lists/:id"
                element={<AuthRoute element={<ListRoute />} />}
              />
              <Route path="*" element={<AppContent />} />
            </Routes>
          </ThemeManager>
        </FeatureFlagsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
