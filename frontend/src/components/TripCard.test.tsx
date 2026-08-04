import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { tripDateLabel } from '../lib/itemCost'
import type { ListItem, PurchaseSummary } from '../types'
import { TripCard } from './TripCard'

const PAST = '2026-07-21T09:00:00'

const makeTrip = (over: Partial<PurchaseSummary> = {}): PurchaseSummary => ({
  id: 'p1',
  list_id: 'l1',
  opened_at: PAST,
  tears_off_at: '2026-07-22T00:00:00',
  closed_at: '2026-07-21T20:00:00',
  store: 'Mercadona',
  total: 8.13,
  line_count: 2,
  has_receipt: false,
  items_total: null,
  ...over,
})

const makeLine = (over: Partial<ListItem> = {}): ListItem => ({
  id: 'i1',
  list_id: 'l1',
  name: 'Yogur natural',
  quantity: '1',
  purchased_quantity: null,
  brand: null,
  stores: [],
  purchased: true,
  purchased_at: PAST,
  purchase_ends_at: '2026-07-21T20:00:00',
  ean: null,
  price: 1.9,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
  ...over,
})

const noItems = () => Promise.resolve([])

test('folded closed trip shows store · date, the total and a down-chevron', () => {
  const trip = makeTrip()
  const { container } = render(<TripCard trip={trip} loadItems={noItems} />)
  const label = screen.getByText(
    `${trip.store} · ${tripDateLabel(trip.opened_at, false)}`,
  )
  expect(label).toBeInTheDocument()
  expect(screen.getByText('€ 8,13')).toBeInTheDocument()
  // The line count is not shown — the total is the glance that matters.
  expect(screen.queryByText(/líneas?/)).not.toBeInTheDocument()
  expect(container.querySelector('.trip-card__chevron')).toBeInTheDocument()
  // Folded: no lines yet.
  expect(container.querySelector('.item-card')).not.toBeInTheDocument()
})

test('a proto-ticket (closed_at null) shows «Sin tienda», the date, and the seal — no total', () => {
  const trip = makeTrip({ closed_at: null, store: null, total: null })
  render(<TripCard trip={trip} defaultExpanded loadItems={noItems} />)
  expect(
    screen.getByText(`Sin tienda · ${tripDateLabel(trip.opened_at, true)}`),
  ).toBeInTheDocument()
  expect(screen.getByText('Cerrar compra')).toBeInTheDocument()
  expect(screen.queryByText(/€/)).not.toBeInTheDocument()
})

test('a folded proto shows the compact seal badge, not the full «Cerrar compra»', () => {
  const trip = makeTrip({ closed_at: null, store: null, total: null })
  render(<TripCard trip={trip} loadItems={noItems} />)
  // The at-a-glance seal marker is present…
  expect(screen.getByLabelText('Sin cerrar')).toBeInTheDocument()
  // …but the full seal pill only appears once the card is expanded, so the
  // store · date beside it never has to truncate.
  expect(screen.queryByText('Cerrar compra')).not.toBeInTheDocument()
})

test('a folded proto with priced lines shows a provisional «≈ total», not the seal badge', () => {
  const trip = makeTrip({ closed_at: null, total: null, items_total: 12.4 })
  render(<TripCard trip={trip} loadItems={noItems} />)
  expect(screen.getByText(/≈\s*€\s*12,40/)).toBeInTheDocument()
  // The provisional figure takes the slot the seal badge would otherwise hold.
  expect(screen.queryByLabelText('Sin cerrar')).not.toBeInTheDocument()
})

test('expanding a folded trip lazy-loads its lines', async () => {
  const loadItems = vi.fn(() => Promise.resolve([makeLine()]))
  render(<TripCard trip={makeTrip()} loadItems={loadItems} />)
  expect(loadItems).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { expanded: false }))
  await waitFor(() =>
    expect(screen.getByText('Yogur natural')).toBeInTheDocument(),
  )
  expect(loadItems).toHaveBeenCalledWith('p1')
})

test('the latest trip opens expanded and loads on mount', async () => {
  const loadItems = vi.fn(() => Promise.resolve([makeLine()]))
  render(<TripCard trip={makeTrip()} defaultExpanded loadItems={loadItems} />)
  await waitFor(() => expect(loadItems).toHaveBeenCalledWith('p1'))
})

test('the rebuy disc re-buys the line from its own trip', async () => {
  const onRebuy = vi.fn()
  render(
    <TripCard
      trip={makeTrip()}
      defaultExpanded
      loadItems={() => Promise.resolve([makeLine({ id: 'milk' })])}
      onRebuy={onRebuy}
    />,
  )
  const disc = await screen.findByRole('button', { name: /volver a comprar/i })
  fireEvent.click(disc)
  expect(onRebuy).toHaveBeenCalledWith('p1', 'milk')
})

test('a sin-precio line leaves the amount column blank — no dash', async () => {
  render(
    <TripCard
      trip={makeTrip({ closed_at: null, store: null, total: null })}
      defaultExpanded
      loadItems={() => Promise.resolve([makeLine({ price: null })])}
    />,
  )
  await screen.findByText('Yogur natural')
  expect(document.querySelector('.item-card__amount')).not.toBeInTheDocument()
})
