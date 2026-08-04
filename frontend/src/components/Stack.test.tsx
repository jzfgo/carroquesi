import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { getPurchaseItems, getPurchases } from '../lib/api'
import type { PurchasePage, PurchaseSummary } from '../types'
import { Stack } from './Stack'

vi.mock('../lib/api', () => ({
  getPurchases: vi.fn(),
  getPurchaseItems: vi.fn(),
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
