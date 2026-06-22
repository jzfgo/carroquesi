import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import * as offlineQueue from '../lib/offlineQueue'
import type { ListItem } from '../types'
import { useListItems } from './useListItems'

vi.mock('../lib/api')
vi.mock('../lib/offlineQueue', () => ({
  enqueue: vi.fn().mockResolvedValue({
    id: 'q1',
    listId: 'list-1',
    type: 'addItem',
    payload: {},
    enqueuedAt: 0,
  }),
}))

const mockGetToken = vi.fn().mockResolvedValue('token')
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
    expect(mockShowToast).toHaveBeenCalledWith('No se pudo añadir el producto')
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
    const apiErr = new ApiError(409, 'Item already in list')
    apiErr.status = 409
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
})
