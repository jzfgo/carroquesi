import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useListItems } from './useListItems'
import * as api from '../lib/api'
import type { ListItem } from '../types'

vi.mock('../lib/api')

const mockGetToken = vi.fn().mockResolvedValue('token')
const mockShowToast = vi.fn()

const item1: ListItem = {
  id: 'item-1',
  list_id: 'list-1',
  name: 'Leche',
  quantity: null,
  brand: null,
  variety: null,
  store: null,
  purchased: false,
  added_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockRawMembers = [
  { id: 'mem-1', user_id: 'user-1', list_id: 'list-1', display_name: 'Alice', photo_url: null, created_at: '' },
]

beforeEach(() => {
  vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
  vi.mocked(api.getListMembers).mockResolvedValue(mockRawMembers as never)
  vi.mocked(api.getListUpdatedAt).mockResolvedValue({ updated_at: '2026-01-01T00:00:00' } as never)
  mockShowToast.mockReset()
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
    expect(mockShowToast).toHaveBeenCalledWith("Couldn't update item")
  })
})

describe('useListItems — addItem', () => {
  it('replaces temp item with real item on success', async () => {
    const realItem: ListItem = { ...item1, id: 'item-real', name: 'Leche Real' }
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
        variety: null,
        store: null,
      })
    })

    expect(result.current.items[0].id).toBe('item-real')
    expect(result.current.items[0].name).toBe('Leche Real')
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
        name: 'Leche',
        quantity: null,
        brand: null,
        variety: null,
        store: null,
      })
    })

    expect(result.current.items).toHaveLength(initialLength)
    expect(mockShowToast).toHaveBeenCalledWith("Couldn't add item")
  })
})

describe('useListItems — polling', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

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
    vi.mocked(api.getListUpdatedAt).mockResolvedValue({ updated_at: '2026-01-02T00:00:00' } as never)
    vi.mocked(api.getListItems).mockResolvedValue([updatedItem] as never)

    // Second poll: detects timestamp change, re-fetches
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(result.current.items[0].name).toBe('Leche Updated')
  })
})
