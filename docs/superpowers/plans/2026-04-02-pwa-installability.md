# PWA Installability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CarroQueSí installable as a PWA (Add to Home Screen on Android and iOS) with a CQ monogram icon, a one-shot install banner, and a persistent install entry in the avatar dropdown menu.

**Architecture:** `vite-plugin-pwa` generates the manifest and a minimal no-cache service worker. A `usePWAInstall` hook (called once in `DashboardScreen`) captures the `beforeinstallprompt` event and exposes install state to both the `InstallBanner` (shows once, above the list) and the avatar dropdown menu (always available). The avatar button is converted from a direct sign-out to a dropdown with "Instalar app" + "Cerrar sesión" entries.

**Tech Stack:** `vite-plugin-pwa` (Vite plugin), `@vite-pwa/assets-generator` (CLI, dev-only), React hooks, jsdom + Vitest for tests.

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `frontend/public/icon.svg` | Create | CQ monogram SVG — source for icon generation |
| `frontend/public/pwa-64x64.png` | Generate | Small icon |
| `frontend/public/pwa-192x192.png` | Generate | Android home screen icon |
| `frontend/public/pwa-512x512.png` | Generate | Chrome install splash icon |
| `frontend/public/maskable-icon-512x512.png` | Generate | Android adaptive (maskable) icon |
| `frontend/public/apple-touch-icon-180x180.png` | Generate | iOS home screen icon |
| `frontend/pwa-assets.config.ts` | Create | Icon generation config (not bundled — dev only) |
| `frontend/vite.config.ts` | Modify | Add VitePWA plugin with manifest + workbox config |
| `frontend/index.html` | Modify | Add `theme-color` meta, `apple-touch-icon` link |
| `frontend/src/hooks/usePWAInstall.ts` | Create | Capture `beforeinstallprompt`, expose install state |
| `frontend/src/hooks/usePWAInstall.test.ts` | Create | Unit tests for the hook |
| `frontend/src/components/InstallBanner.tsx` | Create | One-shot install banner component |
| `frontend/src/components/InstallBanner.css` | Create | Banner styles |
| `frontend/src/components/InstallBanner.test.tsx` | Create | Unit tests for the banner |
| `frontend/src/components/DashboardScreen.tsx` | Modify | Call `usePWAInstall`, add `InstallBanner`, convert avatar to dropdown |
| `frontend/src/components/DashboardScreen.css` | Modify | Avatar dropdown + wrapper styles |
| `frontend/src/components/DashboardScreen.test.tsx` | Modify | Mock `usePWAInstall`, update sign-out test, add dropdown + banner tests |

---

## Task 1: Install dependencies and create the icon SVG

**Files:**
- Create: `frontend/public/icon.svg`
- Create: `frontend/pwa-assets.config.ts`

- [ ] **Step 1: Install vite-plugin-pwa**

```bash
cd frontend
npm install -D vite-plugin-pwa
```

Expected: `package.json` gains `"vite-plugin-pwa"` under `devDependencies`.

- [ ] **Step 2: Install the icon generator**

```bash
npm install -D @vite-pwa/assets-generator
```

Expected: `package.json` gains `"@vite-pwa/assets-generator"` under `devDependencies`.

- [ ] **Step 3: Create the SVG icon source**

```xml
<!-- frontend/public/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="115" fill="#aa3bff"/>
  <text
    x="256"
    y="345"
    text-anchor="middle"
    font-size="256"
    font-weight="900"
    font-family="system-ui, -apple-system, sans-serif"
    fill="white"
  >CQ</text>
  <circle cx="390" cy="140" r="72" fill="#ffd700"/>
  <path
    d="M362 140l20 20 44-42"
    stroke="#aa3bff"
    stroke-width="18"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
  />
</svg>
```

- [ ] **Step 4: Create the icon generator config**

```ts
// frontend/pwa-assets.config.ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/icon.svg'],
})
```

`minimal2023Preset` generates: `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`, `favicon.svg`.

- [ ] **Step 5: Run the icon generator**

```bash
cd frontend
npx @vite-pwa/assets-generator --config pwa-assets.config.ts
```

Expected output lists each generated file. Verify with:

```bash
ls public/*.png public/*.ico
```

Expected: `apple-touch-icon-180x180.png  maskable-icon-512x512.png  pwa-192x192.png  pwa-512x512.png  pwa-64x64.png` plus `favicon.ico`.

