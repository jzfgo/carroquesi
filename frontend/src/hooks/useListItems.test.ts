import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import { reportRequestOutcome } from '../lib/connectivity'
import type { ListItem } from '../types'
import { useListItems } from './useListItems'

vi.mock('../lib/api')

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

describe('useListItems — errors roll back the optimistic write', () => {
  it('addItem: removes temp item on network error', async () => {
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

    expect(result.current.items).toHaveLength(1)
    expect(mockShowToast).toHaveBeenCalledWith('No se pudo añadir el producto')
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
  })

  it('togglePurchased: rolls back on network error', async () => {
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

    expect(result.current.items[0].purchased).toBe(false)
    expect(mockShowToast).toHaveBeenCalledWith(
      'No se pudo actualizar el producto',
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
  })
})

const item2: ListItem = { ...item1, id: 'item-2', name: 'Pan' }

describe('useListItems — a read that lands after a write', () => {
  // Earlier suites leave rejecting write mocks behind; clearAllMocks drops the
  // recorded calls but keeps the implementation.
  beforeEach(() => {
    vi.mocked(api.updateItem).mockResolvedValue(undefined as never)
    vi.mocked(api.deleteItem).mockResolvedValue(undefined as never)
  })

  // The read is made to resolve with an extra item, so waiting for that item
  // proves the response was applied before the write is checked.
  function pendingItemsRead() {
    let resolve!: (items: ListItem[]) => void
    vi.mocked(api.getListItems).mockReturnValue(
      new Promise<ListItem[]>((r) => {
        resolve = r
      }) as never,
    )
    return (first: ListItem = item1) => resolve([first, item2])
  }

  function seedCache() {
    localStorage.setItem(
      'cqs_list_cache_list-1',
      JSON.stringify({ items: [item1], members: mockRawMembers }),
    )
  }

  it('keeps a purchase made while the initial read was in flight', async () => {
    seedCache()
    const landRead = pendingItemsRead()

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })
    expect(result.current.items[0].purchased).toBe(true)

    act(() => landRead())
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    expect(result.current.items.find((i) => i.id === 'item-1')?.purchased).toBe(
      true,
    )
  })

  it('keeps an item added while the initial read was in flight', async () => {
    seedCache()
    const landRead = pendingItemsRead()
    vi.mocked(api.createItem).mockResolvedValue({
      ...item1,
      id: 'item-3',
      name: 'Huevos',
    } as never)

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.addItem({
        name: 'Huevos',
        quantity: null,
        brand: null,
        stores: [],
        ean: null,
      })
    })

    act(() => landRead())
    await waitFor(() => expect(result.current.items).toHaveLength(3))

    expect(result.current.items.map((i) => i.name)).toContain('Huevos')
  })

  it('keeps a removal made while the initial read was in flight', async () => {
    seedCache()
    const landRead = pendingItemsRead()

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.removeItem('item-1')
    })
    expect(result.current.items).toHaveLength(0)

    act(() => landRead())
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    expect(result.current.items[0].id).toBe('item-2')
  })

  // savePrice and clearItemPrice reach the server before they paint, so they
  // stamp once where the others stamp twice. These pin that difference.
  it('keeps a price logged while the initial read was in flight', async () => {
    seedCache()
    const landRead = pendingItemsRead()
    vi.mocked(api.logPrice).mockResolvedValue(undefined as never)

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.savePrice('item-1', 1.5, null, 'Mercadona')
    })
    expect(result.current.items[0].price).toBe(1.5)

    act(() => landRead())
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    expect(result.current.items.find((i) => i.id === 'item-1')?.price).toBe(1.5)
  })

  it('keeps a price cleared while the initial read was in flight', async () => {
    localStorage.setItem(
      'cqs_list_cache_list-1',
      JSON.stringify({
        items: [{ ...item1, price: 1.5 }],
        members: mockRawMembers,
      }),
    )
    const landRead = pendingItemsRead()
    vi.mocked(api.deletePrice).mockResolvedValue(undefined as never)

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.clearItemPrice('item-1')
    })
    expect(result.current.items[0].price).toBeNull()

    // The read still carries the price it was logged with.
    act(() => landRead({ ...item1, price: 1.5 }))
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    expect(
      result.current.items.find((i) => i.id === 'item-1')?.price,
    ).toBeNull()
  })

  it('caches what is on screen, not the read the write raced', async () => {
    seedCache()
    const landRead = pendingItemsRead()

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    act(() => landRead())
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    const cached = JSON.parse(
      localStorage.getItem('cqs_list_cache_list-1') as string,
    ) as { items: ListItem[]; members: unknown[] }
    expect(cached.items.find((i) => i.id === 'item-1')?.purchased).toBe(true)
    expect(cached.members).toHaveLength(1)
  })

  it('does not cache one list under the key of the next one', async () => {
    localStorage.removeItem('cqs_list_cache_list-2')

    const { result, rerender } = renderHook(
      ({ id }) => useListItems(id, mockGetToken, mockShowToast),
      { initialProps: { id: 'list-1' } },
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    // The second list is still reading, so its items are the first list's.
    pendingItemsRead()
    rerender({ id: 'list-2' })
    await waitFor(() => expect(api.getListItems).toHaveBeenCalledTimes(2))

    expect(localStorage.getItem('cqs_list_cache_list-2')).toBeNull()
  })

  // Opening a list from a push tap changes only the route parameter, so the
  // hook stays mounted and the previous list's items are still in state when
  // the new list is read.
  it('does not carry a written item into the list opened next', async () => {
    localStorage.removeItem('cqs_list_cache_list-2')

    const { result, rerender } = renderHook(
      ({ id }) => useListItems(id, mockGetToken, mockShowToast),
      { initialProps: { id: 'list-1' } },
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    let ackUpdate!: () => void
    vi.mocked(api.updateItem).mockReturnValue(
      new Promise<void>((r) => {
        ackUpdate = () => r()
      }) as never,
    )
    let toggle!: Promise<void>
    await act(async () => {
      toggle = result.current.togglePurchased('item-1')
      await Promise.resolve()
    })

    let landRead!: (items: ListItem[]) => void
    vi.mocked(api.getListItems).mockReturnValue(
      new Promise<ListItem[]>((r) => {
        landRead = r
      }) as never,
    )
    rerender({ id: 'list-2' })
    await waitFor(() => expect(api.getListItems).toHaveBeenCalledTimes(2))

    // The write on the list left behind settles while the new list is read.
    await act(async () => {
      ackUpdate()
      await toggle
    })

    const otherList: ListItem = {
      ...item1,
      id: 'item-9',
      list_id: 'list-2',
      name: 'Arroz',
    }
    await act(async () => landRead([otherList]))
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    expect(result.current.items[0].id).toBe('item-9')
    const cached = JSON.parse(
      localStorage.getItem('cqs_list_cache_list-2') as string,
    ) as { items: ListItem[] }
    expect(cached.items.map((i) => i.id)).toEqual(['item-9'])
  })

  // The merge keeps the whole local item, so a change another shopper made to
  // that same item is dropped with the rest of the server row.
  it('reads again when a write raced the read, to pick up what it dropped', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      seedCache()
      let landRead!: (items: ListItem[]) => void
      vi.mocked(api.getListItems).mockReturnValue(
        new Promise<ListItem[]>((r) => {
          landRead = r
        }) as never,
      )

      const { result } = renderHook(() =>
        useListItems('list-1', mockGetToken, mockShowToast),
      )
      await waitFor(() => expect(result.current.items).toHaveLength(1))

      await act(async () => {
        await result.current.togglePurchased('item-1')
      })

      // The read carries a rename by someone else, which the merge discards
      // along with the rest of the row it kept locally.
      await act(async () => landRead([{ ...item1, name: 'Leche entera' }]))
      await waitFor(() => expect(result.current.items[0].purchased).toBe(true))
      expect(result.current.items[0].name).toBe('Leche')

      // updated_at is unchanged, so only the forced re-read can recover it.
      vi.mocked(api.getListItems).mockResolvedValue([
        { ...item1, name: 'Leche entera', purchased: true },
      ] as never)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })

      await waitFor(() =>
        expect(result.current.items[0].name).toBe('Leche entera'),
      )
      expect(result.current.items[0].purchased).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps asking for the re-read when the poll that owed it failed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      seedCache()
      let landRead!: (items: ListItem[]) => void
      vi.mocked(api.getListItems).mockReturnValue(
        new Promise<ListItem[]>((r) => {
          landRead = r
        }) as never,
      )

      const { result } = renderHook(() =>
        useListItems('list-1', mockGetToken, mockShowToast),
      )
      await waitFor(() => expect(result.current.items).toHaveLength(1))

      await act(async () => {
        await result.current.togglePurchased('item-1')
      })
      await act(async () => landRead([{ ...item1, name: 'Leche entera' }]))
      await waitFor(() => expect(result.current.items[0].purchased).toBe(true))

      // The tick that owed the re-read cannot reach the server.
      vi.mocked(api.getListItems).mockRejectedValue(new Error('Network'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(result.current.items[0].name).toBe('Leche')

      vi.mocked(api.getListItems).mockResolvedValue([
        { ...item1, name: 'Leche entera', purchased: true },
      ] as never)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })

      await waitFor(() =>
        expect(result.current.items[0].name).toBe('Leche entera'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  // A write already in flight when the tick begins can settle inside the poll's
  // own items read, so reading updated_at first does not protect it.
  it('reads again when a write settled inside the poll read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { result } = renderHook(() =>
        useListItems('list-1', mockGetToken, mockShowToast),
      )
      await waitFor(() => expect(result.current.status).toBe('success'))

      let ackUpdate!: () => void
      vi.mocked(api.updateItem).mockReturnValue(
        new Promise<void>((r) => {
          ackUpdate = () => r()
        }) as never,
      )
      let toggle!: Promise<void>
      await act(async () => {
        toggle = result.current.togglePurchased('item-1')
        await Promise.resolve()
      })

      let landPoll!: (items: ListItem[]) => void
      vi.mocked(api.getListItems).mockReturnValue(
        new Promise<ListItem[]>((r) => {
          landPoll = r
        }) as never,
      )
      vi.mocked(api.getListUpdatedAt).mockResolvedValue({
        updated_at: '2026-01-02T00:00:00',
      } as never)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      await waitFor(() => expect(api.getListItems).toHaveBeenCalledTimes(2))

      await act(async () => {
        ackUpdate()
        await toggle
      })
      await act(async () =>
        landPoll([{ ...item1, name: 'Leche entera', purchased: true }]),
      )
      await waitFor(() => expect(result.current.items[0].purchased).toBe(true))
      expect(result.current.items[0].name).toBe('Leche')

      // updated_at no longer moves, so only a renewed request can recover it.
      vi.mocked(api.getListItems).mockResolvedValue([
        { ...item1, name: 'Leche entera', purchased: true },
      ] as never)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })

      await waitFor(() =>
        expect(result.current.items[0].name).toBe('Leche entera'),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not cache a list whose items belong to another one', async () => {
    // The second list paints from its cache and then fails to read, so the
    // members of the first list are the last ones this hook saw.
    localStorage.setItem(
      'cqs_list_cache_list-2',
      JSON.stringify({
        items: [{ ...item1, id: 'item-8', list_id: 'list-2', name: 'Arroz' }],
        members: mockRawMembers,
      }),
    )

    const { result, rerender } = renderHook(
      ({ id }) => useListItems(id, mockGetToken, mockShowToast),
      { initialProps: { id: 'list-1' } },
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    vi.mocked(api.getListItems).mockRejectedValue(new Error('Network'))
    rerender({ id: 'list-2' })
    await waitFor(() => expect(result.current.items[0].id).toBe('item-8'))

    // Back on the first list, whose cache is gone and whose read never lands.
    localStorage.removeItem('cqs_list_cache_list-1')
    rerender({ id: 'list-1' })
    await waitFor(() => expect(api.getListItems).toHaveBeenCalledTimes(3))

    expect(localStorage.getItem('cqs_list_cache_list-1')).toBeNull()
  })

  it('does not duplicate an added item the read already carried', async () => {
    seedCache()
    const landRead = pendingItemsRead()
    let ackCreate!: (created: ListItem) => void
    vi.mocked(api.createItem).mockReturnValue(
      new Promise<ListItem>((r) => {
        ackCreate = r
      }) as never,
    )

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    let add!: Promise<void>
    await act(async () => {
      add = result.current.addItem({
        name: 'Pan',
        quantity: null,
        brand: null,
        stores: [],
      })
      await Promise.resolve()
    })
    expect(result.current.items).toHaveLength(2)

    // The read already carries the created item, under its real id.
    act(() => landRead())
    await waitFor(() => expect(result.current.items).toHaveLength(3))

    await act(async () => {
      ackCreate(item2)
      await add
    })

    expect(result.current.items.filter((i) => i.id === 'item-2')).toHaveLength(
      1,
    )
  })

  it('applies the read when no write raced it', async () => {
    seedCache()
    const landRead = pendingItemsRead()

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    act(() => landRead())
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    expect(result.current.items.find((i) => i.id === 'item-1')?.purchased).toBe(
      false,
    )
  })
})

