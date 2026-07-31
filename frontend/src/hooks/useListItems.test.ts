import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import * as offlineQueue from '../lib/offlineQueue'
import { apiError } from '../lib/testApiError'
import type { ListItem } from '../types'
import { useListItems } from './useListItems'

vi.mock('../lib/api')
// Same conversion as the module-scope helpers below, and for the same reason —
// a vi.mock factory runs once at module load, so an implementation attached
// after construction is cleared before the first test and never comes back.
// Nothing re-stubs enqueue in beforeEach, so the QueuedOp shape below would
// simply have stopped being returned while still sitting here describing what
// enqueue gives you.
// Only `enqueue` stands in. The rest of the module stays real: `newTempId`
// and the id helpers beside it are pure, and they are what the code under test
// uses to mint the row it paints before the server has answered.
vi.mock('../lib/offlineQueue', async (importOriginal) => ({
  ...(await importOriginal<typeof offlineQueue>()),
  enqueue: vi.fn(async () => ({
    id: 'q1',
    listId: 'list-1',
    type: 'addItem',
    payload: {},
    enqueuedAt: 0,
  })),
}))

const mockGetToken = vi.fn(async () => 'token')
const mockShowToast = vi.fn()

const item1: ListItem = {
  id: 'item-1',
  list_id: 'list-1',
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
  added_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockRawMembers = [
  {
    id: 'mem-1',
    user_id: 'user-1',
    list_id: 'list-1',
    display_name: 'Alice',
    photo_url: null,
    created_at: '',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.removeItem('cqs_list_cache_list-1')
  vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
  vi.mocked(api.getListMembers).mockResolvedValue(mockRawMembers as never)
  vi.mocked(api.getListUpdatedAt).mockResolvedValue({
    updated_at: '2026-01-01T00:00:00',
  } as never)
})

describe('useListItems — initial fetch', () => {
  it('starts in loading state', () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    expect(result.current.status).toBe('loading')
  })

  it('resolves to success with items and members', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].name).toBe('Leche')
    expect(result.current.members.get('user-1')?.displayName).toBe('Alice')
    expect(result.current.members.get('user-1')?.photoUrl).toBeNull()
  })

  it('sets status to error when fetch fails', async () => {
    vi.mocked(api.getListItems).mockRejectedValue(new Error('Network'))
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})

describe('useListItems — togglePurchased', () => {
  it('optimistically flips purchased', async () => {
    vi.mocked(api.updateItem).mockResolvedValue({} as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(result.current.items[0].purchased).toBe(true)
  })

  it('rolls back and shows toast on error', async () => {
    vi.mocked(api.updateItem).mockRejectedValue(new Error('Network'))
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(result.current.items[0].purchased).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith(
      'No se pudo actualizar el producto',
      expect.objectContaining({ label: 'Reintentar', tone: 'tomate' }),
    )
  })
})

describe('useListItems — the undo on a tap', () => {
  /**
   * The ordering is the whole point, so the test has to hold the write open.
   *
   * Written as "tap, await, assert the toast" it passes no matter where the
   * call sits, because by then everything has settled. Here the answer is
   * withheld: an undo offered now would send the inverse while the write it
   * reverses is still in flight, and the two can land in either order.
   *
   * Move the showToast call above the await and this goes red.
   */
  it('does not offer the undo until the write it undoes has settled', async () => {
    let answer!: () => void
    vi.mocked(api.updateItem).mockReturnValue(
      new Promise((resolve) => {
        answer = () => resolve({} as never)
      }) as never,
    )
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    let tap!: Promise<void>
    act(() => {
      tap = result.current.togglePurchased('item-1')
    })

    expect(result.current.items[0].purchased).toBe(true)
    expect(mockShowToast).not.toHaveBeenCalled()

    await act(async () => {
      answer()
      await tap
    })
    expect(mockShowToast).toHaveBeenCalledWith(
      'En el carro, Leche',
      expect.objectContaining({ label: 'Deshacer', tone: 'verde' }),
    )
  })

  it('sends the inverse through the same mutation the tap used', async () => {
    vi.mocked(api.updateItem).mockResolvedValue({} as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })
    const [, action] = mockShowToast.mock.calls.at(-1)!

    await act(async () => {
      await action.onAct()
    })

    expect(result.current.items[0].purchased).toBe(false)
    expect(api.updateItem).toHaveBeenLastCalledWith(
      mockGetToken,
      'list-1',
      'item-1',
      { purchased: false },
    )
  })

  it('says which way the line went', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([
      { ...item1, purchased: true, purchased_at: '2026-01-01T10:00:00' },
    ] as never)
    vi.mocked(api.updateItem).mockResolvedValue({} as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(mockShowToast).toHaveBeenCalledWith(
      'Fuera del carro, Leche',
      expect.objectContaining({ label: 'Deshacer' }),
    )
  })

  // The queue is local, so there is nothing to wait for and the notice is
  // still immediate — and two ops for one item drain in the order they were
  // written, which is the right answer.
  it('offers the undo once the queue has taken the write', async () => {
    vi.mocked(api.updateItem).mockRejectedValue(new TypeError('offline'))
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'updateItem', label: 'Leche' }),
    )
    expect(mockShowToast).toHaveBeenCalledWith(
      'En el carro, Leche',
      expect.objectContaining({ label: 'Deshacer' }),
    )
  })
})

