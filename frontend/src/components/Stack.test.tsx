import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { getPurchaseItems, getPurchases, searchPurchases } from '../lib/api'
import type {
  ListItem,
  PurchasePage,
  PurchaseSearchTrip,
  PurchaseSummary,
} from '../types'
import { Stack } from './Stack'

vi.mock('../lib/api', () => ({
  getPurchases: vi.fn(),
  getPurchaseItems: vi.fn(),
  searchPurchases: vi.fn(),
}))

const getToken = () => Promise.resolve('t')

// A capturable IntersectionObserver so the test can fire the scroll sentinel.
let ioCallback: IntersectionObserverCallback | null = null
class MockIO {
  constructor(cb: IntersectionObserverCallback) {
    ioCallback = cb
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
  root = null
  rootMargin = ''
  thresholds = []
}

beforeEach(() => {
  ioCallback = null
  vi.stubGlobal('IntersectionObserver', MockIO)
  vi.mocked(getPurchaseItems).mockResolvedValue([])
})

const trip = (
  id: string,
  over: Partial<PurchaseSummary> = {},
): PurchaseSummary => ({
  id,
  list_id: 'l1',
  opened_at: '2026-07-20T09:00:00',
  tears_off_at: '2026-07-21T00:00:00',
  closed_at: '2026-07-20T20:00:00',
  store: `Store ${id}`,
  total: 10,
  line_count: 3,
  has_receipt: false,
  items_total: null,
  ...over,
})

const page = (purchases: PurchaseSummary[], total: number): PurchasePage => ({
  purchases,
  total,
})

const line = (id: string, name: string): ListItem =>
  ({
    id,
    list_id: 'l1',
    name,
    quantity: '1',
    purchased_quantity: null,
    brand: null,
    stores: [],
    purchased: true,
    purchased_at: '2026-07-20T09:00:00',
    purchase_ends_at: '2026-07-20T20:00:00',
    ean: null,
    price: 1.9,
    price_per: null,
    price_store: null,
    added_by: 'u1',
    created_at: '',
    updated_at: '',
  }) as ListItem

const searchTrip = (
  id: string,
  lines: ListItem[],
  over: Partial<PurchaseSummary> = {},
): PurchaseSearchTrip => ({
  trip: trip(id, over),
  lines,
})

function renderStack() {
  return render(<Stack listId="l1" getToken={getToken} />)
}

test('empty stack shows only the always-present save-ticket door', async () => {
  vi.mocked(getPurchases).mockResolvedValue(page([], 0))
  renderStack()
  await waitFor(() =>
    expect(screen.getByText('Guardar un ticket')).toBeInTheDocument(),
  )
  expect(screen.queryByText('Compras anteriores')).not.toBeInTheDocument()
})

test('renders the latest expanded, two folded, and the archive door with the remaining count', async () => {
  vi.mocked(getPurchases).mockResolvedValue(
    page([trip('a'), trip('b'), trip('c')], 5),
  )
  renderStack()
  await waitFor(() => expect(screen.getByText(/Store a/)).toBeInTheDocument())
  // 5 total − (1 expanded + 2 folded) = 2 behind the door.
  expect(screen.getByText('Compras anteriores')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  // The latest expanded card fetched its lines.
  expect(getPurchaseItems).toHaveBeenCalledWith(getToken, 'l1', 'a')
})

test('the still-open cart is excluded from the stack', async () => {
  vi.mocked(getPurchases).mockResolvedValue(
    page(
      [
        trip('open', { closed_at: null, tears_off_at: '2099-01-01T00:00:00' }),
        trip('done'),
      ],
      2,
    ),
  )
  renderStack()
  await waitFor(() =>
    expect(screen.getByText(/Store done/)).toBeInTheDocument(),
  )
  expect(screen.queryByText(/Store open/)).not.toBeInTheDocument()
})

test('a manual purchase dated today (future closed_at) still shows', async () => {
  // create_manual_purchase sets closed_at = tears_off_at, which for a purchase
  // dated today is tonight — future, but closed. The open cart is marked by
  // closed_at === null, so this closed record must not be mistaken for it and
  // dropped (the bug behind 18c's "saved but nowhere to be seen").
  vi.mocked(getPurchases).mockResolvedValue(
    page(
      [
        trip('manual', {
          closed_at: '2099-01-01T00:00:00',
          tears_off_at: '2099-01-01T00:00:00',
          line_count: 0,
        }),
      ],
      1,
    ),
  )
  renderStack()
  await waitFor(() =>
    expect(screen.getByText(/Store manual/)).toBeInTheDocument(),
  )
})

test('no phantom archive door when an open cart pads the count', async () => {
  // total counts the open cart the view filters out. With 3 real trips —
  // latest + the two-trip preview — nothing is left behind, so the door must
  // not appear even though total (4) − shown (3) would read «1».
  vi.mocked(getPurchases).mockResolvedValue(
    page(
      [
        trip('open', { closed_at: null, tears_off_at: '2099-01-01T00:00:00' }),
        trip('a'),
        trip('b'),
        trip('c'),
      ],
      4,
    ),
  )
  renderStack()
  await waitFor(() => expect(screen.getByText(/Store a/)).toBeInTheDocument())
  expect(screen.getByText(/Store c/)).toBeInTheDocument()
  expect(screen.queryByText('Compras anteriores')).not.toBeInTheDocument()
})

test('the archive door unfolds the rest in place and the sentinel pages more in', async () => {
  vi.mocked(getPurchases).mockImplementation((_t, _l, opts) => {
    const offset = opts?.offset ?? 0
    return Promise.resolve(
      offset === 0
        ? page([trip('a'), trip('b'), trip('c')], 5)
        : page([trip('d'), trip('e')], 5),
    )
  })
  renderStack()
  await waitFor(() => expect(screen.getByText(/Store a/)).toBeInTheDocument())

  // Open the archive: the door's remaining trips unfold in place.
  act(() => {
    screen.getByText('Compras anteriores').click()
  })

  // The sentinel comes into view → the next page loads and appends.
  await waitFor(() => expect(ioCallback).toBeTruthy())
  await act(async () => {
    ioCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
  await waitFor(() => expect(screen.getByText(/Store e/)).toBeInTheDocument())
  expect(screen.getByText(/Store d/)).toBeInTheDocument()
})

test('search mode renders all matching trips and hides both doors', async () => {
  vi.mocked(getPurchases).mockResolvedValue(page([trip('a')], 1))
  vi.mocked(searchPurchases).mockResolvedValue({
    results: [
      searchTrip('a', [line('la', 'Leche entera')], {
        store: 'Mercadona',
        line_count: 9,
      }),
      searchTrip('b', [line('lb', 'Leche sin lactosa')], {
        store: 'Lidl',
        line_count: 3,
      }),
    ],
  })
  render(<Stack listId="l1" getToken={getToken} searching query="leche" />)

  await waitFor(() =>
    expect(screen.getByText('Leche entera')).toBeInTheDocument(),
  )
  expect(screen.getByText('Leche sin lactosa')).toBeInTheDocument()
  // Both are force-expanded with their «N de M» counts.
  expect(screen.getByText('1 de 9')).toBeInTheDocument()
  expect(screen.getByText('1 de 3')).toBeInTheDocument()
  // No doors in search mode.
  expect(screen.queryByText('Guardar un ticket')).not.toBeInTheDocument()
  expect(screen.queryByText('Compras anteriores')).not.toBeInTheDocument()
  expect(searchPurchases).toHaveBeenCalledWith(getToken, 'l1', 'leche')
})

test('the non-search stack is unaffected by an inactive search prop', async () => {
  vi.mocked(getPurchases).mockResolvedValue(page([trip('a')], 1))
  render(<Stack listId="l1" getToken={getToken} searching query="   " />)
  await waitFor(() => expect(screen.getByText(/Store a/)).toBeInTheDocument())
  // A whitespace-only query is not an active search: the save door still shows
  // and the search endpoint is never called.
  expect(screen.getByText('Guardar un ticket')).toBeInTheDocument()
  expect(searchPurchases).not.toHaveBeenCalled()
})
