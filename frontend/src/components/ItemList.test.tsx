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

/** One purchased item per day, so each lands in its own trip. Each trip's
 *  `purchase_ends_at` is stamped an hour after it was picked up — same day,
 *  and always in the past relative to "now" since every trip here is at
 *  least a day old. */
const tripsAgo = (n: number): ListItem[] =>
  Array.from({ length: n }, (_, i) => {
    const at = new Date()
    at.setDate(at.getDate() - (i + 1))
    const endsAt = new Date(at.getTime() + 60 * 60 * 1000)
    return {
      ...makeItem(`t${i}`, true),
      name: `Compra ${i}`,
      purchased_at: at.toISOString().slice(0, 19),
      purchase_id: `p${i}`,
      purchase_ends_at: endsAt.toISOString().slice(0, 19),
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

test('the rule between paper and board survives having nothing to load', () => {
  // The bug: it was drawn by the load-more control, so with three trips or
  // fewer there was no control and no rule — and "Guardar un ticket" sat
  // straight against the last receipt with nothing between them.
  const { container } = render(
    <ItemList
      status="success"
      items={[makeItem('a'), ...tripsAgo(1)]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
      footer={<button>Guardar un ticket</button>}
    />,
  )
  expect(screen.queryByText('Compras anteriores')).not.toBeInTheDocument()
  expect(container.querySelector('.item-list__board-rule')).not.toBeNull()
})

test('and each thing on the board gets its own', () => {
  const { container } = render(
    <ItemList
      status="success"
      items={tripsAgo(7)}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
      footer={<button>Guardar un ticket</button>}
    />,
  )
  expect(screen.getByText('Compras anteriores')).toBeInTheDocument()
  expect(container.querySelectorAll('.item-list__board-rule')).toHaveLength(2)
})

test('a rule is ruled above, never below', () => {
  const { container } = render(
    <ItemList
      status="success"
      items={[makeItem('a'), ...tripsAgo(1)]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
      footer={<button>Guardar un ticket</button>}
    />,
  )
  const rule = container.querySelector('.item-list__board-rule')!
  expect(rule.nextElementSibling).toBe(
    screen.getByRole('button', { name: 'Guardar un ticket' }),
  )
})

test('the footer is the last thing on the board, not inside the list sheet', () => {
  // The bug: it rendered between the shop groups and the die-cut, which put a
  // way of recording a finished shop in the middle of the one you are doing.
  const { container } = render(
    <ItemList
      status="success"
      items={[makeItem('a'), ...tripsAgo(1)]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
      footer={<button>Guardar un ticket</button>}
    />,
  )
  const board = container.querySelector('.item-list')!
  const footer = screen.getByRole('button', { name: 'Guardar un ticket' })
  expect(board.lastElementChild).toBe(footer)
  expect(footer.closest('.item-list__sheet')).toBeNull()
})

// ---------------------------------------------------------------------------
// The rubric's ruling, and the cut below it
// ---------------------------------------------------------------------------

test('the rubric is ruled while there is still something written under it', () => {
  const { container } = render(
    <ItemList
      status="success"
      items={[makeItem('a'), inCart('b')]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )
  expect(container.querySelector('.item-list__rubric--unruled')).toBeNull()
})

test('and unruled when the cut follows it immediately', () => {
  // Everything already in the cart: a dashed rule a few pixels above a dashed
  // cut reads as a mistake, and the cut is the line that means something.
  const { container } = render(
    <ItemList
      status="success"
      items={[inCart('a')]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )
  expect(container.querySelector('.perf')).not.toBeNull()
  expect(container.querySelector('.item-list__rubric--unruled')).not.toBeNull()
})

test('and unruled with nothing under it at all', () => {
  // Nothing to buy and nothing in the cart either, so there is not even a cut
  // below: a rule over empty paper rules nothing.
  const { container } = render(
    <ItemList
      status="success"
      items={[
        {
          ...makeItem('a', true),
          purchased_at: '2020-01-01T10:00:00',
          purchase_id: 'p1',
          purchase_ends_at: '2020-01-01T11:00:00',
        },
      ]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
    />,
  )
  expect(container.querySelector('.perf')).toBeNull()
  expect(container.querySelector('.item-list__rubric--unruled')).not.toBeNull()
})

// ---------------------------------------------------------------------------
// Cost badge — pending section
// ---------------------------------------------------------------------------

function renderWithCost(
  pendingCost?: CostSummary | null,
  purchasedCostByTrip?: Map<string, CostSummary | null>,
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
      purchasedCostByTrip={purchasedCostByTrip}
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
  // The trip ended shortly after — still yesterday, so settled by now.
  const purchaseEndsAt = new Date(yesterday.getTime() + 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
  const item: ListItem = {
    ...makeItem('b', true),
    purchased_at: purchasedAt,
    purchase_id: 'p1',
    purchase_ends_at: purchaseEndsAt,
  }
  const costByTrip = new Map([
    ['p1', { total: 5, partial: false } as CostSummary],
  ])
  render(
    <ItemList
      status="success"
      items={[makeItem('a'), item]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
      purchasedCostByTrip={costByTrip}
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
  const purchaseEndsAt = new Date(yesterday.getTime() + 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
  const item: ListItem = {
    ...makeItem('b', true),
    purchased_at: purchasedAt,
    purchase_id: 'p1',
    purchase_ends_at: purchaseEndsAt,
  }
  const costByTrip = new Map([
    ['p1', { total: 2, partial: true } as CostSummary],
  ])
  render(
    <ItemList
      status="success"
      items={[makeItem('a'), item]}
      onTogglePurchased={() => {}}
      onOpen={() => {}}
      onRetry={() => {}}
      purchasedCostByTrip={costByTrip}
    />,
  )
  expect(
    document.querySelector('.item-list__date-label-cost')?.textContent,
  ).toMatch(/≥/)
})

test('no date-label cost badge when purchasedCostByTrip is omitted', () => {
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
  const endsAt = new Date(earlier.getTime() + 60 * 60 * 1000)
  return {
    ...makeItem(id, true),
    purchased_at: earlier.toISOString().slice(0, 19),
    purchase_id: 'p1',
    purchase_ends_at: endsAt.toISOString().slice(0, 19),
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

test('with an empty cart there is no cut, no stamp and no rubric at all', () => {
  const { container } = renderList([makeItem('a')])

  expect(container.querySelector('.perf')).toBeNull()
  expect(container.querySelector('.stamp')).toBeNull()
  // Not even a heading: "En el carro — nada todavía" labels a thing that is
  // not there, and a hole with no action in it is not drawn (rule 6).
  expect(screen.queryByText('En el carro')).not.toBeInTheDocument()
  expect(screen.queryByText('Nada todavía')).not.toBeInTheDocument()
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

// ---------------------------------------------------------------------------
// One receipt sheet per trip (Purchase entity), not per rendered date label
// ---------------------------------------------------------------------------

// UTC-midnight of (today - n days), plus `hour` hours — deterministic
// regardless of the real time the suite runs at, and always safely in the
// past (bought, not cart) for n >= 2.
const daysAgoAt = (n: number, hour: number): Date =>
  new Date(
    Math.floor(Date.now() / 86_400_000) * 86_400_000 -
      n * 86_400_000 +
      hour * 3_600_000,
  )

const tripItem = (
  id: string,
  purchaseId: string,
  at: Date,
  endsAt: Date = new Date(at.getTime() + 60 * 60 * 1000),
): ListItem => ({
  ...makeItem(id, true),
  purchased_at: at.toISOString().slice(0, 19),
  purchase_id: purchaseId,
  purchase_ends_at: endsAt.toISOString().slice(0, 19),
})

test('two shops on one day render as two receipt sheets, not one', () => {
  // Grouping by the rendered date label used to fold two shops on one day
  // into a single receipt — the exact case the Purchase entity exists for.
  const shopA = tripItem('shopA', 'tripA', daysAgoAt(2, 10))
  const shopB = tripItem('shopB', 'tripB', daysAgoAt(2, 16))
  const { container } = renderList([shopA, shopB])
  expect(container.querySelectorAll('.item-list__sheet--receipt')).toHaveLength(
    2,
  )
})

test("items from one trip stay in one sheet even when another trip's items interleave by timestamp", () => {
  // Sorted newest-first, these interleave: A-new, B-new, A-old, B-old.
  const items = [
    tripItem('aNew', 'tripA', daysAgoAt(2, 18)),
    tripItem('bNew', 'tripB', daysAgoAt(2, 17)),
    tripItem('aOld', 'tripA', daysAgoAt(2, 10)),
    tripItem('bOld', 'tripB', daysAgoAt(2, 9)),
  ]
  const { container } = renderList(items)
  const sheets = container.querySelectorAll('.item-list__sheet--receipt')
  expect(sheets).toHaveLength(2)
  const namesPerSheet = [...sheets].map((sheet) =>
    [...sheet.querySelectorAll('.item-card__name')]
      .map((n) => n.textContent)
      .sort(),
  )
  expect(namesPerSheet).toContainEqual(['Item aNew', 'Item aOld'])
  expect(namesPerSheet).toContainEqual(['Item bNew', 'Item bOld'])
})

test("each sheet's label comes from its own earliest item, even spanning midnight", () => {
  // One trip, two items either side of local midnight (the label is rendered
  // with the runtime's local timezone via toLocaleDateString, so the split is
  // built from local Date methods rather than a hardcoded UTC instant — a
  // fixed instant collides onto one calendar day depending on where the
  // suite runs, e.g. Europe/Madrid's +1h in January).
  // Newest-first, the just-after-midnight item sorts before the
  // just-before-midnight one from the day before — so the label must come
  // from `.at(-1)`, the earliest, not `.at(0)`, the newest.
  const localMidnight = new Date()
  localMidnight.setDate(localMidnight.getDate() - 3) // safely in the past
  localMidnight.setHours(0, 0, 0, 0)
  const beforeMidnight = tripItem(
    'before',
    'tripAcrossMidnight',
    new Date(localMidnight.getTime() - 10 * 60 * 1000),
  )
  const afterMidnight = tripItem(
    'after',
    'tripAcrossMidnight',
    new Date(localMidnight.getTime() + 10 * 60 * 1000),
  )
  const { container } = renderList([afterMidnight, beforeMidnight])
  expect(container.querySelectorAll('.item-list__sheet--receipt')).toHaveLength(
    1,
  )
  const expectedLabel = purchasedDateLabel(beforeMidnight.purchased_at)
  const wrongLabel = purchasedDateLabel(afterMidnight.purchased_at)
  expect(expectedLabel).not.toEqual(wrongLabel)
  expect(container.querySelector('.item-list__label-text')?.textContent).toBe(
    expectedLabel,
  )
})
