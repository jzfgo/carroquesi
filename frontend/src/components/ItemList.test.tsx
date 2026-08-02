import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { CostSummary } from '../lib/itemCost'
import { purchasedDateLabel } from '../lib/itemCost'
import type { ListItem } from '../types'
import { ItemList } from './ItemList'

const makeItem = (id: string, purchased = false): ListItem => ({
  id,
  list_id: 'l1',
  name: `Item ${id}`,
  quantity: null,
  purchased_quantity: null,
  brand: null,
  stores: [],
  purchased,
  purchased_at: null,
  purchase_ends_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
})

type ListProps = Partial<React.ComponentProps<typeof ItemList>>

function renderList(props: ListProps = {}) {
  return render(
    <ItemList
      status="success"
      items={[]}
      onTogglePurchased={() => {}}
      onOpenActions={() => {}}
      onRetry={() => {}}
      {...props}
    />,
  )
}

test('shows loading skeleton inside the pending sheet', () => {
  const { container } = renderList({ status: 'loading' })
  expect(
    container.querySelector('.paper--pending .item-list__skeleton'),
  ).toBeInTheDocument()
})

test('shows error state with retry button inside the pending sheet', () => {
  const retry = vi.fn()
  const { container } = renderList({ status: 'error', onRetry: retry })
  expect(
    screen.getByText(/No se pudieron cargar los productos/i),
  ).toBeInTheDocument()
  expect(
    container.querySelector('.paper--pending .item-list__retry'),
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /reintentar/i }))
  expect(retry).toHaveBeenCalledTimes(1)
})

test('shows empty state with mascot inside the pending sheet, titled at zero', () => {
  const { container } = renderList()
  expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  expect(screen.getByText(/Sin productos todavía/i)).toBeInTheDocument()
  expect(screen.getByText(/Añade el primero desde abajo/i)).toBeInTheDocument()
  const sheet = container.querySelector('.paper--pending')
  expect(sheet).toBeInTheDocument()
  expect(within(sheet as HTMLElement).getByText('Por comprar')).toBeVisible()
  expect(container.querySelector('.paper__title-count')?.textContent).toBe('0')
})

test('renders the sheet title with the pending count', () => {
  const { container } = renderList({ items: [makeItem('a'), makeItem('b')] })
  expect(screen.getByText('Por comprar')).toBeInTheDocument()
  expect(container.querySelector('.paper__title-count')?.textContent).toBe('2')
})

test('sheet title counts a single item', () => {
  const { container } = renderList({ items: [makeItem('a')] })
  expect(container.querySelector('.paper__title-count')?.textContent).toBe('1')
})

test('pending items render inside the pending sheet', () => {
  const { container } = renderList({
    items: [makeItem('a'), makeItem('b', true)],
  })
  const sheet = container.querySelector('.paper--pending')
  expect(sheet).toBeInTheDocument()
  expect(within(sheet as HTMLElement).getByText('Item a')).toBeVisible()
  expect(
    within(sheet as HTMLElement).queryByText('Item b'),
  ).not.toBeInTheDocument()
})

test('the purchased area is one settled sheet, even across dates', () => {
  const items = [
    makeItem('a'),
    { ...makeItem('b', true), purchased_at: '2026-07-30T10:00:00' },
    { ...makeItem('c', true), purchased_at: '2026-07-20T10:00:00' },
  ]
  const { container } = renderList({ items })
  const sheets = container.querySelectorAll('.paper--settled')
  expect(sheets).toHaveLength(1)
  const settled = sheets[0] as HTMLElement
  expect(within(settled).getByText('Item b')).toBeVisible()
  expect(within(settled).getByText('Item c')).toBeVisible()
  expect(within(settled).queryByText('Item a')).not.toBeInTheDocument()
})

test('purchased section hidden when no items purchased', () => {
  renderList({ items: [makeItem('a')] })
  expect(screen.queryByText('Comprados')).not.toBeInTheDocument()
})

test('purchased section shown when items purchased', () => {
  renderList({ items: [makeItem('a', false), makeItem('b', true)] })
  expect(screen.getByRole('button', { name: /comprados/i })).toBeInTheDocument()
})

