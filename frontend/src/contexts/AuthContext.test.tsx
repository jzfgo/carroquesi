import { act, render, screen, waitFor } from '@testing-library/react'
import type { User as FirebaseUser } from 'firebase/auth'
import * as FirebaseAuth from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Api from '../lib/api'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  getIdToken: vi.fn(async () => 'token'),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}))

// A local .env may turn on the dev auth bypass, which skips Firebase.
vi.mock('../lib/environment', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DEV_USER_ID: undefined,
}))

vi.mock('../lib/firebase', () => ({
  getFirebaseAuth: vi.fn(() => ({})),
}))

vi.mock('../lib/push', () => ({
  syncPushToken: vi.fn(async () => undefined),
  disablePush: vi.fn(async () => undefined),
}))

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  syncUser: vi.fn(),
}))

const ALICE = { uid: 'fb-alice' } as FirebaseUser
const SYNCED = {
  id: 'u1',
  display_name: 'Alice',
  photo_url: null,
  email: 'alice@example.com',
  features: [],
  receipt_consent: null,
}

let emitAuth: (user: FirebaseUser | null) => void

function Probe() {
  const { user, loading, isWaitlisted } = useAuth()
  if (loading) return <p>loading</p>
  if (isWaitlisted) return <p>waitlisted</p>
  return <p>{user ? `user:${user.displayName}` : 'no-user'}</p>
}

function renderSignedIn(fbUser: FirebaseUser = ALICE) {
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  act(() => emitAuth(fbUser))
  return view
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(FirebaseAuth.onAuthStateChanged).mockImplementation(((
    _auth: unknown,
    cb: (user: FirebaseUser | null) => void,
  ) => {
    emitAuth = cb
    return () => undefined
  }) as typeof FirebaseAuth.onAuthStateChanged)
  vi.mocked(FirebaseAuth.getIdToken).mockResolvedValue('token')
})

describe('AuthProvider', () => {
  it('paints the last confirmed profile when a cold start cannot reach the server', async () => {
    vi.mocked(Api.syncUser).mockResolvedValueOnce(SYNCED)
    const first = renderSignedIn()
    await screen.findByText('user:Alice')
    first.unmount()

    vi.mocked(Api.syncUser).mockRejectedValue(new TypeError('Failed to fetch'))
    renderSignedIn()

    expect(await screen.findByText('user:Alice')).toBeInTheDocument()
    expect(screen.queryByText('waitlisted')).not.toBeInTheDocument()
    expect(screen.queryByText('no-user')).not.toBeInTheDocument()
  })

  it('keeps loading rather than dropping to signed-out when offline with no cached profile', async () => {
    vi.mocked(Api.syncUser).mockRejectedValue(new TypeError('Failed to fetch'))
    renderSignedIn()

    await waitFor(() => expect(Api.syncUser).toHaveBeenCalled())
    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('retries the sync and lets the user in once the server answers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const syncUser = vi.mocked(Api.syncUser)
    syncUser.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    syncUser.mockResolvedValueOnce(SYNCED)
    renderSignedIn()

    await waitFor(() => expect(syncUser).toHaveBeenCalledTimes(1))
    await act(() => vi.advanceTimersByTimeAsync(5000))

    expect(await screen.findByText('user:Alice')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('ignores a cached profile that belongs to another account', async () => {
    vi.mocked(Api.syncUser).mockResolvedValueOnce(SYNCED)
    renderSignedIn()
    await screen.findByText('user:Alice')

    vi.mocked(Api.syncUser).mockRejectedValue(new TypeError('Failed to fetch'))
    act(() => emitAuth({ uid: 'fb-bob' } as FirebaseUser))

    await waitFor(() => expect(Api.syncUser).toHaveBeenCalledTimes(2))
    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('still shows the waitlist when the server says so', async () => {
    vi.mocked(Api.syncUser).mockRejectedValue(
      new Api.ApiError(403, JSON.stringify({ detail: 'waitlist' })),
    )
    renderSignedIn()

    expect(await screen.findByText('waitlisted')).toBeInTheDocument()
  })

  it('drops the cached profile when the server refuses the user', async () => {
    vi.mocked(Api.syncUser).mockResolvedValueOnce(SYNCED)
    renderSignedIn()
    await screen.findByText('user:Alice')

    vi.mocked(Api.syncUser).mockRejectedValueOnce(new Api.ApiError(401, ''))
    act(() => emitAuth(ALICE))
    await screen.findByText('no-user')

    vi.mocked(Api.syncUser).mockRejectedValue(new TypeError('Failed to fetch'))
    act(() => emitAuth(ALICE))
    await waitFor(() => expect(Api.syncUser).toHaveBeenCalledTimes(3))
    expect(screen.getByText('loading')).toBeInTheDocument()
  })
})
