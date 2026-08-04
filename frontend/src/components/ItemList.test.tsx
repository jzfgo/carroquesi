import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { CostSummary } from '../lib/itemCost'
import type { DueSuggestion, ListItem } from '../types'
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

// A closed trip in the past: the three states split on the trip, so a settled
// record is a purchased item whose trip has ended.
const CLOSED = '2020-01-01T00:00:00'

// A settled record — purchased, trip closed. Lands in the "Comprados" sheet.
const makeBought = (id: string, purchasedAt = CLOSED): ListItem => ({
  ...makeItem(id, true),
  purchased_at: purchasedAt,
  purchase_ends_at: CLOSED,
})

// In the cart — purchased, trip still open (null reads open). Lands on the
// talón below the die-cut.
const makeCart = (id: string, purchasedAt: string | null = null): ListItem => ({
  ...makeItem(id, true),
  purchased_at: purchasedAt,
  purchase_ends_at: null,
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

test('blank list keeps its paper, drops the mascot, titled at zero (16c)', () => {
  const { container } = renderList()
  // Rule 9: no mascot inside the list — the board is behind it.
  expect(
    screen.queryByRole('img', { name: /mascota/i }),
  ).not.toBeInTheDocument()
  expect(screen.getByText(/la hoja está en blanco/i)).toBeInTheDocument()
  expect(screen.getByText(/Escribe abajo lo primero/i)).toBeInTheDocument()
  const sheet = container.querySelector('.paper--pending')
  expect(sheet).toBeInTheDocument()
  expect(within(sheet as HTMLElement).getByText('Por comprar')).toBeVisible()
  expect(container.querySelector('.paper__title-count')?.textContent).toBe('0')
})

test('searching with an empty query still shows the blank list, not no-results', () => {
  const { container } = renderList({ searching: true, query: '' })
  expect(
    container.querySelector('.item-list__search-empty'),
  ).not.toBeInTheDocument()
  expect(screen.getByText(/la hoja está en blanco/i)).toBeInTheDocument()
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

test('pending items render inside the pending sheet, records do not', () => {
  const { container } = renderList({
    items: [makeItem('a'), makeBought('b')],
  })
  const sheet = container.querySelector('.paper--pending')
  expect(sheet).toBeInTheDocument()
  expect(within(sheet as HTMLElement).getByText('Item a')).toBeVisible()
  expect(
    within(sheet as HTMLElement).queryByText('Item b'),
  ).not.toBeInTheDocument()
})

// Settled records render in the injected `stack` (18a), not in ItemList, so a
// record simply never appears in the pending sheet. That negative — a bought
// item is not queued as pending or on the talón — is what the tests below still
// assert; the stack's own rendering lives in Stack.test.tsx / TripCard.test.tsx.
test('a bought record does not appear in the pending sheet', () => {
  const { container } = renderList({
    items: [makeItem('a', false), makeBought('b')],
  })
  const sheet = container.querySelector('.paper--pending') as HTMLElement
  expect(within(sheet).getByText('Item a')).toBeVisible()
  expect(within(sheet).queryByText('Item b')).not.toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// The cart, the die-cut and the seal — the talón (JAV-152)
// ---------------------------------------------------------------------------

function cartGroup(container: HTMLElement): HTMLElement {
  return within(container.querySelector('.paper--pending') as HTMLElement)
    .getByRole('group', { name: /en el carro/i })
    .closest('.talon') as HTMLElement
}

test('in-cart items land on the talón; a record neither queues nor settles here', () => {
  const { container } = renderList({
    items: [makeItem('a'), makeCart('b'), makeBought('c')],
  })
  const talon = cartGroup(container)
  expect(within(talon).getByText('Item b')).toBeVisible()
  // The record is the other purchased state — it belongs to the stack, so it
  // is neither on the talón nor anywhere in the item list.
  expect(within(talon).queryByText('Item c')).not.toBeInTheDocument()
  expect(screen.queryByText('Item c')).not.toBeInTheDocument()
})

test('the rubric counts what is in the cart', () => {
  const { container } = renderList({
    items: [makeItem('a'), makeCart('b'), makeCart('c')],
  })
  expect(
    within(cartGroup(container)).getByText('En el carro · 2'),
  ).toBeVisible()
})

test('the die-cut and the talón appear only with a cart', () => {
  const { container: empty } = renderList({ items: [makeItem('a')] })
  expect(empty.querySelector('.perf')).not.toBeInTheDocument()
  expect(empty.querySelector('.talon')).not.toBeInTheDocument()
  expect(
    empty.querySelector('[aria-label="En el carro"]'),
  ).not.toBeInTheDocument()

  const { container: withCart } = renderList({
    items: [makeItem('a'), makeCart('b')],
  })
  expect(withCart.querySelector('.perf')).toBeInTheDocument()
  expect(withCart.querySelector('.talon')).toBeInTheDocument()
})

test('a record alone raises no cart, no cut, no seal', () => {
  const { container } = renderList({ items: [makeItem('a'), makeBought('b')] })
  expect(container.querySelector('.perf')).not.toBeInTheDocument()
  expect(
    container.querySelector('[aria-label="En el carro"]'),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /cerrar compra/i }),
  ).not.toBeInTheDocument()
})

test('the seal opens the close-trip handler', () => {
  const onCloseTrip = vi.fn()
  renderList({ items: [makeItem('a'), makeCart('b')], onCloseTrip })
  fireEvent.click(screen.getByRole('button', { name: /cerrar compra/i }))
  expect(onCloseTrip).toHaveBeenCalledTimes(1)
})

test('the seal never throws without a handler', () => {
  renderList({ items: [makeItem('a'), makeCart('b')] })
  expect(() =>
    fireEvent.click(screen.getByRole('button', { name: /cerrar compra/i })),
  ).not.toThrow()
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

// ---------------------------------------------------------------------------
// Cost badge — pending section
// ---------------------------------------------------------------------------

function renderWithCost(pendingCost?: CostSummary | null) {
  renderList({ items: [makeItem('a')], pendingCost })
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

// Settled records no longer live in ItemList — the injected `stack` (18a) owns
// them now, so the old per-date «Comprados» cost-badge tests moved out with the
// block. The stack's own rendering is covered by Stack.test.tsx / TripCard.test.tsx.

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

// ---------------------------------------------------------------------------
// No-results search (16c) — a flat surface that covers the sheet
// ---------------------------------------------------------------------------

test('no-results search covers the sheet with a flat surface, not paper', () => {
  const { container } = renderList({ searching: true, query: 'pimentón' })
  expect(
    container.querySelector('.item-list__search-empty'),
  ).toBeInTheDocument()
  expect(container.querySelector('.paper--pending')).not.toBeInTheDocument()
  expect(container.querySelector('.item-list__search-none')?.textContent).toBe(
    'Nada con pimentón en esta lista.',
  )
})

test('the add action fills the list with what was searched', () => {
  const onAddFromSearch = vi.fn()
  renderList({ searching: true, query: 'pimentón', onAddFromSearch })
  fireEvent.click(screen.getByRole('button', { name: /Añadir «pimentón»/i }))
  expect(onAddFromSearch).toHaveBeenCalledTimes(1)
})

test('no cross-list line without a match', () => {
  const { container } = renderList({ searching: true, query: 'pimentón' })
  expect(
    container.querySelector('.item-list__search-elsewhere'),
  ).not.toBeInTheDocument()
})

test('the cross-list line names the other list and the purchase date', () => {
  const { container } = renderList({
    searching: true,
    query: 'pimentón',
    elsewhereMatch: {
      list_id: 'l2',
      list_name: 'Casa',
      last_purchased_at: '2026-07-12T10:00:00',
    },
  })
  const line = container.querySelector('.item-list__search-elsewhere')
  expect(line?.textContent).toContain('Sí está en Casa')
  expect(line?.textContent).toMatch(/comprado el .+\./)
})

test('the cross-list line omits the date when the match was never bought', () => {
  const { container } = renderList({
    searching: true,
    query: 'pimentón',
    elsewhereMatch: {
      list_id: 'l2',
      list_name: 'Casa',
      last_purchased_at: null,
    },
  })
  const line = container.querySelector('.item-list__search-elsewhere')
  expect(line?.textContent).toBe('Sí está en Casa.')
  expect(line?.textContent).not.toMatch(/comprado/)
})

// ---------------------------------------------------------------------------
// All bought (16c) — the "Por comprar" sheet disappears, the ticket takes over
// ---------------------------------------------------------------------------

test('all bought: no "Por comprar" sheet, a ¡listo! line', () => {
  const { container } = renderList({ items: [makeBought('a')] })
  expect(screen.queryByText('Por comprar')).not.toBeInTheDocument()
  expect(container.querySelector('.item-list__done')?.textContent).toMatch(
    /listo/i,
  )
})

test('all bought with an open cart: the talón stands alone, no perforation', () => {
  const { container } = renderList({ items: [makeCart('a')] })
  expect(screen.queryByText('Por comprar')).not.toBeInTheDocument()
  expect(container.querySelector('.talon')).toBeInTheDocument()
  // Nothing above to tear from, so no die-cut.
  expect(container.querySelector('.perf')).not.toBeInTheDocument()
  expect(container.querySelector('.item-list__done')).toBeInTheDocument()
})

test('no ¡listo! line while items are still pending', () => {
  const { container } = renderList({ items: [makeItem('a'), makeBought('b')] })
  expect(container.querySelector('.item-list__done')).not.toBeInTheDocument()
})

test('no ¡listo! line mid-search when only a cart item matches (a view, not done)', () => {
  const { container } = renderList({
    searching: true,
    query: 'leche',
    items: [makeCart('a')],
  })
  // The matched cart item still shows as a filtered result...
  expect(container.querySelector('.talon')).toBeInTheDocument()
  // ...but the "done" flourish must not — this is a filtered view.
  expect(container.querySelector('.item-list__done')).not.toBeInTheDocument()
})

// ── Inline "Sueles comprar" suggestions (20b) ─────────────────────────────────

const makeSuggestion = (name: string): DueSuggestion => ({
  name,
  brand: null,
  stores: ['Mercadona'],
  avg_quantity: 2,
  median_interval_days: 7,
  days_since_last: 9,
  days_overdue: 2,
  dismissal_ttl_days: 30,
})

test('shows the "Sueles comprar" tail after the pending items', () => {
  renderList({
    items: [makeItem('a')],
    suggestions: [makeSuggestion('Leche entera')],
  })
  expect(screen.getByText('Sueles comprar')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /añadir Leche entera/i }),
  ).toBeInTheDocument()
})

test('caps the suggestion tail at three rows', () => {
  renderList({
    items: [makeItem('a')],
    suggestions: ['Leche', 'Pan', 'Café', 'Huevos', 'Sal'].map(makeSuggestion),
  })
  expect(screen.getAllByRole('button', { name: /^añadir /i })).toHaveLength(3)
})

test('excludes a suggestion already on the pending list (case/space-folded)', () => {
  renderList({
    items: [makeItem('a'), { ...makeItem('b'), name: '  Leche Entera ' }],
    suggestions: [makeSuggestion('leche entera'), makeSuggestion('Café')],
  })
  expect(
    screen.queryByRole('button', { name: /añadir leche entera/i }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /añadir Café/i }),
  ).toBeInTheDocument()
})

test('still suggests something that is only in the settled records', () => {
  // A due-suggestion is derived from purchase history, so it will always be in
  // the "Comprados" section — that must NOT suppress it.
  renderList({
    items: [makeItem('a'), makeBought('b')],
    suggestions: [{ ...makeSuggestion('Aceite'), name: 'Item b' }],
  })
  expect(
    screen.getByRole('button', { name: /añadir Item b/i }),
  ).toBeInTheDocument()
})

test('renders no suggestions when the pending list is empty (all-bought)', () => {
  renderList({
    items: [makeBought('a')],
    suggestions: [makeSuggestion('Leche entera')],
  })
  // active.length === 0 → the tail stays off, no dangling "Sueles comprar".
  expect(screen.queryByText('Sueles comprar')).not.toBeInTheDocument()
})

test('renders nothing extra when there are no suggestions to show', () => {
  renderList({ items: [makeItem('a')], suggestions: [] })
  expect(screen.queryByText('Sueles comprar')).not.toBeInTheDocument()
})

test('the header count excludes suggestions', () => {
  const { container } = renderList({
    items: [makeItem('a'), makeItem('b')],
    suggestions: [makeSuggestion('Leche'), makeSuggestion('Pan')],
  })
  // Two pending items, two suggestions → the count is 2, not 4.
  expect(container.querySelector('.paper__title-count')?.textContent).toBe('2')
})
