import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'
import { InviteScreen } from './InviteScreen'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getInvitePreview: vi.fn(),
    acceptInvite: vi.fn(),
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'inv123' }),
  Link: ({
    to,
    className,
    children,
  }: {
    to: string
    className?: string
    children: React.ReactNode
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

const mockGetToken = vi.fn().mockResolvedValue('token')
const authedUser = {
  id: 'u1',
  displayName: 'Alice',
  photoUrl: null,
  email: 'alice@example.com',
  features: [],
}

function mockAuth(user: typeof authedUser | null = authedUser) {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user,
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
    isWaitlisted: false,
  })
}

const previewData = {
  id: 'inv123',
  list_name: 'Compras',
  list_emoji: '🛒',
  invited_by_name: 'Ana',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth()
})

test('shows spinner while loading', () => {
  vi.mocked(api.getInvitePreview).mockReturnValue(new Promise(() => {}))
  render(<InviteScreen />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})

test('shows list name and inviter name in preview', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
  expect(screen.getByText('Invitado por Ana')).toBeInTheDocument()
})

test('shows mascot in preview state', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
  expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
})

test('shows "Unirse a la lista" button when signed in', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Unirse a la lista' }),
    ).toBeInTheDocument(),
  )
})

test('shows "Iniciar sesión para unirse" button when not signed in', async () => {
  mockAuth(null)
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Iniciar sesión para unirse' }),
    ).toBeInTheDocument(),
  )
})

test('accepts invite and navigates to the list on success', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  vi.mocked(api.acceptInvite).mockResolvedValue({ list_id: 'l1' })
  render(<InviteScreen />)
  await waitFor(() => screen.getByRole('button', { name: 'Unirse a la lista' }))
  fireEvent.click(screen.getByRole('button', { name: 'Unirse a la lista' }))
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/lists/l1'))
})

test('calls signIn when not authenticated and button clicked', async () => {
  const mockSignIn = vi.fn().mockResolvedValue(undefined)
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: null,
    getToken: mockGetToken,
    signIn: mockSignIn,
    signOut: vi.fn(),
    loading: false,
    isWaitlisted: false,
  })
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  await waitFor(() =>
    screen.getByRole('button', { name: 'Iniciar sesión para unirse' }),
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Iniciar sesión para unirse' }),
  )
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledOnce())
})

test('shows error message for 404', async () => {
  vi.mocked(api.getInvitePreview).mockRejectedValue(
    new api.ApiError(404, 'Not found'),
  )
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByText('Esta invitación no existe')).toBeInTheDocument(),
  )
  expect(screen.getByText('Ir al inicio \u2192')).toBeInTheDocument()
})

test('shows error message for 410', async () => {
  vi.mocked(api.getInvitePreview).mockRejectedValue(
    new api.ApiError(410, 'Gone'),
  )
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByText('Esta invitación ha expirado')).toBeInTheDocument(),
  )
})

test('shows error message for 409', async () => {
  vi.mocked(api.getInvitePreview).mockRejectedValue(
    new api.ApiError(409, 'Conflict'),
  )
  render(<InviteScreen />)
  await waitFor(() =>
    expect(screen.getByText('La lista ya está llena')).toBeInTheDocument(),
  )
})

test('shows error message for 403 on accept', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  vi.mocked(api.acceptInvite).mockRejectedValue(
    new api.ApiError(403, 'Forbidden'),
  )
  render(<InviteScreen />)
  await waitFor(() => screen.getByRole('button', { name: 'Unirse a la lista' }))
  fireEvent.click(screen.getByRole('button', { name: 'Unirse a la lista' }))
  await waitFor(() =>
    expect(
      screen.getByText('Esta invitación es para otra cuenta'),
    ).toBeInTheDocument(),
  )
})

test('shows network error with retry button, retry re-fetches on success', async () => {
  vi.mocked(api.getInvitePreview)
    .mockRejectedValueOnce(new Error('Network'))
    .mockResolvedValueOnce(previewData)
  render(<InviteScreen />)
  await waitFor(() =>
    expect(
      screen.getByText('No se pudo conectar. Inténtalo de nuevo.'),
    ).toBeInTheDocument(),
  )
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
})

test('shows list emoji from preview instead of hardcoded icon', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue({
    ...previewData,
    list_emoji: '🍎',
  })
  render(<InviteScreen />)
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
  expect(screen.getByText('🍎')).toBeInTheDocument()
})

test('falls back to ShoppingCart icon when list_emoji is null', async () => {
  vi.mocked(api.getInvitePreview).mockResolvedValue({
    ...previewData,
    list_emoji: null,
  })
  const { container } = render(<InviteScreen />)
  await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
  expect(
    container.querySelector('.invite-screen__icon svg'),
  ).toBeInTheDocument()
})

test('renders WaitlistScreen with invite context when isWaitlisted is true', async () => {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: null,
    getToken: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
    isWaitlisted: true,
  })
  vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
  render(<InviteScreen />)
  expect(screen.getByText(/acceso anticipado/i)).toBeInTheDocument()
  // After preview loads, invite context (inviterName + listName) should reach WaitlistScreen
  await waitFor(() => {
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Compras')).toBeInTheDocument()
  })
})
