import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DashboardScreen } from './DashboardScreen'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api')
vi.mock('./ListScreen', () => ({
  ListScreen: ({ listId, onBack }: { listId: string; onBack: () => void }) => (
    <div>
      <span>ListScreen:{listId}</span>
      <button onClick={onBack}>Volver</button>
    </div>
  ),
}))

const mockGetToken = vi.fn().mockResolvedValue('token')
const mockSignOut = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: mockSignOut,
    loading: false,
  })
  vi.mocked(api.createList).mockResolvedValue({
    id: 'l-new', name: 'Nueva', owner_id: 'u1',
    created_at: '', updated_at: '', item_count: 0, purchased_count: 0,
  } as never)
})

const twoLists = [
  { id: 'l1', name: 'Mercado', owner_id: 'u1', created_at: '', updated_at: '', item_count: 8, purchased_count: 3 },
  { id: 'l2', name: 'Costco', owner_id: 'u1', created_at: '', updated_at: '', item_count: 2, purchased_count: 0 },
]

describe('DashboardScreen', () => {
  it('shows loading spinner while fetching', () => {
    vi.mocked(api.getLists).mockReturnValue(new Promise(() => {}))
    render(<DashboardScreen />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows list cards after successful fetch', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(screen.getByText('Costco')).toBeInTheDocument()
  })

  it('shows progress subtitle on list cards', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('3 de 8 comprados')).toBeInTheDocument())
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(api.getLists).mockRejectedValue(new Error('Network'))
    render(<DashboardScreen />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument(),
    )
  })

  it('shows create-first-list prompt when no lists', async () => {
    vi.mocked(api.getLists).mockResolvedValue([] as never)
    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText(/primera lista/i)).toBeInTheDocument())
  })

  it('navigates into a list when a card is tapped', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByText('Mercado'))
    expect(screen.getByText('ListScreen:l1')).toBeInTheDocument()
  })

  it('returns to dashboard when onBack is called from ListScreen', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /volver/i }))
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
  })

  it('calls signOut when avatar is clicked', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }))
    expect(mockSignOut).toHaveBeenCalledOnce()
  })
})
