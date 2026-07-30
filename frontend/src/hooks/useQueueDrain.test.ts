import { act, renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import { enqueue, getAll, remove } from '../lib/offlineQueue'
import { useQueueDrain } from './useQueueDrain'

vi.mock('../lib/api')

const mockGetToken = vi.fn(async () => 'token')
const mockOnDrained = vi.fn()
const mockShowToast = vi.fn()

const defaultParams = {
  listId: 'l1',
  getToken: mockGetToken,
  onDrained: mockOnDrained,
  showToast: mockShowToast,
}

beforeEach(async () => {
  vi.clearAllMocks()
  const ops = await getAll()
  for (const op of ops) await remove(op.id)
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true,
  })
})

describe('useQueueDrain — pendingCount', () => {
  it('starts at 0 with empty queue', async () => {
    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('updates when an op is enqueued', async () => {
    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    await act(() => enqueue({ listId: 'l1', type: 'addItem', payload: {} }))
    await waitFor(() => expect(result.current.pendingCount).toBe(1))
  })
})

describe('useQueueDrain — drain on mount', () => {
  it('drains addItem ops immediately when online on mount', async () => {
    const createdItem = {
      id: 'real-1',
      list_id: 'l1',
      name: 'Leche',
      quantity: null,
      brand: null,
      stores: [],
      purchased: false,
      purchased_at: null,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: '',
      created_at: '',
      updated_at: '',
    }
    vi.mocked(api.createItem).mockResolvedValue(createdItem as never)
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-1',
      payload: { name: 'Leche' },
    })

    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(mockOnDrained).toHaveBeenCalled())
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('does not drain on mount when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    })
    await enqueue({ listId: 'l1', type: 'addItem', payload: { name: 'Leche' } })

    renderHook(() => useQueueDrain(defaultParams))
    await new Promise((r) => setTimeout(r, 50))
    expect(mockOnDrained).not.toHaveBeenCalled()
  })
})

describe('useQueueDrain — drain on reconnect', () => {
  it('drains addItem ops and calls onDrained', async () => {
    const createdItem = {
      id: 'real-1',
      list_id: 'l1',
      name: 'Leche',
      quantity: null,
      brand: null,
      stores: [],
      purchased: false,
      purchased_at: null,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: '',
      created_at: '',
      updated_at: '',
    }
    vi.mocked(api.createItem).mockResolvedValue(createdItem as never)

    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))

    await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-1',
      payload: { name: 'Leche' },
    })
    await waitFor(() => expect(result.current.pendingCount).toBe(1))

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(mockOnDrained).toHaveBeenCalled())
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('shows toast when a server error causes a failure', async () => {
    vi.mocked(api.createItem).mockRejectedValue(
      new api.ApiError(500, 'Server Error'),
    )
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'Leche' },
    })

    renderHook(() => useQueueDrain(defaultParams))
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('cambio'),
      ),
    )
  })

  it('drains a queued close through closePurchase', async () => {
    await enqueue({
      listId: 'l1',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        purchased_at: '2026-07-30T18:00:00',
        purchase_id: null,
        total: null,
        lines: [{ item_id: 'a', price: 1.19, price_per: null, quantity: null }],
        new_items: [],
      },
    })

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(api.closePurchase).toHaveBeenCalledWith(
        mockGetToken,
        'l1',
        expect.objectContaining({ store: 'Lidl' }),
      ),
    )
  })

  it('rewrites a queued close that names an item created offline', async () => {
    vi.mocked(api.createItem).mockResolvedValue({ id: 'real-1' } as never)

    // Both ops land in the same millisecond otherwise, and the drain sorts by
    // the enqueue time. A tie leaves the order to the random ids the queue is
    // stored under, and the close only maps the temp id if the add ran first.
    const clock = vi.spyOn(Date, 'now')
    clock.mockReturnValue(1000)
    await enqueue({
      listId: 'l1',
      tempId: 'tmp-1',
      type: 'addItem',
      payload: { name: 'Leche' },
    })
    clock.mockReturnValue(2000)
    await enqueue({
      listId: 'l1',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        purchased_at: '2026-07-30T18:00:00',
        purchase_id: null,
        total: null,
        lines: [
          { item_id: 'tmp-1', price: 1.19, price_per: null, quantity: null },
        ],
        new_items: [],
      },
    })
    clock.mockRestore()

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(api.closePurchase).toHaveBeenCalledWith(
        mockGetToken,
        'l1',
        expect.objectContaining({
          lines: [
            { item_id: 'real-1', price: 1.19, price_per: null, quantity: null },
          ],
        }),
      ),
    )
  })

  it('says a whole shop was lost, not that one change failed', async () => {
    await enqueue({
      listId: 'l1',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        purchased_at: '2026-07-30T18:00:00',
        purchase_id: null,
        total: null,
        lines: [{ item_id: 'a', price: 1.19, price_per: null, quantity: null }],
        new_items: [],
      },
    })
    // Someone else filed the trip first. Not a network error, so the op is
    // dropped — and what goes with it is the store, the date, every price
    // typed and everything added by hand. "1 change" does not describe that.
    vi.mocked(api.closePurchase).mockRejectedValue(
      new api.ApiError(409, 'nothing to close'),
    )

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'No se pudo guardar una compra. Vuelve a cerrarla',
      ),
    )
  })

  // Two shops in one evening is a case this app is built for, so the plural
  // is the branch the counter exists to serve — and it was the one nothing
  // rendered.
  it('agrees in number when two shops were lost', async () => {
    for (const store of ['Lidl', 'Mercadona']) {
      await enqueue({
        listId: 'l1',
        type: 'closePurchase',
        payload: {
          store,
          purchased_at: '2026-07-30T18:00:00',
          purchase_id: null,
          total: null,
          lines: [
            { item_id: 'a', price: 1.19, price_per: null, quantity: null },
          ],
          new_items: [],
        },
      })
    }
    vi.mocked(api.closePurchase).mockRejectedValue(
      new api.ApiError(409, 'nothing to close'),
    )

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'No se pudieron guardar 2 compras. Vuelve a cerrarlas',
      ),
    )
  })

  // The two counts move independently, so the plural verb must not be keyed
  // off the wrong one.
  it('counts one stray change beside two lost shops', async () => {
    for (const store of ['Lidl', 'Mercadona']) {
      await enqueue({
        listId: 'l1',
        type: 'closePurchase',
        payload: {
          store,
          purchased_at: '2026-07-30T18:00:00',
          purchase_id: null,
          total: null,
          lines: [
            { item_id: 'a', price: 1.19, price_per: null, quantity: null },
          ],
          new_items: [],
        },
      })
    }
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'Pan' },
    })
    vi.mocked(api.closePurchase).mockRejectedValue(
      new api.ApiError(409, 'nothing to close'),
    )
    vi.mocked(api.createItem).mockRejectedValue(
      new api.ApiError(422, 'unprocessable'),
    )

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'No se pudieron guardar 2 compras, ni 1 cambio más',
      ),
    )
  })

  it('does not drain ops for a different listId', async () => {
    vi.mocked(api.createItem).mockResolvedValue({} as never)
    await enqueue({
      listId: 'l2',
      type: 'addItem',
      payload: { name: 'Leche' },
    })

    renderHook(() => useQueueDrain(defaultParams))
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(api.createItem).not.toHaveBeenCalled()
  })
})
