import { act, renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import { enqueue, getAll, remove } from '../lib/offlineQueue'
import { useQueueDrain } from './useQueueDrain'

vi.mock('../lib/api')

const mockGetToken = vi.fn().mockResolvedValue('token')
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

// These assert on call counts, so they use their own onDrained rather than the
// shared one: hooks mounted by earlier tests stay subscribed to 'online' and
// their drains can land here, which would show up on a shared mock.
describe('useQueueDrain — re-read after an empty drain', () => {
  it('does not re-read on mount when nothing was queued', async () => {
    const onDrained = vi.fn()
    renderHook(() => useQueueDrain({ ...defaultParams, onDrained }))
    // Give the mount drain time to land before asserting it did not call back.
    // pendingCount is 0 from the first render, so waiting on that would be no
    // barrier at all — it is satisfied by the state the hook starts in. Same
    // wait as the offline test above, for the same reason.
    await new Promise((r) => setTimeout(r, 50))
    // The mount drain had nothing of ours to send, so the list is already
    // current — asking for it again would race a write the user makes right
    // after opening it.
    expect(onDrained).not.toHaveBeenCalled()
  })

  it('re-reads on reconnect even when nothing was queued', async () => {
    const onDrained = vi.fn()
    renderHook(() => useQueueDrain({ ...defaultParams, onDrained }))
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    // Nothing to flush, but the list may have moved on while this device was
    // offline, so it still has to be read again.
    await waitFor(() => expect(onDrained).toHaveBeenCalled())
  })
})
