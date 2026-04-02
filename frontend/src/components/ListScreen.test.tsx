import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListScreen } from './ListScreen'
import * as AuthContext from '../contexts/AuthContext'
import * as useListItemsModule from '../hooks/useListItems'
import type { ListItem } from '../types'

vi.mock('@undecaf/barcode-detector-polyfill', () => ({
  BarcodeDetectorPolyfill: class {
    detect() { return Promise.resolve([]) }
  },
}))

vi.mock('../contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useListItems')
vi.mock('../lib/api')
vi.mock('./ListMembersSheet', () => ({
  ListMembersSheet: () => <div role="dialog" aria-label="Miembros">Sheet</div>,
}))

const mockGetToken = vi.fn().mockResolvedValue('token')

const emptyHookResult = {
  status: 'success' as const,
  items: [] as ListItem[],
  members: new Map(),
  togglePurchased: vi.fn(),
  addItem: vi.fn(),
  updateTag: vi.fn(),
  updateStores: vi.fn(),
  renameItem: vi.fn(),
  removeItem: vi.fn(),
  retry: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: { id: 'u1', displayName: 'Alice', photoUrl: null, email: 'alice@example.com' },
    getToken: mockGetToken,
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  })
  vi.mocked(useListItemsModule.useListItems).mockReturnValue(emptyHookResult)
})

describe('ListScreen', () => {
  it('renders the list name in the header', () => {
    render(<ListScreen listId="l1" listName="Mercado Semanal" listOwnerId="owner-1" />)
    expect(screen.getByRole('heading', { name: 'Mercado Semanal' })).toBeInTheDocument()
  })

  it('opens ListMembersSheet when menu button is clicked', () => {
    render(<ListScreen listId="l1" listName="Mercado Semanal" listOwnerId="u1" />)
    fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }))
    expect(screen.getByRole('dialog', { name: /miembros/i })).toBeInTheDocument()
  })
})
