import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getLastPriceStore, setLastPriceStore } from './lastPriceStore'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('returns null when localStorage is empty', () => {
  expect(getLastPriceStore()).toBeNull()
})

test('stores and retrieves store name before TTL expires', () => {
  const now = Date.now()
  vi.setSystemTime(now)

  setLastPriceStore('Mercadona')
  expect(getLastPriceStore()).toBe('Mercadona')

  // Advance time by 30 minutes (less than 1hr TTL)
  vi.advanceTimersByTime(30 * 60 * 1000)
  expect(getLastPriceStore()).toBe('Mercadona')

  // Advance past TTL (1hr + 1s)
  vi.advanceTimersByTime(30 * 60 * 1000 + 1000)
  expect(getLastPriceStore()).toBeNull()
})

test('returns null if JSON parsing fails', () => {
  localStorage.setItem('cqs_last_price_store', '{invalid json}')
  expect(getLastPriceStore()).toBeNull()
})

test('handles localStorage exceptions gracefully', () => {
  // Mock getItem to throw
  const spyGet = vi
    .spyOn(Storage.prototype, 'getItem')
    .mockImplementation(() => {
      throw new Error('SecurityError')
    })
  expect(getLastPriceStore()).toBeNull()
  spyGet.mockRestore()

  // Mock setItem to throw
  const spySet = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
  expect(() => setLastPriceStore('Mercadona')).not.toThrow()
  spySet.mockRestore()
})
