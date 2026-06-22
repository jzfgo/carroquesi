import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'
import { ListMembersSheet, type BackendMember } from './ListMembersSheet'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return {
    ...actual,
    getListMembers: vi.fn(),
    removeMember: vi.fn(),
    createOpenInvite: vi.fn(),
  }
})

const mockGetToken = vi.fn().mockResolvedValue('token')

const ALICE: BackendMember = {
  id: 'lm1', user_id: 'u1', list_id: 'l1',
  display_name: 'Alice', photo_url: null, created_at: '',
}
const BOB: BackendMember = {
  id: 'lm2', user_id: 'u2', list_id: 'l1',
  display_name: 'Bob', photo_url: null, created_at: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com', features: [] },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
    isWaitlisted: false,
  })
})

test('shows spinner while loading', () => {
  vi.mocked(api.getListMembers).mockReturnValue(new Promise(() => { }))
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
})

test('shows error and retry button when fetch fails', async () => {
  vi.mocked(api.getListMembers).mockRejectedValue(new Error('net'))
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  expect(await screen.findByText(/no se pudieron cargar/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
})

test('renders member list after fetch', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  expect(await screen.findByText(/Alice/)).toBeInTheDocument()
  expect(screen.getByText('Bob')).toBeInTheDocument()
})

test('owner is sole member — no Expulsar buttons', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  await screen.findByText(/Alice/)
  expect(screen.queryByRole('button', { name: /expulsar/i })).not.toBeInTheDocument()
})

test('owner row has no action button', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  await screen.findByText(/Alice/)
  expect(screen.queryByRole('button', { name: /expulsar a alice/i })).not.toBeInTheDocument()
})

test('owner sees Expulsar on other members', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  expect(await screen.findByRole('button', { name: /expulsar a bob/i })).toBeInTheDocument()
})

test('non-owner sees Salir on own row only', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u2" isOwner={false} onClose={vi.fn()} />)
  expect(await screen.findByRole('button', { name: /salir de la lista/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /expulsar/i })).not.toBeInTheDocument()
})

test('non-owner does not see action on other members', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  render(<ListMembersSheet listId="l1" currentUserId="u2" isOwner={false} onClose={vi.fn()} />)
  await screen.findByText('Alice')
  expect(screen.queryByRole('button', { name: /expulsar a alice/i })).not.toBeInTheDocument()
})

test('Expulsar removes member optimistically and calls DELETE', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockResolvedValue(null)
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /expulsar a bob/i }))
  await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument())
  expect(api.removeMember).toHaveBeenCalledWith(mockGetToken, 'l1', 'u2')
})

test('Salir removes current user from list', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockResolvedValue(null)
  render(<ListMembersSheet listId="l1" currentUserId="u2" isOwner={false} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /salir de la lista/i }))
  await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument())
  expect(api.removeMember).toHaveBeenCalledWith(mockGetToken, 'l1', 'u2')
})

test('remove failure reverts member list and shows toast', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE, BOB])
  vi.mocked(api.removeMember).mockRejectedValue(new Error('fail'))
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /expulsar a bob/i }))
  expect(await screen.findByText('Bob')).toBeInTheDocument()
  expect(screen.getByText(/no se pudo eliminar/i)).toBeInTheDocument()
})

test('copy invite success writes to clipboard and shows toast', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockResolvedValue({ id: 'inv-123' })
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/i/inv-123'))
  )
  expect(await screen.findByText(/enlace copiado/i)).toBeInTheDocument()
})

test('invite limit reached shows message and disables button', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockRejectedValue(new api.ApiError(429, 'Too many'))
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  expect(await screen.findByText(/límite de invitaciones/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /copiar enlace/i })).toBeDisabled()
})

test('clipboard unavailable shows fallback URL input', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  vi.mocked(api.createOpenInvite).mockResolvedValue({ id: 'inv-456' })
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockRejectedValue(new Error('no clipboard')) },
    writable: true,
    configurable: true,
  })
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /copiar enlace/i }))
  expect(
    await screen.findByRole('textbox', { name: /enlace de invitación/i })
  ).toBeInTheDocument()
})

test('invite button hidden when list has 5 members', async () => {
  const fiveMembers: BackendMember[] = Array.from({ length: 5 }, (_, i) => ({
    id: `lm${i}`, user_id: `u${i}`, list_id: 'l1',
    display_name: `User ${i}`, photo_url: null, created_at: '',
  }))
  vi.mocked(api.getListMembers).mockResolvedValue(fiveMembers)
  render(<ListMembersSheet listId="l1" currentUserId="u0" isOwner={true} onClose={vi.fn()} />)
  await screen.findByText(/User 0/)
  expect(screen.queryByRole('button', { name: /copiar enlace/i })).not.toBeInTheDocument()
})

test('ESC key calls onClose', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  const onClose = vi.fn()
  render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={onClose} />)
  await screen.findByText(/Alice/)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalled()
})

test('tapping the overlay calls onClose', async () => {
  vi.mocked(api.getListMembers).mockResolvedValue([ALICE])
  const onClose = vi.fn()
  const { container } = render(<ListMembersSheet listId="l1" currentUserId="u1" isOwner={true} onClose={onClose} />)
  await screen.findByText(/Alice/)
  fireEvent.click(container.querySelector('.list-members-sheet__overlay')!)
  expect(onClose).toHaveBeenCalled()
})
