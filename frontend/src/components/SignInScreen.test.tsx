import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignInScreen } from './SignInScreen'
import * as AuthContext from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: null,
    getToken: vi.fn(),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    loading: false,
  })
})

describe('SignInScreen', () => {
  it('renders app name', () => {
    render(<SignInScreen />)
    expect(screen.getByText(/carroquesí/i)).toBeInTheDocument()
  })

  it('renders Google sign-in button', () => {
    render(<SignInScreen />)
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })

  it('calls signIn when button is clicked', () => {
    const mockSignIn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      getToken: vi.fn(),
      signIn: mockSignIn,
      signOut: vi.fn(),
      loading: false,
    })
    render(<SignInScreen />)
    fireEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(mockSignIn).toHaveBeenCalledOnce()
  })

  it('renders mascot image', () => {
    render(<SignInScreen />)
    expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  })
})