describe('useListItems — a poll that lands after a write settles', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  // The write starts before the poll does and is acknowledged while the poll
  // is in flight. The server may or may not have applied it when the poll ran,
  // so the poll cannot be trusted for that item either.
  it('keeps a purchase acknowledged while the poll was in flight', async () => {
    let ackUpdate!: () => void
    vi.mocked(api.updateItem).mockReturnValue(
      new Promise<void>((r) => {
        ackUpdate = () => r()
      }) as never,
    )

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    let toggle!: Promise<void>
    await act(async () => {
      toggle = result.current.togglePurchased('item-1')
      await Promise.resolve()
    })
    expect(result.current.items[0].purchased).toBe(true)

    let landPoll!: (items: ListItem[]) => void
    vi.mocked(api.getListItems).mockReturnValue(
      new Promise<ListItem[]>((r) => {
        landPoll = r
      }) as never,
    )
    vi.mocked(api.getListUpdatedAt).mockResolvedValue({
      updated_at: '2026-01-02T00:00:00',
    } as never)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await waitFor(() => expect(api.getListItems).toHaveBeenCalledTimes(2))

    await act(async () => {
      ackUpdate()
      await toggle
    })

    await act(async () => landPoll([item1, item2]))
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    expect(result.current.items.find((i) => i.id === 'item-1')?.purchased).toBe(
      true,
    )
  })
})

describe('useListItems — offline guard', () => {
  beforeEach(() => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.createItem).mockClear()
    vi.mocked(api.updateItem).mockClear()
  })

  afterEach(() => {
    reportRequestOutcome(true)
  })

  it('addItem: refuses with a toast and touches nothing', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    reportRequestOutcome(false)
    await act(async () => {
      await result.current.addItem({
        name: 'Nueva',
        quantity: null,
        brand: null,
        stores: [],
      })
    })

    expect(result.current.items).toHaveLength(1)
    expect(api.createItem).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith('Sin conexión')
  })

  it('togglePurchased: refuses with a toast and touches nothing', async () => {
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    reportRequestOutcome(false)
    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(result.current.items[0].purchased).toBe(false)
    expect(api.updateItem).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledWith('Sin conexión')
  })
})