describe('useListItems — togglePurchased sends the tap time', () => {
  // Fake timers so the tap instant is a known value we can assert against.
  // `shouldAdvanceTime` is required — `waitFor` never settles under frozen
  // fake timers.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends purchased_at equal to the tap instant', async () => {
    vi.mocked(api.updateItem).mockResolvedValue({} as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    // The instant the optimistic update stamped locally is the same instant
    // that must travel to the server — not a server-side "now" on drain.
    const tapInstant = result.current.items[0].purchased_at
    expect(tapInstant).toEqual(expect.any(String))
    expect(api.updateItem).toHaveBeenCalledWith(
      mockGetToken,
      'list-1',
      'item-1',
      { purchased: true, purchased_at: tapInstant },
    )
  })

  it('queues the tap instant too, so a late drain still files into the right trip', async () => {
    vi.mocked(api.updateItem).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    const tapInstant = result.current.items[0].purchased_at
    expect(offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'updateItem',
        listId: 'list-1',
        payload: {
          itemId: 'item-1',
          patch: { purchased: true, purchased_at: tapInstant },
        },
      }),
    )
  })

  it('refuses client-side to unpurchase an item whose trip has already ended', async () => {
    const settledItem: ListItem = {
      ...item1,
      purchased: true,
      purchased_at: '2026-07-27T09:00:00',
      purchase_id: 'p1',
      purchase_ends_at: '2026-07-27T23:00:00',
    }
    vi.mocked(api.getListItems).mockResolvedValue([settledItem] as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(api.updateItem).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith(
      'No se puede desmarcar una compra ya archivada',
    )
  })
})

describe('useListItems — addItem', () => {
  it('replaces temp item with real item on success', async () => {
    const realItem: ListItem = {
      ...item1,
      id: 'item-real',
      name: 'Leche Real',
    }
    vi.mocked(api.createItem).mockResolvedValue(realItem as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.addItem({
        name: 'Leche Real',
        quantity: null,
        brand: null,
        stores: [],
      })
    })

    const newItem = result.current.items.find((i) => i.id === 'item-real')
    expect(newItem?.id).toBe('item-real')
    expect(newItem?.name).toBe('Leche Real')
  })

  it('removes temp item and shows toast on error', async () => {
    vi.mocked(api.createItem).mockRejectedValue(new Error('Network'))
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    const initialLength = result.current.items.length

    await act(async () => {
      await result.current.addItem({
        name: 'Mantequilla',
        quantity: null,
        brand: null,
        stores: [],
      })
    })

    expect(result.current.items).toHaveLength(initialLength)
    expect(mockShowToast).toHaveBeenCalledWith(
      'No se pudo añadir el producto',
      expect.objectContaining({ label: 'Reintentar', tone: 'tomate' }),
    )
  })

  it('blocks duplicate name (case-insensitive) and shows toast without calling API', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.addItem({
        name: 'LECHE',
        quantity: null,
        brand: null,
        stores: [],
      })
    })

    expect(api.createItem).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith('Ya está en la lista')
  })

  it('blocks duplicate EAN and shows toast without calling API', async () => {
    const itemWithEan: ListItem = { ...item1, ean: '1234567890123' }
    vi.mocked(api.getListItems).mockResolvedValue([itemWithEan] as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.addItem({
        name: 'Otro',
        quantity: null,
        brand: null,
        stores: [],
        ean: '1234567890123',
      })
    })

    expect(api.createItem).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith('Ya está en la lista')
  })

  it('allows re-adding a name that exists only in purchased items', async () => {
    const purchasedItem: ListItem = {
      ...item1,
      purchased: true,
      purchased_at: '2026-01-01T10:00:00',
    }
    vi.mocked(api.getListItems).mockResolvedValue([purchasedItem] as never)
    const realItem: ListItem = { ...item1, id: 'item-new' }
    vi.mocked(api.createItem).mockResolvedValue(realItem as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.addItem({
        name: 'Leche',
        quantity: null,
        brand: null,
        stores: [],
      })
    })

    expect(api.createItem).toHaveBeenCalled()
    expect(mockShowToast).not.toHaveBeenCalled()
  })

  it('shows "Ya está en la lista" toast on 409 from API (race condition)', async () => {
    const apiErr = apiError(409, 'Item already in list')
    vi.mocked(api.createItem).mockRejectedValue(apiErr)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    const initialLength = result.current.items.length

    await act(async () => {
      await result.current.addItem({
        name: 'Producto Nuevo',
        quantity: null,
        brand: null,
        stores: [],
      })
    })

    expect(result.current.items).toHaveLength(initialLength)
    expect(mockShowToast).toHaveBeenCalledWith('Ya está en la lista')
  })
})

