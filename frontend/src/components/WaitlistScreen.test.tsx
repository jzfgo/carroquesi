import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WaitlistScreen } from './WaitlistScreen'
import * as AuthContext from '../contexts/AuthContext'
import * as Api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  submitWaitlistSignup: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: null,
    getToken: vi.fn(),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    loading: false,
    isWaitlisted: true,
  })
})

describe('WaitlistScreen', () => {
  it('renders application brand logo and early access badge', () => {
    render(<WaitlistScreen />)
    expect(screen.getByLabelText(/carroquesí/i)).toBeInTheDocument()
    expect(screen.getByText(/acceso anticipado/i)).toBeInTheDocument()
  })

  it('validates invalid email format client-side', async () => {
    render(<WaitlistScreen />)
    const input = screen.getByPlaceholderText(/tu@correo.com/i)
    const button = screen.getByRole('button', { name: /apuntarme/i })

    fireEvent.change(input, { target: { value: 'not-valid-email' } })
    fireEvent.click(button)

    expect(await screen.findByText(/introduce un correo válido/i)).toBeInTheDocument()
    expect(Api.submitWaitlistSignup).not.toHaveBeenCalled()
  })

  it('transitions to success state on successful signup', async () => {
    vi.mocked(Api.submitWaitlistSignup).mockResolvedValue({ id: '1', email: 'ok@ok.com', created_at: '2026-06-03' })
    render(<WaitlistScreen />)

    const input = screen.getByPlaceholderText(/tu@correo.com/i)
    const button = screen.getByRole('button', { name: /apuntarme/i })

    fireEvent.change(input, { target: { value: 'ok@ok.com' } })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText(/¡apuntad@!/i)).toBeInTheDocument()
      expect(screen.getByText(/ya estás en la lista/i)).toBeInTheDocument()
    })
  })

  it('calls signIn on Google button click', () => {
    const mockSignIn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      getToken: vi.fn(),
      signIn: mockSignIn,
      signOut: vi.fn(),
      loading: false,
      isWaitlisted: true,
    })

    render(<WaitlistScreen />)
    const googleBtn = screen.getByRole('button', { name: /google/i })
    fireEvent.click(googleBtn)
    expect(mockSignIn).toHaveBeenCalledOnce()
  })
})
