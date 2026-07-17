import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useApplePlatform } from './useApplePlatform'

const originalUserAgent = window.navigator.userAgent

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
}

afterEach(() => {
  setUserAgent(originalUserAgent)
})

describe('useApplePlatform', () => {
  it.each([
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true],
    ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', true],
    ['Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', true],
    ['Android', 'Mozilla/5.0 (Linux; Android 14)', false],
    ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', false],
  ])('userAgent containing %s resolves to %s', (_label, ua, expected) => {
    setUserAgent(ua)
    const { result } = renderHook(() => useApplePlatform())
    expect(result.current).toBe(expected)
  })
})
