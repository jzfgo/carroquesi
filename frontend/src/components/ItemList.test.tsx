import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { CostSummary } from '../lib/itemCost'
import { purchasedDateLabel } from '../lib/itemCost'
import type { ListItem } from '../types'
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={retry}
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )
  expect(screen.getByText('Por comprar')).toBeInTheDocument()
  expect(document.querySelector('.item-list__rubric-count')?.textContent).toBe(
    '2',
  )
})

test('section label reads "1 item left" for single item', () => {
  render(
    <ItemList
      status="success"
      items={[makeItem('a')]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )
  expect(document.querySelector('.item-list__rubric-count')?.textContent).toBe(
    '1',
  )
})

test('purchased section hidden when no items purchased', () => {
  render(
    <ItemList
      status="success"
      items={[makeItem('a')]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )
  expect(screen.queryByText('Compras anteriores')).not.toBeInTheDocument()
})

/** One purchased item per day, so each lands in its own trip. */
const tripsAgo = (n: number): ListItem[] =>
  Array.from({ length: n }, (_, i) => {
    const at = new Date()
    at.setDate(at.getDate() - (i + 1))
    return {
      ...makeItem(`t${i}`, true),
      name: `Compra ${i}`,
      purchased_at: at.toISOString().slice(0, 19),
    }
  })

const renderTrips = (n: number) =>
  render(
    <ItemList
      status="success"
      items={tripsAgo(n)}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )

test('every trip is on the board while there are few enough of them', () => {
  renderTrips(3)
  expect(screen.getByText('Compra 0')).toBeInTheDocument()
  expect(screen.getByText('Compra 2')).toBeInTheDocument()
  // Nothing left to fetch, so nothing offers to.
  expect(screen.queryByText('Compras anteriores')).not.toBeInTheDocument()
})

test('past three, the rest wait below the board and are counted', () => {
  renderTrips(7)
  expect(screen.getByText('Compra 2')).toBeInTheDocument()
  expect(screen.queryByText('Compra 3')).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /compras anteriores/i }),
  ).toHaveTextContent('4')
})

test('tapping brings the next few onto the board, in place', () => {
  renderTrips(7)
  fireEvent.click(screen.getByRole('button', { name: /compras anteriores/i }))
  expect(screen.getByText('Compra 5')).toBeInTheDocument()
  // Six of seven shown, so one is still waiting.
  expect(
    screen.getByRole('button', { name: /compras anteriores/i }),
  ).toHaveTextContent('1')
})

test('and goes away once there is nothing left to bring', () => {
  renderTrips(5)
  fireEvent.click(screen.getByRole('button', { name: /compras anteriores/i }))
  expect(screen.getByText('Compra 4')).toBeInTheDocument()
  expect(screen.queryByText('Compras anteriores')).not.toBeInTheDocument()
})

