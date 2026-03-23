import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListLoader } from './ListLoader'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api')
vi.mock('./ListScreen', () => ({
  ListScreen: ({ listId }: { listId: string }) => <div>ListScreen:{listId}</div>,
}))

const mockGetToken = vi.fn().mockResolvedValue('token')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  })
  vi.mocked(api.createList).mockResolvedValue({ id: 'l1', name: 'New List' } as never)
})

describe('ListLoader', () => {
  it('shows a loading indicator initially', () => {
    vi.mocked(api.getLists).mockReturnValue(new Promise(() => {}))
    render(<ListLoader />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders ListScreen with the first list id on success', async () => {
    vi.mocked(api.getLists).mockResolvedValue([
      { id: 'list-42', name: 'Compras', owner_id: 'u1', created_at: '', updated_at: '' },
    ] as never)
    render(<ListLoader />)
    await waitFor(() =>
      expect(screen.getByText('ListScreen:list-42')).toBeInTheDocument(),
    )
  })

  it('shows empty state with name input when no lists', async () => {
    vi.mocked(api.getLists).mockResolvedValue([] as never)
    render(<ListLoader />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /crear/i })).toBeInTheDocument()
  })

  it('shows error state when getLists fails', async () => {
    vi.mocked(api.getLists).mockRejectedValue(new Error('Network'))
    render(<ListLoader />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument(),
    )
  })

  it('creates a list and loads it on form submit', async () => {
    vi.mocked(api.getLists)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValue([
        { id: 'list-new', name: 'Compras', owner_id: 'u1', created_at: '', updated_at: '' },
      ] as never)
    render(<ListLoader />)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/nombre/i)).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByPlaceholderText(/nombre/i), {
      target: { value: 'Compras' },
    })
    fireEvent.click(screen.getByRole('button', { name: /crear/i }))
    await waitFor(() =>
      expect(screen.getByText('ListScreen:list-new')).toBeInTheDocument(),
    )
    expect(api.createList).toHaveBeenCalledWith(mockGetToken, 'Compras')
  })
})
