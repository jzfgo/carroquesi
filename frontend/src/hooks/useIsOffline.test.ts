import { act, renderHook } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { useIsOffline } from './useIsOffline'

describe('useIsOffline — online state', () => {
  it('isOffline is false when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    })
    const { result } = renderHook(() => useIsOffline(!navigator.onLine))
    expect(result.current.isOffline).toBe(false)
  })

  it('isOffline is true when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    })
    const { result } = renderHook(() => useIsOffline(!navigator.onLine))
    expect(result.current.isOffline).toBe(true)
  })

  it('isOffline becomes true on offline event', () => {
    const { result } = renderHook(() => useIsOffline(false))
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current.isOffline).toBe(true)
  })

  it('isOffline becomes false on online event', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    })
    const { result } = renderHook(() => useIsOffline(true))
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current.isOffline).toBe(false)
  })
})
