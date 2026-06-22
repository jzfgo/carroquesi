import { act, renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import { enqueue, getAll, remove } from '../lib/offlineQueue'
import { useOffline } from './useOffline'

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
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
})

describe('useOffline — online state', () => {
  it('isOffline is false when navigator.onLine is true', () => {
    const { result } = renderHook(() => useOffline(defaultParams))
    expect(result.current.isOffline).toBe(false)
  })

  it('isOffline is true when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOffline(defaultParams))
    expect(result.current.isOffline).toBe(true)
  })

  it('isOffline becomes true on offline event', () => {
    const { result } = renderHook(() => useOffline(defaultParams))
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current.isOffline).toBe(true)
  })

  it('isOffline becomes false on online event', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOffline(defaultParams))
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(result.current.isOffline).toBe(false)
  })
})

describe('useOffline — pendingCount', () => {
  it('starts at 0 with empty queue', async () => {
    const { result } = renderHook(() => useOffline(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('updates when an op is enqueued', async () => {
    const { result } = renderHook(() => useOffline(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    await act(() => enqueue({ listId: 'l1', type: 'addItem', payload: {} }))
    await waitFor(() => expect(result.current.pendingCount).toBe(1))
  })
})

describe('useOffline — drain on reconnect', () => {
  it('drains addItem ops and calls onDrained', async () => {
    const createdItem = { id: 'real-1', list_id: 'l1', name: 'Leche', quantity: null, brand: null, stores: [], purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null, added_by: '', created_at: '', updated_at: '' }
    vi.mocked(api.createItem).mockResolvedValue(createdItem as never)
    await enqueue({ listId: 'l1', type: 'addItem', tempId: 'tmp-1', payload: { name: 'Leche' } })

    const { result } = renderHook(() => useOffline(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(1))

    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(mockOnDrained).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('shows toast when a server error causes a failure', async () => {
    vi.mocked(api.createItem).mockRejectedValue(new api.ApiError(500, 'Server Error'))
    await enqueue({ listId: 'l1', type: 'addItem', payload: { name: 'Leche' } })

    renderHook(() => useOffline(defaultParams))
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('cambio')))
  })

  it('does not drain ops for a different listId', async () => {
    vi.mocked(api.createItem).mockResolvedValue({} as never)
    await enqueue({ listId: 'l2', type: 'addItem', payload: { name: 'Leche' } })

    renderHook(() => useOffline(defaultParams))
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(api.createItem).not.toHaveBeenCalled()
  })
})