describe('useListItems — updateTag', () => {
  it('optimistically updates a tag field', async () => {
    vi.mocked(api.updateItem).mockResolvedValue({} as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.updateTag('item-1', 'brand', 'Danone')
    })

    expect(result.current.items[0].brand).toBe('Danone')
  })

  it('supports setting a tag to null (remove)', async () => {
    const itemWithBrand: ListItem = { ...item1, brand: 'Hacendado' }
    vi.mocked(api.getListItems).mockResolvedValue([itemWithBrand] as never)
    vi.mocked(api.updateItem).mockResolvedValue({} as never)
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.updateTag('item-1', 'brand', null)
    })

    expect(result.current.items[0].brand).toBeNull()
  })

  it('reverts and shows toast on API failure', async () => {
    vi.mocked(api.updateItem).mockRejectedValue(new Error('Network'))
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.updateTag('item-1', 'brand', 'Danone')
    })

    expect(result.current.items[0].brand).toBeNull()
    expect(mockShowToast).toHaveBeenCalledWith(
      'No se pudo actualizar el producto',
      expect.objectContaining({ label: 'Reintentar', tone: 'tomate' }),
    )
  })
})

describe('useListItems — polling', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true,
    })
  })

  it('re-fetches items when updated_at timestamp changes', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    // First poll: initialises lastUpdatedAt from original mock ('2026-01-01T00:00:00')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    // Now swap to a newer timestamp and updated items
    const updatedItem: ListItem = { ...item1, name: 'Leche Updated' }
    vi.mocked(api.getListUpdatedAt).mockResolvedValue({
      updated_at: '2026-01-02T00:00:00',
    } as never)
    vi.mocked(api.getListItems).mockResolvedValue([updatedItem] as never)

    // Second poll: detects timestamp change, re-fetches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.items[0].name).toBe('Leche Updated')
    // Members must never be re-fetched by polling
    expect(vi.mocked(api.getListMembers)).toHaveBeenCalledTimes(1)
  })

  it('skips the poll tick when the tab is hidden', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    const callsBefore = vi.mocked(api.getListUpdatedAt).mock.calls.length

    Object.defineProperty(document, 'visibilityState', {
      get: () => 'hidden',
      configurable: true,
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    // No additional calls should have been made while hidden
    expect(vi.mocked(api.getListUpdatedAt).mock.calls.length).toBe(callsBefore)
  })

  it('immediately polls when the tab becomes visible again', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    // Hide the tab and advance past a poll tick — should be skipped
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'hidden',
      configurable: true,
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    // Tab becomes visible again with updated data
    const updatedItem: ListItem = { ...item1, name: 'Leche Catch-Up' }
    vi.mocked(api.getListUpdatedAt).mockResolvedValue({
      updated_at: '2026-01-02T00:00:00',
    } as never)
    vi.mocked(api.getListItems).mockResolvedValue([updatedItem] as never)

    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true,
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    await waitFor(() =>
      expect(result.current.items[0].name).toBe('Leche Catch-Up'),
    )
  })
})

