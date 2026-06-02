import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeatureFlagsProvider, useFeatureFlags } from './FeatureFlagsContext'
import * as AuthContext from './AuthContext'
import * as api from '../lib/api'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api')

const mockGetToken = vi.fn().mockResolvedValue('token')

function TestConsumer({ flag }: { flag: string }) {
  const { isEnabled } = useFeatureFlags()
  return <div>{isEnabled(flag) ? 'enabled' : 'disabled'}</div>
}

function makeUser(features: string[] = []) {
  return {
    id: 'u1',
    displayName: 'Alice',
    photoUrl: null,
    email: 'alice@example.com',
    features,
  }
}

describe('FeatureFlagsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: makeUser(),
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for a flag listed in user.features', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: makeUser(['ai_receipt_scanning']),
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })
    render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText('enabled')).toBeInTheDocument()
  })

  it('returns false for a flag not in user.features', () => {
    render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('returns false for a null user', () => {
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })
    render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('polls GET /users/me every 60 s and updates flags', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ features: ['ai_receipt_scanning'] } as never)

    render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )
    expect(screen.getByText('disabled')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    expect(screen.getByText('enabled')).toBeInTheDocument()
  })

  it('stops polling after sign-out (user becomes null)', async () => {
    vi.mocked(api.getMe).mockResolvedValue({ features: ['ai_receipt_scanning'] } as never)

    const { rerender } = render(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )

    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      getToken: mockGetToken,
      signIn: vi.fn(),
      signOut: vi.fn(),
      loading: false,
    })

    rerender(
      <FeatureFlagsProvider>
        <TestConsumer flag="ai_receipt_scanning" />
      </FeatureFlagsProvider>,
    )

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })

    // getMe should NOT have been called after sign-out
    expect(vi.mocked(api.getMe)).not.toHaveBeenCalled()
  })
})
