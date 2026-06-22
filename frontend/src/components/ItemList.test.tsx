import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { CostSummary } from '../lib/itemCost'
import { purchasedDateLabel } from '../lib/itemCost'
import type { ListItem, Member } from '../types'
import { ItemList } from './ItemList'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: {
      id: 'u1',
      displayName: 'Test',
      photoUrl: null,
      email: 'test@example.com',
      features: [],
    },
    getToken: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    loading: false,
  }),
}))

const MEMBERS: Map<string, Member> = new Map()

const makeItem = (id: string, purchased = false): ListItem => ({
  id,
  list_id: 'l1',
  name: `Item ${id}`,
  quantity: null,
  brand: null,
  stores: [],
  purchased,
  purchased_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
})

test('shows loading skeleton', () => {
  const { container } = render(
    <ItemList
      status="loading"
      items={[]}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(container.querySelector('.item-list__skeleton')).toBeInTheDocument()
})

test('shows error state with retry button', () => {
  const retry = vi.fn()
  render(
    <ItemList
      status="error"
      items={[]}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={retry}
      onPriceClick={() => {}}
    />,
  )
  expect(
    screen.getByText(/No se pudieron cargar los productos/i),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
  expect(retry).toHaveBeenCalledTimes(1)
})

test('shows empty state with mascot and updated copy', () => {
  render(
    <ItemList
      status="success"
      items={[]}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  expect(screen.getByText(/Sin productos todavía/i)).toBeInTheDocument()
  expect(screen.getByText(/Añade el primero desde abajo/i)).toBeInTheDocument()
})

test('renders active items section label', () => {
  const items = [makeItem('a'), makeItem('b')]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(screen.getByText('2 productos por comprar')).toBeInTheDocument()
})

test('section label reads "1 item left" for single item', () => {
  render(
    <ItemList
      status="success"
      items={[makeItem('a')]}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(screen.getByText('1 producto por comprar')).toBeInTheDocument()
})

test('purchased section hidden when no items purchased', () => {
  render(
    <ItemList
      status="success"
      items={[makeItem('a')]}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(screen.queryByText('Comprados')).not.toBeInTheDocument()
})

test('purchased section shown when items purchased', () => {
  const items = [makeItem('a', false), makeItem('b', true)]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(screen.getByRole('button', { name: /comprados/i })).toBeInTheDocument()
})

test('purchased section is expanded by default', () => {
  const items = [makeItem('a', false), makeItem('b', true)]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(screen.getByRole('button', { name: /comprados/i })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  expect(screen.getByText('Item b')).toBeInTheDocument()
})

test('tapping the purchased header collapses the section', () => {
  const items = [makeItem('a', false), makeItem('b', true)]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /comprados/i }))
  expect(screen.getByRole('button', { name: /comprados/i })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  expect(screen.queryByText('Item b')).not.toBeInTheDocument()
})

test('tapping the purchased header again re-expands the section', () => {
  const items = [makeItem('a', false), makeItem('b', true)]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  const toggle = screen.getByRole('button', { name: /comprados/i })
  fireEvent.click(toggle)
  fireEvent.click(toggle)
  expect(screen.getByText('Item b')).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Cost badge — pending section
// ---------------------------------------------------------------------------

function renderWithCost(
  pendingCost?: CostSummary | null,
  purchasedCostByDate?: Map<string, CostSummary | null>,
) {
  const items = [makeItem('a')]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
      pendingCost={pendingCost}
      purchasedCostByDate={purchasedCostByDate}
    />,
  )
}

test('shows formatted total in pending label when cost is exact', () => {
  renderWithCost({ total: 3.5, partial: false })
  // match "3.50" or "3,50" depending on locale
  expect(screen.getByText(/3[,.]50/)).toBeInTheDocument()
})

test('shows ≥ prefix in pending label when cost is partial', () => {
  renderWithCost({ total: 3.5, partial: true })
  const badge = document.querySelector('.item-list__label-cost')
  expect(badge?.textContent).toMatch(/≥/)
})

test('no cost badge when pendingCost is null', () => {
  renderWithCost(null)
  expect(
    document.querySelector('.item-list__label-cost'),
  ).not.toBeInTheDocument()
})

test('no cost badge when pendingCost is omitted', () => {
  renderWithCost(undefined)
  expect(
    document.querySelector('.item-list__label-cost'),
  ).not.toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Cost badge — purchased date label
// ---------------------------------------------------------------------------

test('shows cost next to date label in purchased section', () => {
  const purchasedAt = new Date().toISOString().slice(0, 19) // no trailing Z; purchasedDateLabel appends it
  const item: ListItem = {
    ...makeItem('b', true),
    purchased_at: purchasedAt,
  }
  const label = purchasedDateLabel(purchasedAt)
  const costByDate = new Map([
    [label, { total: 5, partial: false } as CostSummary],
  ])
  render(
    <ItemList
      status="success"
      items={[makeItem('a'), item]}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
      purchasedCostByDate={costByDate}
    />,
  )
  expect(
    document.querySelector('.item-list__date-label-cost'),
  ).toBeInTheDocument()
  expect(
    document.querySelector('.item-list__date-label-cost')?.textContent,
  ).toMatch(/5[,.]00/)
})

test('shows ≥ prefix in date label when purchased cost is partial', () => {
  const purchasedAt = new Date().toISOString().slice(0, 19)
  const item: ListItem = { ...makeItem('b', true), purchased_at: purchasedAt }
  const label = purchasedDateLabel(purchasedAt)
  const costByDate = new Map([
    [label, { total: 2, partial: true } as CostSummary],
  ])
  render(
    <ItemList
      status="success"
      items={[makeItem('a'), item]}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
      purchasedCostByDate={costByDate}
    />,
  )
  expect(
    document.querySelector('.item-list__date-label-cost')?.textContent,
  ).toMatch(/≥/)
})

test('no date-label cost badge when purchasedCostByDate is omitted', () => {
  const item: ListItem = {
    ...makeItem('b', true),
    purchased_at: new Date().toISOString().slice(0, 19),
  }
  render(
    <ItemList
      status="success"
      items={[makeItem('a'), item]}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(
    document.querySelector('.item-list__date-label-cost'),
  ).not.toBeInTheDocument()
})

test('purchased items appear below active items', () => {
  const items = [makeItem('a', true), makeItem('b', false)]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  const allItems = screen.getAllByText(/Item [ab]/)
  // Item b (active) should appear before Item a (purchased)
  expect(allItems[0].textContent).toContain('b')
  expect(allItems[1].textContent).toContain('a')
})

// ---------------------------------------------------------------------------
// totalItems prop — filtered count label
// ---------------------------------------------------------------------------

test('shows "X de Y" label when totalItems differs from filtered count', () => {
  const items = [makeItem('a')]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
      totalItems={3}
    />,
  )
  expect(screen.getByText('1 de 3 productos por comprar')).toBeInTheDocument()
})

test('shows normal label when totalItems equals filtered count', () => {
  const items = [makeItem('a'), makeItem('b')]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
      totalItems={2}
    />,
  )
  expect(screen.getByText('2 productos por comprar')).toBeInTheDocument()
})

test('shows normal label when totalItems is omitted', () => {
  const items = [makeItem('a')]
  render(
    <ItemList
      status="success"
      items={items}
      members={MEMBERS}
      onTogglePurchased={() => {}}
      onTagClick={() => {}}
      onMenuOpen={() => {}}
      onRetry={() => {}}
      onPriceClick={() => {}}
    />,
  )
  expect(screen.getByText('1 producto por comprar')).toBeInTheDocument()
})
