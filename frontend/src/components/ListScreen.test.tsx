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
  clearItemPrice: vi.fn(),
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

const TODAY = new Date().toISOString().slice(0, 19)
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19)

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

describe('cost totals', () => {
  function renderWithItems(items: ListItem[]) {
    vi.mocked(useListItemsModule.useListItems).mockReturnValue({ ...emptyHookResult, items })
    render(<ListScreen listId="l1" listName="Test" listOwnerId="u1" />)
  }

  it('shows total for unpurchased items when all are priced', () => {
    renderWithItems([
      makeItem({ id: '1', price: 2.5 }),
      makeItem({ id: '2', price: 1.0 }),
    ])
    expect(screen.getByText(/3[,.]50/)).toBeInTheDocument()
    expect(document.querySelector('.item-list__label-cost')).not.toHaveTextContent('≥')
  })

  it('shows ≥ prefix when some unpurchased items lack a price', () => {
    renderWithItems([
      makeItem({ id: '1', price: 2.0 }),
      makeItem({ id: '2' }),
    ])
    expect(document.querySelector('.item-list__label-cost')?.textContent).toMatch(/≥/)
  })

  it('applies plain quantity multiplier', () => {
    renderWithItems([makeItem({ id: '1', price: 2.0, quantity: '3' })])
    // 2 × 3 = 6
    expect(screen.getByText(/6[,.]00/)).toBeInTheDocument()
  })

  it('applies SI quantity to per-kg price', () => {
    renderWithItems([makeItem({ id: '1', price: 10, price_per: 'KILOGRAM', quantity: '500g' })])
    // 10 × 0.5 = 5
    expect(screen.getByText(/5[,.]00/)).toBeInTheDocument()
  })

  it('treats SI quantity as pack descriptor for unit-priced item', () => {
    renderWithItems([makeItem({ id: '1', price: 1.5, quantity: '500g' })])
    // 1.5 × 1 = 1.5 — badge present, no ≥
    expect(document.querySelector('.item-list__label-cost')?.textContent).toMatch(/1[,.]50/)
    expect(document.querySelector('.item-list__label-cost')?.textContent).not.toMatch(/≥/)
  })

  it('renders no cost badge when per-kg item has no usable unit in quantity', () => {
    renderWithItems([makeItem({ id: '1', price: 10, price_per: 'KILOGRAM', quantity: '2' })])
    // total = 0 → null summary → no badge
    expect(document.querySelector('.item-list__label-cost')).not.toBeInTheDocument()
  })

  it('shows cost next to the purchased date label', () => {
    renderWithItems([
      makeItem({ id: '1', purchased: true, purchased_at: TODAY, price: 3.0 }),
    ])
    expect(document.querySelector('.item-list__date-label-cost')).toBeInTheDocument()
    expect(document.querySelector('.item-list__date-label-cost')?.textContent).toMatch(/3[,.]00/)
  })

  it('renders no cost badge when no items have prices', () => {
    renderWithItems([makeItem({ id: '1' }), makeItem({ id: '2' })])
    expect(document.querySelector('.item-list__label-cost')).not.toBeInTheDocument()
  })
})
