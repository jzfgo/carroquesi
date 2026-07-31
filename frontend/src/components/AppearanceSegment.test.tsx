import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import { initTheme, resetThemeForTests } from '../lib/theme'
import { AppearanceSegment } from './AppearanceSegment'

/** Returns the phone's own switch: `flip(true)` is the OS going dark while the
 *  app is open, which is a different path from starting dark and is the one
 *  `watchSystem` exists for. The listener set is shared by every MediaQueryList
 *  this mock hands out, so whoever subscribed gets called. */
function setSystemDark(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  let matches = dark
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return matches
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  return function flip(next: boolean) {
    matches = next
    listeners.forEach((fn) => fn({ matches: next } as MediaQueryListEvent))
  }
}

beforeEach(() => {
  localStorage.clear()
  resetThemeForTests()
  document.documentElement.className = ''
  setSystemDark(false)
})

test('offers exactly the three choices, in spec order', () => {
  render(<AppearanceSegment />)
  const options = screen.getAllByRole('radio')
  expect(options.map((o) => o.textContent)).toEqual([
    'Claro',
    'Oscuro',
    'Sistema',
  ])
})

test('"Sistema" is the factory setting — a two-state toggle could not say it', () => {
  render(<AppearanceSegment />)
  expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Claro' })).not.toBeChecked()
})

test('choosing a mode moves the selection and persists it on the device', async () => {
  render(<AppearanceSegment />)
  await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))

  expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
  expect(screen.getByRole('radio', { name: 'Sistema' })).not.toBeChecked()
  expect(localStorage.getItem('cqs_theme')).toBe('dark')
})

test('a stored choice survives a remount', () => {
  localStorage.setItem('cqs_theme', 'light')
  resetThemeForTests()
  render(<AppearanceSegment />)
  expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked()
})

test('a corrupt stored value falls back to following the system', () => {
  localStorage.setItem('cqs_theme', 'sepia')
  resetThemeForTests()
  render(<AppearanceSegment />)
  expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked()
})

test('the theme class lands on <html>, because :root is where the aliases are', async () => {
  render(<AppearanceSegment />)
  await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))

  expect(document.documentElement).toHaveClass('theme-dark')
  expect(document.documentElement).not.toHaveClass('theme-light')
  expect(document.body).not.toHaveClass('theme-dark')
})

test('"Sistema" on a dark phone paints dark without storing "dark"', () => {
  setSystemDark(true)
  resetThemeForTests()
  initTheme()
  render(<AppearanceSegment />)

  expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked()
  expect(document.documentElement).toHaveClass('theme-dark')
  expect(localStorage.getItem('cqs_theme')).toBeNull()
})

test('the first paint happens before React renders, so dark never flashes white', () => {
  // index.html ships this tag; jsdom does not load it, so stand one up.
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', '#eef1f5')
  document.head.append(meta)

  setSystemDark(true)
  resetThemeForTests()
  initTheme()

  expect(document.documentElement).toHaveClass('theme-dark')
  // The browser chrome is the one surface CSS cannot reach, and on a phone it
  // sits directly against the sheet.
  expect(meta.getAttribute('content')).toBe('#252731')
  meta.remove()
})

test('"Sistema" follows the phone when it goes dark at sunset, app still open', () => {
  const flip = setSystemDark(false)
  resetThemeForTests()
  initTheme()
  render(<AppearanceSegment />)
  expect(document.documentElement).toHaveClass('theme-light')

  act(() => flip(true))

  expect(document.documentElement).toHaveClass('theme-dark')
  expect(document.documentElement).not.toHaveClass('theme-light')
  // Still deferring, not converted into a stored 'dark'.
  expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked()
  expect(localStorage.getItem('cqs_theme')).toBeNull()
})

test('an explicit choice ignores the phone — that is what choosing means', async () => {
  const flip = setSystemDark(false)
  resetThemeForTests()
  initTheme()
  render(<AppearanceSegment />)
  await userEvent.click(screen.getByRole('radio', { name: 'Claro' }))

  act(() => flip(true))

  expect(document.documentElement).toHaveClass('theme-light')
  expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked()
})

test('a write failure still honours the choice for this session', async () => {
  const setItem = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('quota')
    })
  setSystemDark(true)
  resetThemeForTests()
  initTheme()
  render(<AppearanceSegment />)
  await userEvent.click(screen.getByRole('radio', { name: 'Claro' }))

  expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked()
  expect(document.documentElement).toHaveClass('theme-light')
  setItem.mockRestore()
})
