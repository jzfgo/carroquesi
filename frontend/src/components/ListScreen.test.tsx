import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListScreen } from './ListScreen'
import * as AuthContext from '../contexts/AuthContext'
import * as useListItemsModule from '../hooks/useListItems'
import * as api from '../lib/api'
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
  savePrice: vi.fn(),
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
  vi.mocked(api.getDueSuggestions).mockResolvedValue([])
})

const TODAY = new Date().toISOString()
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString()

function makeItem(overrides: Partial<ListItem>): ListItem {
  return {
    id: 'x', list_id: 'l1', name: 'Item', quantity: null, brand: null,
    stores: [], purchased: false, purchased_at: null, ean: null,
    price: null, price_per: null, price_store: null, added_by: 'u1',
    created_at: TODAY, updated_at: TODAY,
    ...overrides,
  }
}

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

  it('renders emoji before the list name in the header when provided', () => {
    render(
      <ListScreen listId="l1" listName="Mercado Semanal" listEmoji="🛒" listOwnerId="owner-1" />
    )
    const heading = screen.getByRole('heading')
    expect(heading.textContent).toContain('🛒')
    expect(heading.textContent).toContain('Mercado Semanal')
  })

  it('existing heading accessible name is unchanged when emoji is provided (emoji is aria-hidden)', () => {
    render(
      <ListScreen listId="l1" listName="Mercado Semanal" listEmoji="🛒" listOwnerId="owner-1" />
    )
    expect(screen.getByRole('heading', { name: 'Mercado Semanal' })).toBeInTheDocument()
  })
})

describe('ProgressBar scoping', () => {
  function renderWithItems(items: ListItem[]) {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({ ...emptyHookResult, items })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
  }

  it('hides the bar when there are no in-scope items', () => {
    renderWithItems([])
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('counts only unpurchased items when nothing is purchased yet', () => {
    renderWithItems([makeItem({ id: '1' }), makeItem({ id: '2' })])
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('shows 100% when all items were purchased today', () => {
    renderWithItems([
      makeItem({ id: '1', purchased: true, purchased_at: TODAY }),
      makeItem({ id: '2', purchased: true, purchased_at: TODAY }),
    ])
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('excludes items purchased on a prior day from both numerator and denominator', () => {
    renderWithItems([
      makeItem({ id: '1' }),                                              // unpurchased → in scope
      makeItem({ id: '2', purchased: true, purchased_at: TODAY }),        // purchased today → in scope
      makeItem({ id: '3', purchased: true, purchased_at: YESTERDAY }),    // old → excluded
    ])
    // total = 2 (items 1 + 2), purchased = 1 (item 2) → 50%
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  })

  it('hides the bar when all purchased items are from prior days and none are unpurchased', () => {
    renderWithItems([
      makeItem({ id: '1', purchased: true, purchased_at: YESTERDAY }),
    ])
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
