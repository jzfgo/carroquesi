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

test('an empty closed record (no lines) shows the total but no chevron — nothing to unfold', () => {
  const loadItems = vi.fn(() => Promise.resolve([] as ListItem[]))
  const trip = makeTrip({ line_count: 0, total: 41.6 })
  const { container } = render(
    <TripCard trip={trip} defaultExpanded loadItems={loadItems} />,
  )
  expect(screen.getByText('€ 41,60')).toBeInTheDocument()
  // Total-only: no expand affordance and no fetch, even opened as the latest.
  expect(container.querySelector('.trip-card__chevron')).not.toBeInTheDocument()
  expect(container.querySelector('.trip-card__toggle')).not.toBeInTheDocument()
  expect(loadItems).not.toHaveBeenCalled()
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

test('a folded proto with priced lines shows both the provisional «≈ total» and the seal badge', () => {
  const trip = makeTrip({ closed_at: null, total: null, items_total: 12.4 })
  render(<TripCard trip={trip} loadItems={noItems} />)
  expect(screen.getByText(/≈\s*€\s*12,40/)).toBeInTheDocument()
  // The seal marks every open purchase, priced or not — it sits beside the total.
  expect(screen.getByLabelText('Sin cerrar')).toBeInTheDocument()
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

test('search mode is force-expanded, shows only the matching lines and «N de M»', () => {
  const { container } = render(
    <TripCard
      trip={makeTrip({ line_count: 9 })}
      loadItems={noItems}
      matchingLines={[makeLine({ id: 'm', name: 'Leche entera' })]}
    />,
  )
  // The matched line renders without any tap-to-expand — no fetch either.
  expect(screen.getByText('Leche entera')).toBeInTheDocument()
  // «N de M»: 1 matched of the trip's 9 lines.
  expect(screen.getByText('1 de 9')).toBeInTheDocument()
  // The total, seal and toggle chevron all yield the slot.
  expect(screen.queryByText('€ 8,13')).not.toBeInTheDocument()
  expect(container.querySelector('.trip-card__chevron')).not.toBeInTheDocument()
})

test('search mode renders nothing for a trip with zero matches', () => {
  const { container } = render(
    <TripCard trip={makeTrip()} loadItems={noItems} matchingLines={[]} />,
  )
  expect(container.firstChild).toBeNull()
})

test('search mode keeps the re-buy disc on a matched line', async () => {
  const onRebuy = vi.fn()
  render(
    <TripCard
      trip={makeTrip()}
      loadItems={noItems}
      matchingLines={[makeLine({ id: 'milk' })]}
      onRebuy={onRebuy}
    />,
  )
  const disc = await screen.findByRole('button', { name: /volver a comprar/i })
  fireEvent.click(disc)
  expect(onRebuy).toHaveBeenCalledWith('p1', 'milk')
})

// ————— 25b: the header thumbnail —————

const scan = (over = {}) => ({
  id: 's1',
  store: 'Mercadona',
  receipt_at: '2026-07-21',
  receipt_total: 8.13,
  has_file: true,
  file_pages: null,
  created_at: '2026-07-21T20:00:00',
  ...over,
})

const fileUrl = (over = {}) => ({
  url: 'https://storage.example/signed-get',
  content_type: 'image/jpeg',
  pages: null,
  ...over,
})

test('stored paper shows to a member without the scan capability', async () => {
  const loadScans = vi.fn(async () => [scan()])
  const loadFileUrl = vi.fn(async () => fileUrl())
  const { container } = render(
    <TripCard
      trip={makeTrip({ has_receipt: true })}
      loadItems={noItems}
      loadReceiptScans={loadScans}
      loadReceiptFileUrl={loadFileUrl}
    />,
  )
  await waitFor(() =>
    expect(container.querySelector('.trip-thumb--solid')).toBeInTheDocument(),
  )
  expect(screen.getByText('Ticket guardado')).toBeInTheDocument()
})

test('without the scan capability an empty record draws no hole', () => {
  const loadScans = vi.fn(async () => [scan()])
  const { container } = render(
    <TripCard
      trip={makeTrip()}
      loadItems={noItems}
      loadReceiptScans={loadScans}
    />,
  )
  expect(container.querySelector('.trip-thumb')).not.toBeInTheDocument()
  expect(screen.queryByText('Sin ticket · escanéalo')).not.toBeInTheDocument()
  expect(loadScans).not.toHaveBeenCalled()
})

test('a file-less scan settles to no hole without the scan capability', async () => {
  const loadScans = vi.fn(async () => [scan({ has_file: false })])
  const { container } = render(
    <TripCard
      trip={makeTrip({ has_receipt: true })}
      loadItems={noItems}
      loadReceiptScans={loadScans}
    />,
  )
  // The loading box shows while the lookup answers; the file-less settle
  // then removes the affordance entirely instead of leaving a dashed hole.
  await waitFor(() =>
    expect(container.querySelector('.trip-thumb')).not.toBeInTheDocument(),
  )
  expect(loadScans).toHaveBeenCalled()
  expect(screen.queryByText('Sin ticket · escanéalo')).not.toBeInTheDocument()
})

test('has_receipt=false renders the dashed hole with zero fetches', () => {
  const loadScans = vi.fn(async () => [scan()])
  const { container } = render(
    <TripCard
      trip={makeTrip()}
      loadItems={noItems}
      receiptScan
      loadReceiptScans={loadScans}
    />,
  )
  expect(container.querySelector('.trip-thumb--empty')).toBeInTheDocument()
  expect(screen.getByText('Sin ticket · escanéalo')).toBeInTheDocument()
  expect(loadScans).not.toHaveBeenCalled()
})

test('the dashed hole launches a scan aimed at this purchase', () => {
  const onScanReceipt = vi.fn()
  render(
    <TripCard
      trip={makeTrip()}
      loadItems={noItems}
      receiptScan
      onScanReceipt={onScanReceipt}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Escanear el ticket' }))
  expect(onScanReceipt).toHaveBeenCalledWith({
    purchaseId: 'p1',
    store: 'Mercadona',
    date: '2026-07-21',
    total: 8.13,
  })
})

test('a fresh trip object for the same card drops the cached lines and re-reads', async () => {
  const loadItems = vi.fn<(id: string) => Promise<ListItem[]>>()
  loadItems.mockResolvedValueOnce([makeLine()])
  loadItems.mockResolvedValueOnce([
    makeLine(),
    makeLine({ id: 'i2', name: 'Chicles' }),
  ])
  const { rerender } = render(
    <TripCard trip={makeTrip()} defaultExpanded loadItems={loadItems} />,
  )
  await screen.findByText('Yogur natural')
  // The stack refetch after a targeted receipt apply hands down a new object
  // for the same purchase; the expanded card must show the filled/added lines.
  rerender(<TripCard trip={makeTrip()} defaultExpanded loadItems={loadItems} />)
  await screen.findByText('Chicles')
  expect(loadItems).toHaveBeenCalledTimes(2)
})

test('a stored image renders the real miniature from the signed URL', async () => {
  const loadScans = vi.fn(async () => [scan()])
  const loadFileUrl = vi.fn(async () => fileUrl())
  const { container } = render(
    <TripCard
      trip={makeTrip({ has_receipt: true })}
      loadItems={noItems}
      receiptScan
      loadReceiptScans={loadScans}
      loadReceiptFileUrl={loadFileUrl}
    />,
  )
  await waitFor(() =>
    expect(container.querySelector('.trip-thumb__img')).toBeInTheDocument(),
  )
  expect(container.querySelector('.trip-thumb__img')).toHaveAttribute(
    'src',
    'https://storage.example/signed-get',
  )
  expect(screen.getByText('Ticket guardado')).toBeInTheDocument()
  expect(loadFileUrl).toHaveBeenCalledWith('s1')
})

test('several scans with files: the latest wins', async () => {
  const loadScans = vi.fn(async () => [
    scan({ id: 'old' }),
    scan({ id: 'newest' }),
  ])
  const loadFileUrl = vi.fn(async () => fileUrl())
  render(
    <TripCard
      trip={makeTrip({ has_receipt: true })}
      loadItems={noItems}
      receiptScan
      loadReceiptScans={loadScans}
      loadReceiptFileUrl={loadFileUrl}
    />,
  )
  await waitFor(() => expect(loadFileUrl).toHaveBeenCalledWith('newest'))
})

test('a PDF renders the icon box with its page count, no URL fetch', async () => {
  const loadScans = vi.fn(async () => [scan({ file_pages: 3 })])
  const loadFileUrl = vi.fn(async () => fileUrl())
  const { container } = render(
    <TripCard
      trip={makeTrip({ has_receipt: true })}
      loadItems={noItems}
      receiptScan
      loadReceiptScans={loadScans}
      loadReceiptFileUrl={loadFileUrl}
    />,
  )
  await waitFor(() =>
    expect(container.querySelector('.trip-thumb__pages')).toHaveTextContent(
      '3',
    ),
  )
  expect(container.querySelector('.trip-thumb--solid')).toBeInTheDocument()
  expect(loadFileUrl).not.toHaveBeenCalled()
})

test('a reconciled scan without a file settles to the dashed hole', async () => {
  const loadScans = vi.fn(async () => [scan({ has_file: false })])
  const { container } = render(
    <TripCard
      trip={makeTrip({ has_receipt: true })}
      loadItems={noItems}
      receiptScan
      loadReceiptScans={loadScans}
    />,
  )
  await waitFor(() =>
    expect(container.querySelector('.trip-thumb--empty')).toBeInTheDocument(),
  )
})

test('a proto card never shows the hole', () => {
  const { container } = render(
    <TripCard
      trip={makeTrip({ closed_at: null })}
      loadItems={noItems}
      receiptScan
    />,
  )
  expect(container.querySelector('.trip-thumb')).not.toBeInTheDocument()
})

test('a broken miniature falls back to the icon box', async () => {
  const loadScans = vi.fn(async () => [scan()])
  const loadFileUrl = vi.fn(async () => fileUrl())
  const { container } = render(
    <TripCard
      trip={makeTrip({ has_receipt: true })}
      loadItems={noItems}
      receiptScan
      loadReceiptScans={loadScans}
      loadReceiptFileUrl={loadFileUrl}
    />,
  )
  await waitFor(() =>
    expect(container.querySelector('.trip-thumb__img')).toBeInTheDocument(),
  )
  fireEvent.error(container.querySelector('.trip-thumb__img')!)
  expect(container.querySelector('.trip-thumb__img')).not.toBeInTheDocument()
  expect(container.querySelector('.trip-thumb--solid')).toBeInTheDocument()
})
