import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { ListItem } from '../types'
import { ItemCard } from './ItemCard'

const mockUseOnline = vi.fn(() => true)
vi.mock('../hooks/useOnline', () => ({
  useOnline: () => mockUseOnline(),
}))

beforeEach(() => {
  mockUseOnline.mockReturnValue(true)
})

const BASE_ITEM: ListItem = {
  id: 'i1',
  list_id: 'l1',
  name: 'Leche Entera',
  quantity: '2 unidades',
  purchased_quantity: null,
  brand: 'Hacendado',
  stores: ['Mercadona'],
  purchased: false,
  purchased_at: null,
  purchase_ends_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'user-1',
  created_at: '',
  updated_at: '',
}

// An instant inside today / clearly on a previous day, local time.
const TODAY = new Date().toISOString().slice(0, 19)
const YESTERDAY = new Date(Date.now() - 48 * 3600_000)
  .toISOString()
  .slice(0, 19)
// A closed trip: purchase stopped taking changes an hour ago.
const ENDED = new Date(Date.now() - 3600_000).toISOString().slice(0, 19)
const STILL_OPEN = new Date(Date.now() + 3600_000).toISOString().slice(0, 19)

function renderCard(
  item: ListItem,
  handlers: Partial<{
    onTogglePurchased: (id: string) => void
    onOpenActions: (id: string) => void
    onClone: (id: string) => void
  }> = {},
) {
  return render(
    <ItemCard
      item={item}
      onTogglePurchased={handlers.onTogglePurchased ?? (() => {})}
      onOpenActions={handlers.onOpenActions ?? (() => {})}
      onClone={handlers.onClone}
    />,
  )
}

// ---------------------------------------------------------------------------
// Pending — an instruction in the written voice
// ---------------------------------------------------------------------------

test('renders item name', () => {
  renderCard(BASE_ITEM)
  expect(screen.getByText('Leche Entera')).toBeInTheDocument()
})

test('renders the quantity on the row line, normalized for display', () => {
  const { container } = renderCard(BASE_ITEM)
  // Right alignment itself is CSS (margin-left auto on the qty); what the
  // selector needs is the qty living on the name line, not in the meta row.
  // «2 unidades» prints as «2 UD» — display only, the stored value is
  // untouched.
  expect(
    container.querySelector('.item-card__line .item-card__qty'),
  ).toHaveTextContent(/^2 UD$/)
})

test('pending meta carries the brand but not the store — the group header names it', () => {
  const { container } = renderCard(BASE_ITEM)
  const meta = container.querySelector('.item-card__meta')
  expect(meta).toHaveTextContent(/^Hacendado$/)
  expect(meta).not.toHaveTextContent('Mercadona')
})

test('omits the meta line on a pending row with no brand', () => {
  const item = { ...BASE_ITEM, brand: null, stores: ['Mercadona'] }
  const { container } = renderCard(item)
  expect(container.querySelector('.item-card__meta')).not.toBeInTheDocument()
})

test('a pending row shows no price even when one is on record', () => {
  const item = { ...BASE_ITEM, price: 1.25 }
  const { container } = renderCard(item)
  expect(container.querySelector('.item-card__amount')).not.toBeInTheDocument()
})

test('pending row carries the pending modifier and an empty circle', () => {
  const { container } = renderCard(BASE_ITEM)
  expect(container.querySelector('.item-card--pending')).toBeInTheDocument()
  const circle = screen.getByRole('checkbox')
  expect(circle).toHaveAttribute('aria-checked', 'false')
  expect(circle.querySelector('svg')).not.toBeInTheDocument()
})