describe('useListItems — stale-while-revalidate cache', () => {
  it('renders cached items immediately before fetch resolves', async () => {
    const cached = {
      items: [{ ...item1, name: 'Cached Leche' }],
      members: mockRawMembers,
    }
    localStorage.setItem('cqs_list_cache_list-1', JSON.stringify(cached))

    let resolveItems!: (v: unknown) => void
    vi.mocked(api.getListItems).mockReturnValue(
      new Promise((r) => {
        resolveItems = r
      }),
    )

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )

    // Should immediately show cached items in success state (no spinner)
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items[0].name).toBe('Cached Leche')

    // Resolve fresh data
    resolveItems([item1] as never)
    await waitFor(() => expect(result.current.items[0].name).toBe('Leche'))

    localStorage.removeItem('cqs_list_cache_list-1')
  })

  it('saves fresh data to cache after successful fetch', async () => {
    localStorage.removeItem('cqs_list_cache_list-1')
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    const raw = localStorage.getItem('cqs_list_cache_list-1')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as { items: ListItem[] }
    expect(parsed.items[0].name).toBe('Leche')
    localStorage.removeItem('cqs_list_cache_list-1')
  })

  it('shows cached data on network error instead of error state', async () => {
    const cached = {
      items: [{ ...item1, name: 'Cached Leche' }],
      members: mockRawMembers,
    }
    localStorage.setItem('cqs_list_cache_list-1', JSON.stringify(cached))

    vi.mocked(api.getListItems).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    vi.mocked(api.getListMembers).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )
    vi.mocked(api.getListUpdatedAt).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items[0].name).toBe('Cached Leche')

    localStorage.removeItem('cqs_list_cache_list-1')
  })
})

describe('useListItems — write queue on network error', () => {
  it('addItem: keeps temp item in list on network error', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.createItem).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items).toHaveLength(1)

    await act(async () => {
      await result.current.addItem({
        name: 'Nueva',
        quantity: null,
        brand: null,
        stores: [],
      })
    })

    // temp item should still be in list (not rolled back)
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items.some((i) => i.name === 'Nueva')).toBe(true)
    expect(offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addItem', listId: 'list-1' }),
    )
  })

  it('addItem: removes temp item on server error (ApiError)', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.createItem).mockRejectedValue(
      new ApiError(500, 'Server Error'),
    )

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.addItem({
        name: 'Nueva',
        quantity: null,
        brand: null,
        stores: [],
      })
    })

    // temp item should be removed (rolled back)
    expect(result.current.items).toHaveLength(1)
    expect(offlineQueue.enqueue).not.toHaveBeenCalled()
  })

  it('togglePurchased: keeps toggled state on network error', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.updateItem).mockRejectedValue(
      new TypeError('Failed to fetch'),
    )

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    // item should be marked as purchased (not rolled back)
    expect(result.current.items[0].purchased).toBe(true)
    expect(offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'updateItem', listId: 'list-1' }),
    )
  })

  it('togglePurchased: rolls back on server error', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.updateItem).mockRejectedValue(
      new ApiError(422, 'Unprocessable'),
    )

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(result.current.items[0].purchased).toBe(false)
    expect(offlineQueue.enqueue).not.toHaveBeenCalled()
  })

  it('removeItem: rolls back and shows a specific toast on 409 (trip filed)', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    const apiErr = apiError(
      409,
      'Cannot delete an item from a trip that has already been filed',
    )
    vi.mocked(api.deleteItem).mockRejectedValue(apiErr)

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.removeItem('item-1')
    })

    // Optimistic removal must be rolled back — the 409 means it is still there.
    expect(result.current.items).toHaveLength(1)
    expect(offlineQueue.enqueue).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith(
      'No se puede eliminar un producto de una compra ya archivada',
    )
  })

  it('removeItem: rolls back with the generic toast on a non-409 server error', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    const boom = apiError(500, 'Server Error')
    vi.mocked(api.deleteItem).mockRejectedValue(boom)

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.removeItem('item-1')
    })

    expect(result.current.items).toHaveLength(1)
    expect(mockShowToast).toHaveBeenCalledWith(
      'No se pudo eliminar el producto',
      expect.objectContaining({ label: 'Reintentar', tone: 'tomate' }),
    )
  })
})

/**
 * The price endpoint is split by state — POST refuses an item that has one,
 * PATCH refuses one that does not — and `savePrice` picks between them from a
 * local copy that a half-finished attempt has already made wrong.
 *
 * This is the sequence the notice's «Reintentar» walks into, so the retry is
 * what the test actually exercises: the same call, made twice.
 */
