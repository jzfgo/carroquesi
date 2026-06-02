import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { vi, beforeEach, describe, it, expect } from 'vitest'
import { ListRoute } from './ListRoute'
import * as AuthContext from '../contexts/AuthContext'
import * as api from '../lib/api'

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return { ...actual, getList: vi.fn() }
})
vi.mock('./ListScreen', () => ({
  ListScreen: ({ listId, listName }: { listId: string; listName: string }) => (
    <div>ListScreen:{listId}:{listName}</div>
  ),
}))

import * as reactRouter from 'react-router-dom'
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: vi.fn().mockReturnValue({ id: 'l1' }),
    useNavigate: vi.fn().mockReturnValue(vi.fn()),
    useLocation: vi.fn().mockReturnValue({ pathname: '/lists/l1', state: null }),
  }
})

const mockGetToken = vi.fn().mockResolvedValue('token')
let mockNavigate: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockNavigate = vi.fn()
  vi.mocked(reactRouter.useNavigate).mockReturnValue(mockNavigate as never)
  vi.mocked(reactRouter.useParams).mockReturnValue({ id: 'l1' })
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com', features: [] },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  })
})

const listData = { id: 'l1', name: 'Mercado', emoji: '🛒', owner_id: 'u1', created_at: '', updated_at: '', item_count: 3, purchased_count: 1 }

describe('ListRoute', () => {
  it('shows a loading spinner while fetching', () => {
    vi.mocked(api.getList).mockReturnValue(new Promise(() => {}))
    render(<ListRoute />)
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument()
  })

  it('renders ListScreen with list data on success', async () => {
    vi.mocked(api.getList).mockResolvedValue(listData)
    render(<ListRoute />)
    await waitFor(() => expect(screen.getByText('ListScreen:l1:Mercado')).toBeInTheDocument())
  })

  it('shows not-found error on 404', async () => {
    vi.mocked(api.getList).mockRejectedValue(new api.ApiError(404, 'Not found'))
    render(<ListRoute />)
    await waitFor(() => expect(screen.getByText('Lista no encontrada.')).toBeInTheDocument())
  })

  it('shows forbidden error on 403', async () => {
    vi.mocked(api.getList).mockRejectedValue(new api.ApiError(403, 'Forbidden'))
    render(<ListRoute />)
    await waitFor(() => expect(screen.getByText('No tienes acceso a esta lista.')).toBeInTheDocument())
  })

  it('shows generic error on unknown failure', async () => {
    vi.mocked(api.getList).mockRejectedValue(new Error('Network error'))
    render(<ListRoute />)
    await waitFor(() => expect(screen.getByText('Error al cargar la lista.')).toBeInTheDocument())
  })

  it('navigates to / when "Volver al inicio" is clicked on error', async () => {
    vi.mocked(api.getList).mockRejectedValue(new api.ApiError(404, 'Not found'))
    render(<ListRoute />)
    await waitFor(() => screen.getByRole('button', { name: /volver al inicio/i }))
    fireEvent.click(screen.getByRole('button', { name: /volver al inicio/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
