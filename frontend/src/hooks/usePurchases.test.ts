import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only getPurchases is needed: the hook imports nothing else from the module,
// so nothing in this test's graph reaches an export the factory would drop.
vi.mock('../lib/api', () => ({ getPurchases: vi.fn() }))

import { getPurchases } from '../lib/api'
import type { Purchase } from '../types'
import { usePurchases } from './usePurchases'

const getToken = () => Promise.resolve('t')

const trip = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: 'p1',
  list_id: 'l1',
  opened_at: '2026-07-30T16:00:00',
  tears_off_at: '2026-07-30T22:00:00',
  closed_at: null,
  store: 'Lidl',
  total: 14.6,
  ...overrides,
})

describe('usePurchases', () => {
  beforeEach(() => {
    vi.mocked(getPurchases).mockReset()
    vi.mocked(getPurchases).mockResolvedValue([])
  })

  it('fetches on mount and exposes the trips by id', async () => {
    vi.mocked(getPurchases).mockResolvedValue([trip()])

    const { result } = renderHook(() => usePurchases('l1', getToken))

    await waitFor(() =>
      expect(result.current.byId.get('p1')?.store).toBe('Lidl'),
    )
    expect(getPurchases).toHaveBeenCalledWith(getToken, 'l1')
  })

  it('does not throw when the fetch fails', async () => {
    vi.mocked(getPurchases).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => usePurchases('l1', getToken))

    await waitFor(() => expect(getPurchases).toHaveBeenCalled())
    expect(result.current.byId.size).toBe(0)
  })

  it('recovers on the next refresh after a failed fetch', async () => {
    vi.mocked(getPurchases).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => usePurchases('l1', getToken))
    await waitFor(() => expect(getPurchases).toHaveBeenCalled())

    vi.mocked(getPurchases).mockResolvedValue([trip()])
    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() =>
      expect(result.current.byId.get('p1')?.store).toBe('Lidl'),
    )
  })

  it('refetches when the caller asks, and not on every render', async () => {
    vi.mocked(getPurchases).mockResolvedValue([trip()])

    const { result, rerender } = renderHook(() => usePurchases('l1', getToken))
    await waitFor(() => expect(result.current.byId.size).toBe(1))

    rerender()
    rerender()

    expect(getPurchases).toHaveBeenCalledTimes(1)
  })
})
