import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPreference, resolve, setPreference, subscribe } from './theme'

const KEY = 'cqs_theme'

beforeEach(() => {
  localStorage.removeItem(KEY)
})

describe('getPreference', () => {
  it('defaults to system when nothing is stored', () => {
    expect(getPreference()).toBe('system')
  })

  it('returns a stored light or dark preference', () => {
    localStorage.setItem(KEY, 'light')
    expect(getPreference()).toBe('light')
    localStorage.setItem(KEY, 'dark')
    expect(getPreference()).toBe('dark')
  })

  it('treats an invalid stored value as system', () => {
    localStorage.setItem(KEY, 'sepia')
    expect(getPreference()).toBe('system')
  })

  it('treats unavailable storage as system', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      expect(getPreference()).toBe('system')
    } finally {
      spy.mockRestore()
    }
  })
})

describe('setPreference', () => {
  it('persists light and dark under cqs_theme', () => {
    setPreference('light')
    expect(localStorage.getItem(KEY)).toBe('light')
    setPreference('dark')
    expect(localStorage.getItem(KEY)).toBe('dark')
  })

  it('removes the key for system — absence is the default', () => {
    setPreference('dark')
    setPreference('system')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('still notifies subscribers when storage throws', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    try {
      setPreference('dark')
      expect(listener).toHaveBeenCalledWith('dark')
    } finally {
      spy.mockRestore()
      unsubscribe()
    }
  })
})

describe('subscribe', () => {
  it('notifies on every change until unsubscribed', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)
    setPreference('light')
    expect(listener).toHaveBeenCalledWith('light')
    unsubscribe()
    setPreference('dark')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('resolve', () => {
  it('resolves system from the OS signal', () => {
    expect(resolve('system', true)).toBe('dark')
    expect(resolve('system', false)).toBe('light')
  })

  it('an explicit preference ignores the OS signal', () => {
    expect(resolve('light', true)).toBe('light')
    expect(resolve('dark', false)).toBe('dark')
  })
})
