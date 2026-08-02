import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPreference } from '../lib/theme'
import { ThemeManager } from './ThemeManager'

type MediaListener = (e: { matches: boolean }) => void

// A controllable matchMedia: tests flip `matches` and fire the captured
// listeners to simulate the OS changing scheme while the app is open.
function stubMatchMedia(initialDark: boolean) {
  const listeners = new Set<MediaListener>()
  const mq = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_: string, fn: MediaListener) => {
      listeners.add(fn)
    },
    removeEventListener: (_: string, fn: MediaListener) => {
      listeners.delete(fn)
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  )
  return {
    setSystemDark(dark: boolean) {
      mq.matches = dark
      listeners.forEach((fn) => fn({ matches: dark }))
    },
  }
}

function metaColor(): string | null {
  return (
    document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute('content') ?? null
  )
}

beforeEach(() => {
  localStorage.removeItem('cqs_theme')
  document.documentElement.classList.remove('theme-light', 'theme-dark')
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', '#EEF1F5')
  document.head.appendChild(meta)
})

afterEach(() => {
  document.querySelector('meta[name="theme-color"]')?.remove()
  vi.unstubAllGlobals()
})

describe('ThemeManager', () => {
  it('applies no theme class for system, and resolves the meta from the OS', () => {
    stubMatchMedia(true)
    render(<ThemeManager>x</ThemeManager>)
    const root = document.documentElement
    expect(root.classList.contains('theme-light')).toBe(false)
    expect(root.classList.contains('theme-dark')).toBe(false)
    expect(metaColor()).toBe('#252731')
  })

  it('applies the stored preference to <html> on mount', () => {
    localStorage.setItem('cqs_theme', 'dark')
    stubMatchMedia(false)
    render(<ThemeManager>x</ThemeManager>)
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
    expect(metaColor()).toBe('#252731')
  })

  it('follows an OS flip live while the preference is system', () => {
    const media = stubMatchMedia(false)
    render(<ThemeManager>x</ThemeManager>)
    expect(metaColor()).toBe('#EEF1F5')
    media.setSystemDark(true)
    expect(metaColor()).toBe('#252731')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(
      false,
    )
  })

  it('ignores an OS flip once an explicit preference overrides it', () => {
    const media = stubMatchMedia(false)
    render(<ThemeManager>x</ThemeManager>)
    setPreference('light')
    media.setSystemDark(true)
    expect(document.documentElement.classList.contains('theme-light')).toBe(
      true,
    )
    expect(metaColor()).toBe('#EEF1F5')
  })

  it('reacts to setPreference: class and meta move together', () => {
    stubMatchMedia(false)
    render(<ThemeManager>x</ThemeManager>)
    setPreference('dark')
    const root = document.documentElement
    expect(root.classList.contains('theme-dark')).toBe(true)
    expect(metaColor()).toBe('#252731')
    setPreference('system')
    expect(root.classList.contains('theme-dark')).toBe(false)
    expect(metaColor()).toBe('#EEF1F5')
  })

  it('stops listening after unmount', () => {
    stubMatchMedia(false)
    const { unmount } = render(<ThemeManager>x</ThemeManager>)
    unmount()
    setPreference('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(
      false,
    )
  })
})