test('purchased section is expanded by default', () => {
  renderList({ items: [makeItem('a', false), makeItem('b', true)] })
  expect(screen.getByRole('button', { name: /comprados/i })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  expect(screen.getByText('Item b')).toBeInTheDocument()
})

test('tapping the purchased header collapses the section', () => {
  renderList({ items: [makeItem('a', false), makeItem('b', true)] })
  fireEvent.click(screen.getByRole('button', { name: /comprados/i }))
  expect(screen.getByRole('button', { name: /comprados/i })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  expect(screen.queryByText('Item b')).not.toBeInTheDocument()
})

test('tapping the purchased header again re-expands the section', () => {
  renderList({ items: [makeItem('a', false), makeItem('b', true)] })
  const toggle = screen.getByRole('button', { name: /comprados/i })
  fireEvent.click(toggle)
  fireEvent.click(toggle)
  expect(screen.getByText('Item b')).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Store group headers — pending sheet only
// ---------------------------------------------------------------------------

test('pending items group under a hand-written store header', () => {
  const items = [
    { ...makeItem('a'), stores: ['Mercadona'], created_at: '1' },
    { ...makeItem('b'), stores: [], created_at: '2' },
    { ...makeItem('c'), stores: ['Mercadona'], created_at: '3' },
  ]
  const { container } = renderList({ items })
  const labels = container.querySelectorAll('.item-list__store-label')
  expect(labels).toHaveLength(1)
  expect(labels[0]).toHaveTextContent('Mercadona')
  // Both Mercadona items live in the group under the header.
  const group = labels[0].parentElement as HTMLElement
  expect(within(group).getByText('Item a')).toBeInTheDocument()
  expect(within(group).getByText('Item c')).toBeInTheDocument()
  expect(within(group).queryByText('Item b')).not.toBeInTheDocument()
})

test('items without a store lead the sheet under no header', () => {
  const items = [
    { ...makeItem('a'), stores: ['Lidl'], created_at: '1' },
    { ...makeItem('b'), stores: [], created_at: '2' },
  ]
  const { container } = renderList({ items })
  const texts = [
    ...container.querySelectorAll('.item-card__name, .item-list__store-label'),
  ].map((n) => n.textContent)
  expect(texts).toEqual(['Item b', 'Lidl', 'Item a'])
})

test('spelling variants group by storeKey and label with the registry name', () => {
  const items = [
    { ...makeItem('a'), stores: ['ahorra mas'], created_at: '1' },
    { ...makeItem('b'), stores: ['AHORRA MÁS'], created_at: '2' },
  ]
  const { container } = renderList({ items, displayStore: () => 'Ahorramas' })
  const labels = container.querySelectorAll('.item-list__store-label')
  expect(labels).toHaveLength(1)
  expect(labels[0]).toHaveTextContent('Ahorramas')
})

test('purchased rows get no store headers', () => {
  const items = [
    {
      ...makeItem('b', true),
      stores: ['Mercadona'],
      purchased_at: '2026-07-30T10:00:00',
    },
  ]
  const { container } = renderList({ items })
  const settled = container.querySelector('.paper--settled') as HTMLElement
  expect(
    settled.querySelector('.item-list__store-label'),
  ).not.toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Cost badge — pending section
// ---------------------------------------------------------------------------

function renderWithCost(
  pendingCost?: CostSummary | null,
  purchasedCostByDate?: Map<string, CostSummary | null>,
) {
  renderList({ items: [makeItem('a')], pendingCost, purchasedCostByDate })
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
  renderList({ items: [makeItem('a'), item], purchasedCostByDate: costByDate })
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
  renderList({ items: [makeItem('a'), item], purchasedCostByDate: costByDate })
  expect(
    document.querySelector('.item-list__date-label-cost')?.textContent,
  ).toMatch(/≥/)
})

test('no date-label cost badge when purchasedCostByDate is omitted', () => {
  const item: ListItem = {
    ...makeItem('b', true),
    purchased_at: new Date().toISOString().slice(0, 19),
  }
  renderList({ items: [makeItem('a'), item] })
  expect(
    document.querySelector('.item-list__date-label-cost'),
  ).not.toBeInTheDocument()
})

test('purchased items appear below active items', () => {
  renderList({ items: [makeItem('a', true), makeItem('b', false)] })
  const allItems = screen.getAllByText(/Item [ab]/)
  // Item b (active) should appear before Item a (purchased)
  expect(allItems[0].textContent).toContain('b')
  expect(allItems[1].textContent).toContain('a')
})

// ---------------------------------------------------------------------------
// totalItems prop — filtered count label
// ---------------------------------------------------------------------------

test('shows "X de Y" count when totalItems differs from filtered count', () => {
  const { container } = renderList({ items: [makeItem('a')], totalItems: 3 })
  expect(container.querySelector('.paper__title-count')?.textContent).toBe(
    '1 de 3',
  )
})

test('shows plain count when totalItems equals filtered count', () => {
  const { container } = renderList({
    items: [makeItem('a'), makeItem('b')],
    totalItems: 2,
  })
  expect(container.querySelector('.paper__title-count')?.textContent).toBe('2')
})

test('shows plain count when totalItems is omitted', () => {
  const { container } = renderList({ items: [makeItem('a')] })
  expect(container.querySelector('.paper__title-count')?.textContent).toBe('1')
})