test('every row carries the row-tap chevron', () => {
  const { container } = renderCard(BASE_ITEM)
  expect(container.querySelector('.item-card__chevron')).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// The two touch targets
// ---------------------------------------------------------------------------

test('tapping the circle calls onTogglePurchased', () => {
  const handler = vi.fn()
  renderCard(BASE_ITEM, { onTogglePurchased: handler })
  fireEvent.click(screen.getByRole('checkbox'))
  expect(handler).toHaveBeenCalledWith('i1')
})

test('tapping the row body opens the item actions', () => {
  const handler = vi.fn()
  renderCard(BASE_ITEM, { onOpenActions: handler })
  fireEvent.click(screen.getByRole('button', { name: /leche entera/i }))
  expect(handler).toHaveBeenCalledWith('i1')
})

// ---------------------------------------------------------------------------
// In cart — purchased on a trip that is still open
// ---------------------------------------------------------------------------

test('a purchased item on an open trip is in the cart, not bought', () => {
  const item = {
    ...BASE_ITEM,
    purchased: true,
    purchased_at: TODAY,
    purchase_ends_at: STILL_OPEN,
  }
  const { container } = renderCard(item)
  expect(container.querySelector('.item-card--cart')).toBeInTheDocument()
  expect(container.querySelector('.item-card--bought')).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
})

test('a purchased item with no trip yet (optimistic write) is in the cart', () => {
  const item = {
    ...BASE_ITEM,
    purchased: true,
    purchased_at: TODAY,
    purchase_ends_at: null,
  }
  const { container } = renderCard(item)
  expect(container.querySelector('.item-card--cart')).toBeInTheDocument()
})

test('an in-cart row shows no amount — no price until the trip closes', () => {
  const item = {
    ...BASE_ITEM,
    purchased: true,
    purchased_at: TODAY,
    purchase_ends_at: STILL_OPEN,
    price: 3.5,
  }
  const { container } = renderCard(item)
  expect(container.querySelector('.item-card__amount')).not.toBeInTheDocument()
})

test('in-cart meta carries the brand alone — no store on any row', () => {
  const item = {
    ...BASE_ITEM,
    purchased: true,
    purchased_at: TODAY,
    purchase_ends_at: STILL_OPEN,
    stores: ['Mercadona'],
  }
  const { container } = renderCard(item)
  expect(container.querySelector('.item-card__meta')).toHaveTextContent(
    /^Hacendado$/,
  )
})

// ---------------------------------------------------------------------------
// Bought — a printed record
// ---------------------------------------------------------------------------

const BOUGHT_ITEM: ListItem = {
  ...BASE_ITEM,
  purchased: true,
  purchased_at: YESTERDAY,
  purchase_ends_at: ENDED,
  quantity: '2',
  purchased_quantity: '487g',
  price: 3.5,
  price_per: null,
  price_store: 'Mercadona',
}

test('a purchased item on a closed trip carries the bought modifier', () => {
  const { container } = renderCard(BOUGHT_ITEM)
  expect(container.querySelector('.item-card--bought')).toBeInTheDocument()
  expect(container.querySelector('.item-card--cart')).not.toBeInTheDocument()
})

// jsdom does not apply the stylesheet, so the mono voice and the absence of a
// strikethrough cannot be seen here. What this layer can check is the shape
// the CSS selectors need: name and meta must sit inside the bought modifier
// for the record voice to land on them, and the quantity folds into the meta
// row («487 G · Hacendado») — a record's line keeps only name and amount.
test('bought state puts the name and a qty-bearing meta inside the modifier', () => {
  const { container } = renderCard(BOUGHT_ITEM)
  const row = container.querySelector('.item-card--bought')!
  expect(row.querySelector('.item-card__name')).toHaveTextContent(
    'Leche Entera',
  )
  expect(row.querySelector('.item-card__qty')).not.toBeInTheDocument()
  expect(row.querySelector('.item-card__meta')).toHaveTextContent(
    '487 G · Hacendado',
  )
})

test('bought row prints the bare amount — comma decimal, no symbol', () => {
  const { container } = renderCard(BOUGHT_ITEM)
  expect(container.querySelector('.item-card__amount')).toHaveTextContent(
    /^3,50$/,
  )
})

test('shows purchased_quantity instead of planned quantity when purchased', () => {
  const { container } = renderCard(BOUGHT_ITEM)
  const meta = container.querySelector('.item-card__meta')
  expect(meta).toHaveTextContent('487 G')
  expect(meta).not.toHaveTextContent(/\b2\b/)
})

test('shows planned quantity as fallback when purchased but no purchased_quantity', () => {
  const { container } = renderCard({
    ...BOUGHT_ITEM,
    purchased_quantity: null,
    quantity: '3',
  })
  expect(container.querySelector('.item-card__meta')).toHaveTextContent('3 UD')
})

test('a bought row names no store — that context is the purchase sheet header', () => {
  const item = { ...BOUGHT_ITEM, price_store: 'Lidl', stores: ['Mercadona'] }
  const { container } = renderCard(item)
  const meta = container.querySelector('.item-card__meta')
  expect(meta).not.toHaveTextContent('Lidl')
  expect(meta).not.toHaveTextContent('Mercadona')
})

// ---------------------------------------------------------------------------
// The re-buy control — replaces the check on non-today records
// ---------------------------------------------------------------------------

test('a non-today record offers re-buy instead of the check', () => {
  const onClone = vi.fn()
  renderCard(BOUGHT_ITEM, { onClone })
  // Mutually exclusive: the re-buy control takes the circle's slot.
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  const rebuy = screen.getByRole('button', { name: /volver a comprar/i })
  fireEvent.click(rebuy)
  expect(onClone).toHaveBeenCalledWith('i1')
})

test('a purchase from today keeps the check and gets no re-buy', () => {
  const item = { ...BOUGHT_ITEM, purchased_at: TODAY }
  renderCard(item, { onClone: vi.fn() })
  expect(
    screen.queryByRole('button', { name: /volver a comprar/i }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
})

test('a pending row gets no re-buy control', () => {
  renderCard(BASE_ITEM, { onClone: vi.fn() })
  expect(
    screen.queryByRole('button', { name: /volver a comprar/i }),
  ).not.toBeInTheDocument()
})

test('an in-cart row never re-buys, even with purchased_at still in flight', () => {
  const item = {
    ...BASE_ITEM,
    purchased: true,
    purchased_at: null,
    purchase_ends_at: null,
  }
  renderCard(item, { onClone: vi.fn() })
  expect(
    screen.queryByRole('button', { name: /volver a comprar/i }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeInTheDocument()
})

test('no re-buy control without an onClone handler — the check stays', () => {
  renderCard(BOUGHT_ITEM)
  expect(
    screen.queryByRole('button', { name: /volver a comprar/i }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------

test('the circle renders dashed while offline', () => {
  mockUseOnline.mockReturnValue(false)
  const { container } = renderCard(BASE_ITEM)
  expect(
    container.querySelector('.item-card__circle--offline'),
  ).toBeInTheDocument()
})

test('the circle is not dashed while online', () => {
  const { container } = renderCard(BASE_ITEM)
  expect(
    container.querySelector('.item-card__circle--offline'),
  ).not.toBeInTheDocument()
})