describe('useListItems — savePrice converges on a retry', () => {
  it('falls back to PATCH when the POST already landed', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    // It lands. The server now has a price; this screen does not, because
    // setItems is below the second call.
    vi.mocked(api.logPrice).mockResolvedValue({} as never)
    vi.mocked(api.updatePrice).mockResolvedValue({} as never)
    // The quantity write behind it fails — the connection dropping on the way
    // out of the aisle is the ordinary way this happens.
    vi.mocked(api.updateItem).mockRejectedValueOnce(new Error('boom'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await expect(
        result.current.savePrice('item-1', 1.19, null, 'Lidl', '1'),
      ).rejects.toThrow()
    })
    expect(api.logPrice).toHaveBeenCalledTimes(1)

    const conflict = apiError(
      409,
      'Item already has a price; use PATCH to update it',
    )
    vi.mocked(api.logPrice).mockRejectedValueOnce(conflict)

    await act(async () => {
      await result.current.savePrice('item-1', 1.19, null, 'Lidl', '1')
    })

    // It converged instead of refusing: the second attempt PATCHed.
    expect(api.updatePrice).toHaveBeenCalledWith(
      mockGetToken,
      'list-1',
      'item-1',
      { amount: 1.19, price_per: null, store: 'Lidl' },
    )
    expect(result.current.items[0].price).toBe(1.19)
    // The shape, not only the outcome: one POST per attempt and exactly one
    // PATCH. A refactor firing both verbs every time would satisfy the
    // assertions above and double every price write.
    expect(api.logPrice).toHaveBeenCalledTimes(2)
    expect(api.updatePrice).toHaveBeenCalledTimes(1)
  })

  // The path with the most moving parts, and the one that decides whether the
  // person is left with a door or with silence: the fallback itself fails.
  it('propagates when the fallback fails too, so the notice can re-show', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    const conflict = apiError(409, 'Item already has a price')
    vi.mocked(api.logPrice).mockRejectedValue(conflict)
    const boom = apiError(500, 'Server Error')
    vi.mocked(api.updatePrice).mockRejectedValue(boom)

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await expect(
        result.current.savePrice('item-1', 1.19, null, 'Lidl', '1'),
      ).rejects.toThrow()
    })

    // The fallback's own refusal is what reaches the caller — not the 409,
    // which by then is an answer about a door nobody is standing at.
    expect(api.updatePrice).toHaveBeenCalledTimes(1)
    expect(result.current.items[0].price).toBeNull()
  })

  // The mirror, and the reason the fallback is not one-directional: a price
  // deleted on another phone leaves this one holding a stale `price`, so the
  // guess goes the other way and PATCH answers «todavía no tiene».
  it('falls back to POST when the item turned out to have no price', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([
      { ...item1, price: 2.5 },
    ] as never)
    const noPrice = apiError(404, 'Item has no price yet; use POST to set it')
    vi.mocked(api.updatePrice).mockRejectedValueOnce(noPrice)
    vi.mocked(api.logPrice).mockResolvedValue({} as never)
    vi.mocked(api.updateItem).mockResolvedValue({} as never)

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.savePrice('item-1', 1.19, null, 'Lidl', '1')
    })

    expect(api.logPrice).toHaveBeenCalled()
    expect(result.current.items[0].price).toBe(1.19)
  })

  // A refusal that is not about the verb is still a refusal. Retrying the
  // other one would send a second write against an answer nobody read.
  it('does not retry the other verb on a refusal that is not about it', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    const forbidden = apiError(403, 'Forbidden')
    vi.mocked(api.logPrice).mockRejectedValue(forbidden)

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await expect(
        result.current.savePrice('item-1', 1.19, null, 'Lidl', '1'),
      ).rejects.toThrow()
    })

    expect(api.updatePrice).not.toHaveBeenCalled()
  })
})

/**
 * The rule AGENTS.md states as universal, asked of the six controls that
 * predate the price toast. A row deleted on another phone is up to five
 * seconds stale here, so a tap landing on a 404 is the ordinary case rather
 * than an exotic one.
 */
describe('useListItems — a refusal that can never change its mind carries no retry', () => {
  it('togglePurchased: a 404 says the true thing and offers nothing', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.updateItem).mockRejectedValue(apiError(404, 'Item not found'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(mockShowToast).toHaveBeenCalledWith(
      'El producto ya no existe',
      undefined,
    )
  })

  it('togglePurchased: a 500 still offers the retry', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.updateItem).mockRejectedValue(apiError(500, 'Server Error'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(mockShowToast).toHaveBeenCalledWith(
      'No se pudo actualizar el producto',
      expect.objectContaining({ label: 'Reintentar', tone: 'tomate' }),
    )
  })

  // A 404 on a delete is not a failure: the household asked for the row to be
  // gone and it is gone. Restoring it put back a product somebody had already
  // got rid of, behind a button that could only 404 again.
  it('removeItem: a 404 leaves the row deleted and says nothing', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.deleteItem).mockRejectedValue(apiError(404, 'Item not found'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.removeItem('item-1')
    })

    expect(result.current.items).toHaveLength(0)
    expect(mockShowToast).not.toHaveBeenCalled()
  })
})