> **Note:** The generator also writes `public/favicon.svg` — this will overwrite any existing `favicon.svg`. Check `git diff public/favicon.svg` afterwards; if the existing one was meaningful, restore it with `git checkout -- public/favicon.svg` and keep only the PNGs.

- [ ] **Step 6: Commit**

```bash
cd frontend
git add public/icon.svg public/*.png public/*.ico pwa-assets.config.ts package.json package-lock.json
git commit -m "feat: add PWA icon SVG and generate PNG assets"
```

---

## Task 2: Configure vite-plugin-pwa and update index.html

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/index.html`

- [ ] **Step 1: Update vite.config.ts**

Replace the full file content:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      workbox: {
        navigateFallback: null,
        runtimeCaching: [],
      },
      devOptions: {
        enabled: true,
      },
      manifest: {
        name: 'CarroQueSí',
        short_name: 'Carroquesí',
        description: 'Lista de compras colaborativa',
        theme_color: '#aa3bff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: true,
  },
})
```

- [ ] **Step 2: Update index.html**

Add `theme-color` meta and `apple-touch-icon` link inside `<head>`, after the viewport meta:

```html
<meta name="theme-color" content="#aa3bff" />
<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

The `<head>` block should look like:

```html
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#aa3bff" />
  <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
  <title>CarroQueSí</title>
  <meta property="og:title" content="CarroQueSí" />
  <meta property="og:description" content="Lista de la compra colaborativa" />
  <meta property="og:type" content="website" />
</head>
```

- [ ] **Step 3: Verify dev server starts cleanly**

```bash
cd frontend
npm run dev
```

Expected: Vite starts without errors. Open `http://localhost:5173` in Chrome, open DevTools → Application → Manifest — you should see CarroQueSí with all icon sizes listed.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts index.html
git commit -m "feat: configure vite-plugin-pwa manifest and update index.html"
```

---

## Task 3: usePWAInstall hook (TDD)

**Files:**
- Create: `frontend/src/hooks/usePWAInstall.ts`
- Create: `frontend/src/hooks/usePWAInstall.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/hooks/usePWAInstall.test.ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePWAInstall } from './usePWAInstall'

// jsdom doesn't implement matchMedia — provide a mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  })),
})

function makeInstallEvent() {
  const promptFn = vi.fn().mockResolvedValue(undefined)
  const userChoice = Promise.resolve({ outcome: 'accepted' as const })
  return Object.assign(new Event('beforeinstallprompt'), { prompt: promptFn, userChoice })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }))
})