test('it never folds anything back — nothing here was folded', () => {
  // Not a collapse: those trips were simply not on the board yet.
  renderTrips(7)
  const more = screen.getByRole('button', { name: /compras anteriores/i })
  fireEvent.click(more)
  expect(screen.getByText('Compra 0')).toBeInTheDocument()
  expect(screen.getByText('Compra 5')).toBeInTheDocument()
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
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
  // An earlier day: marked *now* would still be in the cart, on the list's own
  // sheet, and would have no date label to hang a cost on.
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const purchasedAt = yesterday.toISOString().slice(0, 19) // no trailing Z; purchasedDateLabel appends it
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
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
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const purchasedAt = yesterday.toISOString().slice(0, 19)
  const item: ListItem = { ...makeItem('b', true), purchased_at: purchasedAt }
  const label = purchasedDateLabel(purchasedAt)
  const costByDate = new Map([
    [label, { total: 2, partial: true } as CostSummary],
  ])
  render(
    <ItemList
      status="success"
      items={[makeItem('a'), item]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
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
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
      totalItems={3}
    />,
  )
  // Filtered: the figure says how much of the list you are looking at.
  expect(document.querySelector('.item-list__rubric-count')?.textContent).toBe(
    '1/3',
  )
})

test('shows normal label when totalItems equals filtered count', () => {
  const items = [makeItem('a'), makeItem('b')]
  render(
    <ItemList
      status="success"
      items={items}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
      totalItems={2}
    />,
  )
  expect(document.querySelector('.item-list__rubric-count')?.textContent).toBe(
    '2',
  )
})

test('shows normal label when totalItems is omitted', () => {
  const items = [makeItem('a')]
  render(
    <ItemList
      status="success"
      items={items}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )
  expect(document.querySelector('.item-list__rubric-count')?.textContent).toBe(
    '1',
  )
})

// ---------------------------------------------------------------------------
// The stub — the cart, the die-cut, and what happens when there is nothing
// to tear off (28c, variant 5)
// ---------------------------------------------------------------------------

const renderList = (items: ListItem[]) =>
  render(
    <ItemList
      status="success"
      items={items}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )

const inCart = (id: string): ListItem => ({
  ...makeItem(id, true),
  purchased_at: new Date().toISOString().slice(0, 19),
})

const settled = (id: string): ListItem => {
  const earlier = new Date()
  earlier.setDate(earlier.getDate() - 3)
  return {
    ...makeItem(id, true),
    purchased_at: earlier.toISOString().slice(0, 19),
  }
}

test('the cart stays on the list sheet, below the cut — it has not come away yet', () => {
  const { container } = renderList([makeItem('a'), inCart('b')])

  const sheet = container.querySelector('.item-list__sheet')!
  expect(sheet.querySelector('.perf')).not.toBeNull()
  expect(sheet.textContent).toContain('En el carro · 1')
  // Not a receipt: a receipt is what the cart becomes at midnight.
  expect(container.querySelector('.item-list__sheet--receipt')).toBeNull()
})

test('with an empty cart there is no cut, no stamp and no printed rubric', () => {
  const { container } = renderList([makeItem('a')])

  expect(container.querySelector('.perf')).toBeNull()
  expect(container.querySelector('.stamp')).toBeNull()
  // The handwritten rubric comes back instead — the stub only exists when
  // there is something to tear off.
  expect(screen.getByText('En el carro')).toBeInTheDocument()
  expect(screen.getByText('Nada todavía')).toBeInTheDocument()
})

test('a settled trip is a receipt sheet, off the list', () => {
  const { container } = renderList([makeItem('a'), settled('b')])

  expect(container.querySelector('.item-list__sheet--receipt')).not.toBeNull()
  // It is not in the cart, so nothing is left to tear off.
  expect(container.querySelector('.perf')).toBeNull()
})

test('each state gets its own leading mark, and settled gets none', () => {
  const { container } = renderList([makeItem('a'), inCart('b'), settled('c')])

  expect(
    container.querySelector('.item-card__checkbox--pending'),
  ).not.toBeNull()
  expect(container.querySelector('.item-card__checkbox--cart')).not.toBeNull()
  // A record has no state to toggle — the column offers "buy again" instead.
  expect(container.querySelector('.item-card__checkbox--bought')).toBeNull()
  expect(container.querySelector('.item-card__again')).not.toBeNull()
})

test('an item in the cart reads as neither done nor untouched', () => {
  renderList([inCart('b')])
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'mixed')
  expect(
    screen.getByRole('checkbox', { name: 'Sacar del carro' }),
  ).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Shop headings inside "Por comprar" — the order you walk in
// ---------------------------------------------------------------------------

const atStore = (id: string, ...stores: string[]): ListItem => ({
  ...makeItem(id),
  stores,
})

test('heads each shop in the household hand, underlined', () => {
  const { container } = renderList([atStore('a', 'Mercadona')])
  const heading = container.querySelector('.item-list__store-name')
  expect(heading).toHaveTextContent('Mercadona')
})

test('items naming no shop come first and go unheaded — they can be bought anywhere', () => {
  const { container } = renderList([atStore('a', 'Mercadona'), makeItem('b')])
  const rendered = [
    ...container.querySelectorAll('.item-card__name, .item-list__store-name'),
  ].map((n) => n.textContent)
  expect(rendered).toEqual(['Item b', 'Mercadona', 'Item a'])
})

test('a list where nobody named a shop is just a list, with no headings at all', () => {
  const { container } = renderList([makeItem('a'), makeItem('b')])
  expect(container.querySelector('.item-list__store-name')).toBeNull()
})

test('an item naming two shops is one line, under a heading naming both', () => {
  // It used to appear under each shop, which drew one thing to buy as two
  // errands. "Either place will do" is what the household means, so that is
  // what the heading says.
  const { container } = renderList([atStore('a', 'Dia', 'Mercadona')])
  const headings = [
    ...container.querySelectorAll('.item-list__store-name'),
  ].map((n) => n.textContent)
  expect(headings).toEqual(['Dia o Mercadona'])
  expect(container.querySelectorAll('.item-card__name')).toHaveLength(1)
})

test('shops are named alphabetically, whatever order the item lists them in', () => {
  const { container } = renderList([atStore('a', 'Mercadona', 'Carrefour')])
  expect(container.querySelector('.item-list__store-name')).toHaveTextContent(
    'Carrefour o Mercadona',
  )
})

test('a pair sits above either shop alone — widest choice leads', () => {
  const { container } = renderList([
    atStore('a', 'Mercadona'),
    atStore('b', 'Dia', 'Mercadona'),
    makeItem('c'),
  ])
  const rendered = [
    ...container.querySelectorAll('.item-card__name, .item-list__store-name'),
  ].map((n) => n.textContent)
  expect(rendered).toEqual([
    'Item c',
    'Dia o Mercadona',
    'Item b',
    'Mercadona',
    'Item a',
  ])
})

test('a shop nobody named first is still named in its group', () => {
  // The bug this replaces: filing each item under stores[0] only meant Dia
  // vanished from a list where it was always the second shop named.
  const { container } = renderList([
    atStore('a', 'Mercadona'),
    atStore('b', 'Mercadona', 'Dia'),
  ])
  const headings = [
    ...container.querySelectorAll('.item-list__store-name'),
  ].map((n) => n.textContent)
  expect(headings).toEqual(['Dia o Mercadona', 'Mercadona'])
})

test('one thing to buy is one line and one count, however many shops sell it', () => {
  const { container } = renderList([atStore('a', 'Dia', 'Mercadona')])
  expect(container.querySelector('.item-list__rubric-count')).toHaveTextContent(
    '1',
  )
  expect(container.querySelectorAll('.item-card')).toHaveLength(1)
})

test('groups keep the order they first appear in, so the list stays the list', () => {
  const { container } = renderList([
    atStore('a', 'Mercadona'),
    atStore('b', 'Dia'),
    atStore('c', 'Mercadona'),
  ])
  const headings = [
    ...container.querySelectorAll('.item-list__store-name'),
  ].map((n) => n.textContent)
  expect(headings).toEqual(['Mercadona', 'Dia'])
})

test('only what is still to buy is grouped — the cart is not re-sorted under you', () => {
  const { container } = renderList([atStore('a', 'Mercadona'), inCart('b')])
  const sheet = container.querySelector('.item-list__sheet')!
  const headings = [...sheet.querySelectorAll('.item-list__store-name')].map(
    (n) => n.textContent,
  )
  expect(headings).toEqual(['Mercadona'])
})