describe('usePWAInstall', () => {
  it('isInstallable is false before beforeinstallprompt fires', () => {
    const { result } = renderHook(() => usePWAInstall())
    expect(result.current.isInstallable).toBe(false)
  })

  it('isInstallable becomes true when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => usePWAInstall())
    act(() => { window.dispatchEvent(makeInstallEvent()) })
    expect(result.current.isInstallable).toBe(true)
  })

  it('isInstalled is false when matchMedia returns false', () => {
    const { result } = renderHook(() => usePWAInstall())
    expect(result.current.isInstalled).toBe(false)
  })

  it('isInstalled is true when display-mode: standalone matches', () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }))
    const { result } = renderHook(() => usePWAInstall())
    expect(result.current.isInstalled).toBe(true)
  })

  it('isInstalled becomes true after appinstalled fires', () => {
    const { result } = renderHook(() => usePWAInstall())
    expect(result.current.isInstalled).toBe(false)
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(result.current.isInstalled).toBe(true)
  })

  it('promptInstall calls prompt() on the deferred event', async () => {
    const fakeEvent = makeInstallEvent()
    const { result } = renderHook(() => usePWAInstall())
    act(() => { window.dispatchEvent(fakeEvent) })
    await act(async () => { await result.current.promptInstall() })
    expect((fakeEvent as unknown as { prompt: ReturnType<typeof vi.fn> }).prompt).toHaveBeenCalled()
  })

  it('isInstallable becomes false after promptInstall is called', async () => {
    const fakeEvent = makeInstallEvent()
    const { result } = renderHook(() => usePWAInstall())
    act(() => { window.dispatchEvent(fakeEvent) })
    await act(async () => { await result.current.promptInstall() })
    expect(result.current.isInstallable).toBe(false)
  })

  it('promptInstall is a no-op when no deferred prompt exists', async () => {
    const { result } = renderHook(() => usePWAInstall())
    // Should not throw
    await act(async () => { await result.current.promptInstall() })
  })

  it('isIOS is false in jsdom (non-iOS userAgent)', () => {
    const { result } = renderHook(() => usePWAInstall())
    expect(result.current.isIOS).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests — verify they all fail**

```bash
cd frontend
npx vitest run src/hooks/usePWAInstall.test.ts
```

Expected: all tests fail with "Cannot find module './usePWAInstall'".

- [ ] **Step 3: Implement the hook**

```ts
// frontend/src/hooks/usePWAInstall.ts
import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface UsePWAInstallResult {
  isInstallable: boolean
  isInstalled: boolean
  isIOS: boolean
  promptInstall: () => Promise<void>
}

export function usePWAInstall(): UsePWAInstallResult {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches
  )

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    'standalone' in navigator &&
    !(navigator as Navigator & { standalone?: boolean }).standalone

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    const handler = () => setIsInstalled(true)
    window.addEventListener('appinstalled', handler)
    return () => window.removeEventListener('appinstalled', handler)
  }, [])

  const promptInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setIsInstalled(true)
    setDeferredPrompt(null)
  }

  return { isInstallable: deferredPrompt !== null, isInstalled, isIOS, promptInstall }
}
```

- [ ] **Step 4: Run the tests — verify they all pass**

```bash
npx vitest run src/hooks/usePWAInstall.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePWAInstall.ts src/hooks/usePWAInstall.test.ts
git commit -m "feat: usePWAInstall hook — capture beforeinstallprompt, expose install state"
```

---

## Task 4: InstallBanner component (TDD)

**Files:**
- Create: `frontend/src/components/InstallBanner.tsx`
- Create: `frontend/src/components/InstallBanner.css`
- Create: `frontend/src/components/InstallBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/InstallBanner.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InstallBanner } from './InstallBanner'

const defaults = {
  isInstallable: true,
  isInstalled: false,
  isIOS: false,
  promptInstall: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('InstallBanner', () => {
  it('renders when installable and not dismissed', () => {
    render(<InstallBanner {...defaults} />)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('does not render when not installable and not iOS', () => {
    render(<InstallBanner {...defaults} isInstallable={false} />)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('does not render when already installed', () => {
    render(<InstallBanner {...defaults} isInstalled={true} />)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('does not render when pwa-install-dismissed is set in localStorage', () => {
    localStorage.setItem('pwa-install-dismissed', '1')
    render(<InstallBanner {...defaults} />)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('dismiss button sets localStorage and removes the banner', async () => {
    render(<InstallBanner {...defaults} />)
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(localStorage.getItem('pwa-install-dismissed')).toBe('1')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('install button calls promptInstall', async () => {
    const promptInstall = vi.fn<[], Promise<void>>().mockResolvedValue(undefined)
    render(<InstallBanner {...defaults} promptInstall={promptInstall} />)
    await userEvent.click(screen.getByRole('button', { name: /instalar/i }))
    expect(promptInstall).toHaveBeenCalledOnce()
  })

  it('renders iOS instructions when isIOS is true', () => {
    render(<InstallBanner {...defaults} isInstallable={false} isIOS={true} />)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByText(/compartir/i)).toBeInTheDocument()
  })

  it('hides the install button on iOS', () => {
    render(<InstallBanner {...defaults} isInstallable={false} isIOS={true} />)
    expect(screen.queryByRole('button', { name: /instalar/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
npx vitest run src/components/InstallBanner.test.tsx
```

Expected: all tests fail with "Cannot find module './InstallBanner'".

- [ ] **Step 3: Implement InstallBanner**

```tsx
// frontend/src/components/InstallBanner.tsx
import { useState } from 'react'
import './InstallBanner.css'

const DISMISSED_KEY = 'pwa-install-dismissed'

interface Props {
  isInstallable: boolean
  isInstalled: boolean
  isIOS: boolean
  promptInstall: () => Promise<void>
}

export function InstallBanner({ isInstallable, isInstalled, isIOS, promptInstall }: Props) {
  const [dismissed, setDismissed] = useState(() => Boolean(localStorage.getItem(DISMISSED_KEY)))

  if (isInstalled || dismissed || (!isInstallable && !isIOS)) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <aside className="install-banner" role="complementary">
      <div className="install-banner__icon" aria-hidden="true">CQ</div>
      <p className="install-banner__text">
        {isIOS ? (
          <>Toca <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong></>
        ) : (
          <>Instala <strong>CarroQueSí</strong> en tu pantalla de inicio</>
        )}
      </p>
      {!isIOS && (
        <button className="install-banner__cta" onClick={() => void promptInstall()}>
          Instalar
        </button>
      )}
      <button className="install-banner__dismiss" aria-label="Cerrar" onClick={handleDismiss}>
        ✕
      </button>
    </aside>
  )
}
```

- [ ] **Step 4: Add banner styles**

```css
/* frontend/src/components/InstallBanner.css */
.install-banner {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  background: var(--color-primary);
  color: #fff;
  border-radius: 12px;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
}

.install-banner__icon {
  width: 28px;
  height: 28px;
  background: #fff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  font-weight: 900;
  font-size: 11px;
  flex-shrink: 0;
}

.install-banner__text {
  flex: 1;
  margin: 0;
  line-height: 1.4;
}

.install-banner__cta {
  background: #fff;
  color: var(--color-primary);
  border: none;
  border-radius: 6px;
  padding: 0.25rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.install-banner__dismiss {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  padding: 0;
  font-size: 0.875rem;
  line-height: 1;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Run tests — verify they all pass**

```bash
npx vitest run src/components/InstallBanner.test.tsx
```

Expected: all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/InstallBanner.tsx src/components/InstallBanner.css src/components/InstallBanner.test.tsx
git commit -m "feat: InstallBanner — one-shot PWA install prompt with iOS fallback"
```

---

## Task 5: DashboardScreen — avatar dropdown + InstallBanner wiring (TDD)

**Files:**
- Modify: `frontend/src/components/DashboardScreen.tsx`
- Modify: `frontend/src/components/DashboardScreen.css`
- Modify: `frontend/src/components/DashboardScreen.test.tsx`

- [ ] **Step 1: Add new tests to DashboardScreen.test.tsx**

Add a `vi.mock` for `usePWAInstall` at the top of the test file (after the existing mocks), and add new `describe` blocks. Also update the existing sign-out test (line 99–105 in the current file) since the avatar now opens a menu instead of signing out directly.

At the top of the test file, after the existing `vi.mock` calls, add:

```ts
import * as usePWAInstallModule from '../hooks/usePWAInstall'
vi.mock('../hooks/usePWAInstall')
```

In `beforeEach`, add the default mock return:

```ts
vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
  isInstallable: false,
  isInstalled: false,
  isIOS: false,
  promptInstall: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
})
```

Replace the existing `'calls signOut when avatar is clicked'` test with:

```ts
it('opens avatar menu on avatar click and calls signOut via menu item', async () => {
  vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
  render(<DashboardScreen />)
  await waitFor(() => screen.getByText('Mercado'))
  fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
  expect(screen.getByRole('menu')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }))
  expect(mockSignOut).toHaveBeenCalledOnce()
})
```

Add a new describe block at the end of the file:

```ts
describe('DashboardScreen — avatar menu and install banner', () => {
  it('avatar menu closes when clicking outside', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('avatar menu closes when Escape is pressed', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('avatar menu shows "Instalar app" when installable', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.getByRole('menuitem', { name: /instalar app/i })).toBeInTheDocument()
  })

  it('avatar menu hides "Instalar app" when not installable and not iOS', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    expect(screen.queryByRole('menuitem', { name: /instalar app/i })).not.toBeInTheDocument()
  })

  it('clicking "Instalar app" calls promptInstall and closes menu', async () => {
    const mockPromptInstall = vi.fn<[], Promise<void>>().mockResolvedValue(undefined)
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: mockPromptInstall,
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    fireEvent.click(screen.getByRole('button', { name: /menú de usuario/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /instalar app/i }))
    expect(mockPromptInstall).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('renders InstallBanner when installable', async () => {
    vi.mocked(usePWAInstallModule.usePWAInstall).mockReturnValue({
      isInstallable: true,
      isInstalled: false,
      isIOS: false,
      promptInstall: vi.fn<[], Promise<void>>().mockResolvedValue(undefined),
    })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('does not render InstallBanner when not installable and not iOS', async () => {
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)
    render(<DashboardScreen />)
    await waitFor(() => screen.getByText('Mercado'))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests — verify new tests fail, existing pass**

```bash
npx vitest run src/components/DashboardScreen.test.tsx
```

Expected: the existing tests pass. The new tests and the updated sign-out test fail with "Unable to find role 'menu'" and similar.

- [ ] **Step 3: Update DashboardScreen.tsx**

Replace the file with the updated implementation. Key changes: import `useRef`, `usePWAInstall`, `InstallBanner`; add `menuOpen` state and `menuRef`; add two useEffects for close-on-outside-click and close-on-Escape; convert avatar button to a wrapper div with dropdown.

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import './DashboardScreen.css'
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { getLists, createList, renameList, deleteList } from '../lib/api'
import { SortableListCard } from './SortableListCard'
import { CreateListCard } from './CreateListCard'
import { ListScreen } from './ListScreen'
import { ListActionSheet } from './ListActionSheet'
import { InstallBanner } from './InstallBanner'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { useLocation } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ApiList } from '../types'

function loadOrder(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(`list-order-${userId}`)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function saveOrder(userId: string, ids: string[]) {
  localStorage.setItem(`list-order-${userId}`, JSON.stringify(ids))
}

function applyOrder(lists: ApiList[], order: string[] | null): ApiList[] {
  if (!order) return lists
  const map = new Map(lists.map(l => [l.id, l]))
  const sorted = order.flatMap(id => (map.has(id) ? [map.get(id)!] : []))
  const rest = lists.filter(l => !order.includes(l.id))
  return [...sorted, ...rest]
}

export function DashboardScreen() {
  const { user, getToken, signOut } = useAuth()
  const [lists, setLists] = useState<ApiList[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [selectedList, setSelectedList] = useState<ApiList | null>(null)
  usePageTitle(selectedList?.name ?? undefined)
  const [activeList, setActiveList] = useState<ApiList | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const openListIdRef = useRef<string | null>(
    (location.state as { openListId?: string } | null)?.openListId ?? null
  )
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall()

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  const fetchLists = useCallback(async () => {
    setLists(null)
    setFetchError(false)
    try {
      const data = (await getLists(getToken)) as ApiList[]
      const ordered = applyOrder(data, loadOrder(user!.id))
      setLists(ordered)
      if (openListIdRef.current) {
        const list = ordered.find(l => l.id === openListIdRef.current)
        if (list) setSelectedList(list)
        openListIdRef.current = null
      }
    } catch {
      setFetchError(true)
    }
  }, [getToken, user])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLists(prev => {
      if (!prev) return prev
      const oldIndex = prev.findIndex(l => l.id === active.id)
      const newIndex = prev.findIndex(l => l.id === over.id)
      const next = arrayMove(prev, oldIndex, newIndex)
      saveOrder(user!.id, next.map(l => l.id))
      return next
    })
  }, [user])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLists()
  }, [fetchLists])

  const handleCreate = useCallback(
    async (name: string) => {
      await createList(getToken, name)
      await fetchLists()
    },
    [getToken, fetchLists],
  )

  const handleRename = useCallback(
    async (list: ApiList, newName: string) => {
      let snapshot: ApiList[] | null = null
      setLists(prev => {
        snapshot = prev
        return prev ? prev.map(l => l.id === list.id ? { ...l, name: newName } : l) : prev
      })
      setActiveList(null)
      try {
        await renameList(getToken, list.id, newName)
      } catch {
        setLists(snapshot)
        setToast('No se pudo renombrar la lista')
      }
    },
    [getToken],
  )

  const handleDelete = useCallback(
    async (list: ApiList) => {
      setActiveList(null)
      try {
        await deleteList(getToken, list.id)
        setLists(prev => prev ? prev.filter(l => l.id !== list.id) : prev)
      } catch {
        setToast('No se pudo eliminar la lista')
      }
    },
    [getToken],
  )

  if (selectedList) {
    return (
      <ListScreen
        listId={selectedList.id}
        listName={selectedList.name}
        listOwnerId={selectedList.owner_id}
        onBack={() => setSelectedList(null)}
      />
    )
  }

  if (fetchError) {
    return (
      <div className="dashboard-screen dashboard-screen--centered">
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          No se pudieron cargar tus listas
        </p>
        <button
          className="dashboard-screen__retry"
          onClick={() => void fetchLists()}
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (lists === null) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        className="dashboard-screen dashboard-screen--centered"
      >
        <span className="dashboard-screen__spinner" />
      </div>
    )
  }

  const showInstallEntry = (isInstallable || isIOS) && !isInstalled

  return (
    <div className="dashboard-screen">
      <header className="dashboard-screen__header">
        <h1 className="dashboard-screen__title">CarroQueSí</h1>
        <div className="dashboard-screen__avatar-wrapper" ref={menuRef}>
          <button
            className="dashboard-screen__avatar"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menú de usuario"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt={user.displayName} />
            ) : (
              <span>{user?.displayName?.[0] ?? '?'}</span>
            )}
          </button>
          {menuOpen && (
            <div className="dashboard-screen__avatar-menu" role="menu">
              {showInstallEntry && (
                <button
                  className="dashboard-screen__avatar-menu-item"
                  role="menuitem"
                  onClick={() => { void promptInstall(); setMenuOpen(false) }}
                >
                  Instalar app
                </button>
              )}
              <button
                className="dashboard-screen__avatar-menu-item"
                role="menuitem"
                onClick={() => { void signOut(); setMenuOpen(false) }}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="dashboard-screen__lists">
        <InstallBanner
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          promptInstall={promptInstall}
        />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={lists.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {lists.map((list) => (
              <SortableListCard
                key={list.id}
                list={list}
                onClick={() => { setSelectedList(list); setActiveList(null) }}
                onMenuOpen={() => { setActiveList(list) }}
              />
            ))}
          </SortableContext>
        </DndContext>
        <CreateListCard isFirst={lists.length === 0} onCreate={handleCreate} />
      </main>
      {activeList && (
        <ListActionSheet
          list={activeList}
          isOwner={activeList.owner_id === (user?.id ?? '')}
          onRename={newName => void handleRename(activeList, newName)}
          onDelete={() => void handleDelete(activeList)}
          onClose={() => setActiveList(null)}
        />
      )}
      {toast && (
        <div className="dashboard-screen__toast" role="alert">{toast}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add avatar dropdown styles to DashboardScreen.css**

Append to the end of `frontend/src/components/DashboardScreen.css`:

```css
.dashboard-screen__avatar-wrapper {
  position: relative;
}

.dashboard-screen__avatar-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  min-width: 160px;
  overflow: hidden;
  z-index: 100;
}

.dashboard-screen__avatar-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: none;
  background: none;
  font-size: 0.875rem;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.dashboard-screen__avatar-menu-item:hover {
  background: var(--color-bg);
}

.dashboard-screen__avatar-menu-item + .dashboard-screen__avatar-menu-item {
  border-top: 1px solid var(--color-border);
}
```

- [ ] **Step 5: Run all tests — verify everything passes**

```bash
npx vitest run src/components/DashboardScreen.test.tsx
```

Expected: all tests pass including the updated sign-out test and all new dropdown + banner tests.

Run the full suite to confirm nothing regressed:

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 6: Run lint and typecheck**

```bash
npm run lint
npx tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/DashboardScreen.tsx src/components/DashboardScreen.css src/components/DashboardScreen.test.tsx
git commit -m "feat: avatar dropdown menu with install entry, wire InstallBanner into dashboard"
```

---

## Task 6: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
cd frontend
npm run dev
```

- [ ] **Step 2: Open Chrome and check the manifest**

Open `http://localhost:5173`. Open DevTools → Application → Manifest.

Expected:
- Name: CarroQueSí
- Short name: Carroquesí
- Display: standalone
- Theme color: #aa3bff
- Icons: four entries (64, 192, 512, 512 maskable)

- [ ] **Step 3: Check the service worker**

DevTools → Application → Service Workers.

Expected: a service worker is registered for `localhost:5173`.

- [ ] **Step 4: Check installability in Chrome**

DevTools → Application → Manifest → scroll to bottom.

Expected: "Installability — Passed" (no errors). You may also see an install icon in the Chrome address bar.

- [ ] **Step 5: Verify the avatar dropdown**

Sign in. Click the avatar in the top right.

Expected: dropdown appears with "Cerrar sesión". "Instalar app" is visible if Chrome's install criteria are met. Clicking outside closes the dropdown. Pressing Escape closes the dropdown.

- [ ] **Step 6: Verify sign-out**

Open the avatar menu and click "Cerrar sesión".

Expected: signed out and returned to the sign-in screen.
