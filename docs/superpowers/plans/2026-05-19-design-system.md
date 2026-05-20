# Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic Vite/purple theme with the CarroQueSí "composition notebook" design system — cool paper background, BIC blue accent, Bree Serif / Geist / Caveat / JetBrains Mono type, and OS-driven dark mode.

**Architecture:** Token file is copied verbatim from the design handoff; `index.css` imports it and adds a compat alias block so existing components keep working during the sweep. Each component's sidecar `.css` is updated to use canonical tokens. Theme switching (26 terminal themes) is removed entirely; dark mode follows `prefers-color-scheme` via `ThemeManager`.

**Tech Stack:** React + TypeScript + Vite, CSS custom properties (no CSS-in-JS), Google Fonts via `<link>`, `@vite-pwa/assets-generator` for PWA raster generation.

**Worktree:** `.worktrees/design-system` on branch `feat/design-system`  
**Design handoff:** `../../design_handoff_design_system/` (relative to worktree root)  
**Spec:** `docs/superpowers/specs/2026-05-19-design-system-design.md`  
**Baseline:** 464 tests passing, 43 pre-existing failures (unrelated)

---

## File map

| File | Action |
|---|---|
| `frontend/src/colors_and_type.css` | **Create** — verbatim copy of token file |
| `frontend/src/index.css` | **Modify** — replace `:root` block with `@import` + compat aliases |
| `frontend/index.html` | **Modify** — add font `<link>`s, update `theme-color` |
| `frontend/src/theme/terminal-themes.css` | **Delete** |
| `frontend/src/lib/themes.ts` | **Delete** |
| `frontend/src/main.tsx` | **Modify** — remove terminal-themes import |
| `frontend/src/components/ThemeManager.tsx` | **Rewrite** — OS-driven dark mode, no localStorage |
| `frontend/src/components/SettingsScreen.tsx` | **Delete** |
| `frontend/src/components/SettingsScreen.css` | **Delete** |
| `frontend/src/App.tsx` | **Modify** — remove `/settings` route and import |
| `frontend/src/components/DashboardScreen.tsx` | **Modify** — remove "Configuración" menu item, add `<Wordmark>` |
| `frontend/src/components/Wordmark.tsx` | **Create** |
| `frontend/src/components/Wordmark.css` | **Create** |
| `frontend/src/components/SignInScreen.tsx` | **Modify** — add `<Wordmark>`, Caveat annotation, import CSS |
| `frontend/src/components/SignInScreen.css` | **Create** — lift inline styles |
| `frontend/src/components/SignInScreen.test.tsx` | **Modify** — update query to `getByLabelText` |
| `frontend/src/components/DashboardScreen.css` | **Modify** — token restyle |
| `frontend/src/components/ListHeader.css` | **Modify** — Bree Serif title |
| `frontend/src/components/ProgressBar.tsx` | **Modify** — add `variant` prop |
| `frontend/src/components/ProgressBar.css` | **Modify** — variant fill colors |
| `frontend/src/components/ListCard.css` | **Modify** — token restyle |
| `frontend/src/components/ItemCard.tsx` | **Modify** — avatar self/other logic |
| `frontend/src/components/ItemCard.css` | **Modify** — price tag verde tokens |
| `frontend/src/components/CreateListCard.css` | **Modify** — token restyle |
| `frontend/src/components/FrequencySuggestionBanner.css` | **Modify** — solid tinta add button |
| `frontend/src/components/Toast.css` | **Modify** — token restyle |
| `frontend/src/components/PurchaseToast.css` | **Modify** — verde bg, tinta CTA |
| `frontend/src/components/InstallBanner.css` | **Modify** — miel bg/border |
| `frontend/src/components/SmartInputBar.css` | **Modify** — token restyle |
| `frontend/src/components/FilterBar.css` | **Modify** — tinta selected chip |
| `frontend/src/components/ItemActionSheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/ListActionSheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/ListMembersSheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/EmojiPickerSheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/StoreEditSheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/TagEditSheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/BarcodeScanSheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/LogPriceSheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/PriceHistorySheet.css` | **Modify** — sheet chrome tokens |
| `frontend/src/components/BarcodeScanner.css` | **Modify** — overlay + reticle |
| `frontend/public/icons.svg` | **Modify** — replace `#aa3bff` → `#1A3FA0` |
| `frontend/public/favicon.svg` | **Replace** — copy from `icon-app.svg` |
| `frontend/public/mascot.png` | **Replace** — copy from brand-assets |
| `frontend/public/pwa-512x512.png` | **Replace** — copy from brand-assets |
| `frontend/public/apple-touch-icon-180x180.png` | **Replace** — copy from brand-assets |
| `frontend/public/og-image.png` | **Replace** — copy from brand-assets |
| `frontend/public/maskable-icon-512x512.png` | **Regenerate** — via pwa-assets-generator |
| `frontend/public/pwa-192x192.png` | **Regenerate** — via pwa-assets-generator |
| `frontend/public/pwa-64x64.png` | **Regenerate** — via pwa-assets-generator |
| `frontend/public/favicon.ico` | **Regenerate** — via pwa-assets-generator |

---

## Task 1: Token foundation — copy token file and update index.css

**Files:**
- Create: `frontend/src/colors_and_type.css`
- Modify: `frontend/src/index.css`

All commands run from `.worktrees/design-system/frontend/`.

- [ ] **Step 1: Copy the token file verbatim**

```bash
cp ../../design_handoff_design_system/tokens/colors_and_type.css src/colors_and_type.css
```

- [ ] **Step 2: Replace index.css**

Replace the entire contents of `frontend/src/index.css` with:

```css
@import './colors_and_type.css';

/* Compat aliases — map legacy component token names onto new canonical names.
   Remove once every component consumes canonical tokens directly. */
:root {
  --color-bg:             var(--paper-0);
  --color-surface:        var(--paper-0);
  --color-border:         var(--border);
  --color-text:           var(--ink-0);
  --color-text-secondary: var(--ink-2);
  --color-primary:        var(--accent);
  --color-muted:          var(--ink-2);
  --text:                 var(--ink-1);
  --text-h:               var(--ink-0);
  --bg:                   var(--paper-0);
  --bg2:                  var(--paper-1);
  --border:               var(--paper-edge);
  --accent:               var(--tinta-0);
  --accent-bg:            var(--tinta-bg);
  --accent-border:        var(--tinta-border);
  --purchased:            var(--ink-strike);
  --sans:                 var(--font-sans);
  --heading:              var(--font-display);
  --mono:                 var(--font-mono);
  --shadow:               var(--shadow-md);
}

#root {
  width: 1126px;
  max-width: 100%;
  margin: 0 auto;
  text-align: center;
  border-inline: 1px solid var(--border);
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

body {
  margin: 0;
}

h1,
h2 {
  font-family: var(--font-display);
  font-weight: 500;
  color: var(--text-h);
}

h1 {
  font-size: 56px;
  letter-spacing: -1.68px;
  margin: 32px 0;
}

h2 {
  font-size: 24px;
  line-height: 118%;
  letter-spacing: -0.24px;
  margin: 0 0 8px;
}

p {
  margin: 0;
}

code,
.counter {
  font-family: var(--mono);
  display: inline-flex;
  border-radius: 4px;
  color: var(--text-h);
}

code {
  font-size: 15px;
  line-height: 135%;
  padding: 4px 8px;
  background: var(--paper-1);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Run tests to verify baseline is intact**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: `Tests  43 failed | 464 passed` (same as baseline — no new failures).

- [ ] **Step 4: Commit**

```bash
git add src/colors_and_type.css src/index.css
git commit -m "feat: replace index.css token block with design system tokens"
```

---

## Task 2: Update index.html — fonts and theme-color

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Update index.html**

Replace `frontend/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Bree+Serif&family=Caveat:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#EEF1F5" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
    <title>CarroQueSí</title>
    <meta property="og:title" content="CarroQueSí" />
    <meta property="og:description" content="Lista de la compra colaborativa" />
    <meta property="og:type" content="website" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add ../index.html
git commit -m "feat: load design system fonts and update theme-color"
```

---

## Task 3: Remove terminal theme system

**Files:**
- Delete: `frontend/src/theme/terminal-themes.css`
- Delete: `frontend/src/lib/themes.ts`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Delete theme files**

```bash
rm src/theme/terminal-themes.css
rm src/lib/themes.ts
```

- [ ] **Step 2: Remove the import from main.tsx**

Replace `frontend/src/main.tsx` with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: same baseline (464 passing, 43 failing). TypeScript will still report an error until Task 4 removes the `THEMES` import in `ThemeManager.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/theme/terminal-themes.css src/lib/themes.ts src/main.tsx
git commit -m "feat: remove terminal theme system"
```

---

## Task 4: Rewrite ThemeManager to follow OS dark mode

**Files:**
- Modify: `frontend/src/components/ThemeManager.tsx`

- [ ] **Step 1: Rewrite ThemeManager.tsx**

Replace the entire file with:

```tsx
import { useEffect } from 'react'

export function ThemeManager({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (dark: boolean) =>
      document.body.classList.toggle('theme-dark', dark)
    apply(mq.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return <>{children}</>
}
```

- [ ] **Step 2: Run typecheck**

```bash
node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing (baseline unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/components/ThemeManager.tsx
git commit -m "feat: ThemeManager follows OS prefers-color-scheme, toggles theme-dark on body"
```

---

## Task 5: Remove SettingsScreen — component, route, and menu item

**Files:**
- Delete: `frontend/src/components/SettingsScreen.tsx`
- Delete: `frontend/src/components/SettingsScreen.css`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/DashboardScreen.tsx`

- [ ] **Step 1: Delete SettingsScreen files**

```bash
rm src/components/SettingsScreen.tsx
rm src/components/SettingsScreen.css
```

- [ ] **Step 2: Remove the route and import from App.tsx**

Replace `frontend/src/App.tsx` with:

```tsx
import React from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DashboardScreen } from './components/DashboardScreen'
import { InviteScreen } from './components/InviteScreen'
import { ListRoute } from './components/ListRoute'
import { SignInScreen } from './components/SignInScreen'
import { ThemeManager } from './components/ThemeManager'
import { AuthProvider, useAuth } from './contexts/AuthContext'

function AuthRoute({ element }: { element: React.ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <SignInScreen />
  return element
}

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Cargando"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '3px solid var(--color-border)',
            borderTopColor: 'var(--color-primary)',
            animation: 'spin 0.8s linear infinite',
            display: 'block',
          }}
        />
      </div>
    )
  }

  if (!user) return <SignInScreen />
  return <DashboardScreen />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeManager>
          <Routes>
            <Route path="/invite/:id" element={<InviteScreen />} />
            <Route path="/lists/:id" element={<AuthRoute element={<ListRoute />} />} />
            <Route path="*" element={<AppContent />} />
          </Routes>
        </ThemeManager>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Remove "Configuración" menu item from DashboardScreen.tsx**

Find this block in `frontend/src/components/DashboardScreen.tsx` (around line 238–244):

```tsx
              <button
                className="dashboard-screen__avatar-menu-item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); navigate('/settings') }}
              >
                Configuración
              </button>
```

Delete it entirely. The `navigate` import from `react-router-dom` is still used for list navigation elsewhere — do not remove it.

Also remove the `useNavigate` import only if it is no longer used anywhere else in the file. Check by searching for remaining `navigate(` calls — if any exist, leave the import.

- [ ] **Step 4: Run typecheck and tests**

```bash
node_modules/.bin/tsc -p tsconfig.app.json --noEmit
npm test -- --run 2>&1 | tail -5
```

Expected: no type errors, 464 passing / 43 failing.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsScreen.tsx src/components/SettingsScreen.css \
        src/App.tsx src/components/DashboardScreen.tsx
git commit -m "feat: remove SettingsScreen and theme switcher UI"
```

---

## Task 6: Create Wordmark component

**Files:**
- Create: `frontend/src/components/Wordmark.tsx`
- Create: `frontend/src/components/Wordmark.css`

- [ ] **Step 1: Create Wordmark.css**

```css
.wordmark {
  font-family: var(--font-hand);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
  display: inline-flex;
  align-items: baseline;
  gap: 0;
  color: var(--ink-0);
}

.wordmark__word {
  display: inline-block;
  color: var(--ink-0);
}

.wordmark__tick {
  color: var(--verde-0);
  transform: rotate(-6deg) translateY(0.04em);
  align-self: center;
  flex-shrink: 0;
  margin-left: 0.18em;
}
```

- [ ] **Step 2: Create Wordmark.tsx**

```tsx
import './Wordmark.css'

interface WordmarkProps {
  size?: number
}

export function Wordmark({ size = 32 }: WordmarkProps) {
  const tickSize = Math.round(size * 0.55)
  return (
    <span className="wordmark" style={{ fontSize: size }} aria-label="CarroQueSí">
      <span className="wordmark__word">Carro</span>
      <span className="wordmark__word">Que</span>
      <span className="wordmark__word">Sí</span>
      <svg
        className="wordmark__tick"
        width={tickSize}
        height={tickSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12 l5 5 L20 6" />
      </svg>
    </span>
  )
}
```

- [ ] **Step 3: Run typecheck**

```bash
node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/Wordmark.tsx src/components/Wordmark.css
git commit -m "feat: add Wordmark component (Caveat + verde tick)"
```

---

## Task 7: Restyle SignInScreen + update its test

**Files:**
- Modify: `frontend/src/components/SignInScreen.test.tsx`
- Create: `frontend/src/components/SignInScreen.css`
- Modify: `frontend/src/components/SignInScreen.tsx`

- [ ] **Step 1: Update the failing test first**

Replace `frontend/src/components/SignInScreen.test.tsx` with:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignInScreen } from './SignInScreen'
import * as AuthContext from '../contexts/AuthContext'

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(AuthContext.useAuth).mockReturnValue({
    user: null,
    getToken: vi.fn(),
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    loading: false,
  })
})

describe('SignInScreen', () => {
  it('renders app name', () => {
    render(<SignInScreen />)
    expect(screen.getByLabelText(/carroquesí/i)).toBeInTheDocument()
  })

  it('renders Google sign-in button', () => {
    render(<SignInScreen />)
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
  })

  it('calls signIn when button is clicked', () => {
    const mockSignIn = vi.fn().mockResolvedValue(undefined)
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      user: null,
      getToken: vi.fn(),
      signIn: mockSignIn,
      signOut: vi.fn(),
      loading: false,
    })
    render(<SignInScreen />)
    fireEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(mockSignIn).toHaveBeenCalledOnce()
  })

  it('renders mascot image', () => {
    render(<SignInScreen />)
    expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test — expect the 'renders app name' test to fail**

```bash
npm test -- --run src/components/SignInScreen.test.tsx 2>&1 | tail -10
```

Expected: `renders app name` fails because the component still renders `<h1>CarroQueSí</h1>` (text content), but `getByLabelText` looks for an `aria-label` which doesn't exist yet. Other 3 tests should pass.

- [ ] **Step 3: Create SignInScreen.css**

```css
.signin {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100dvh;
  gap: 1.5rem;
  padding: 2rem;
  background: var(--paper-0);
}

.signin__hand {
  font-family: var(--font-hand);
  font-size: 28px;
  font-weight: 600;
  color: var(--accent);
  transform: rotate(-5deg);
  display: inline-block;
  line-height: 1;
  margin-bottom: -0.5rem;
}

.signin__title {
  margin: 0;
  font-size: 56px;
  letter-spacing: normal;
}

.signin__tag {
  color: var(--ink-2);
  margin: 0;
  text-align: center;
  font-size: var(--fs-15);
  line-height: var(--lh-base);
}

.signin__cta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--paper-0);
  cursor: pointer;
  font-size: var(--fs-16);
  font-weight: 500;
  font-family: inherit;
  color: var(--ink-0);
}

.signin__cta:hover {
  background: var(--paper-1);
}
```

- [ ] **Step 4: Update SignInScreen.tsx**

Replace `frontend/src/components/SignInScreen.tsx` with:

```tsx
import { useAuth } from '../contexts/AuthContext'
import { usePageTitle } from '../hooks/usePageTitle'
import { Mascot } from './Mascot'
import { Wordmark } from './Wordmark'
import './SignInScreen.css'

export function SignInScreen() {
  usePageTitle()
  const { signIn } = useAuth()

  return (
    <div className="signin">
      <span className="signin__hand">¡a por ello!</span>
      <Mascot size={160} />
      <h1 className="signin__title"><Wordmark size={56} /></h1>
      <p className="signin__tag">
        Lista de la compra compartida.<br />Sencilla. Para toda la familia.
      </p>
      <button className="signin__cta" onClick={() => void signIn()}>
        Continuar con Google
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Run the test — all 4 should pass now**

```bash
npm test -- --run src/components/SignInScreen.test.tsx 2>&1 | tail -10
```

Expected: `Tests  4 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/components/SignInScreen.test.tsx \
        src/components/SignInScreen.css \
        src/components/SignInScreen.tsx
git commit -m "feat: restyle SignInScreen — Wordmark, Caveat annotation, lifted CSS"
```

---

## Task 8: Restyle DashboardScreen

**Files:**
- Modify: `frontend/src/components/DashboardScreen.tsx`
- Modify: `frontend/src/components/DashboardScreen.css`

- [ ] **Step 1: Add Wordmark import and use it in the header**

In `frontend/src/components/DashboardScreen.tsx`, add the import at the top:

```tsx
import { Wordmark } from './Wordmark'
```

Then find the header title element at line 212. It currently renders:

```tsx
<h1 className="dashboard-screen__title">CarroQueSí</h1>
```

Replace it with:

```tsx
<h1 className="dashboard-screen__title"><Wordmark size={26} /></h1>
```

- [ ] **Step 2: Replace DashboardScreen.css**

```css
.dashboard-screen {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--paper-0);
}

.dashboard-screen--centered {
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
}

.dashboard-screen__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.25rem 0.75rem;
  background: var(--paper-0);
  border-bottom: 1px solid var(--border);
}

.dashboard-screen__title {
  margin: 0;
  line-height: 1;
  font-size: 26px;
  letter-spacing: normal;
}

.dashboard-screen__avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: none;
  background: var(--tinta-0);
  color: var(--accent-fg);
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard-screen__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dashboard-screen__lists {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
}

.dashboard-screen__spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
  display: block;
}

.dashboard-screen__retry {
  padding: 0.5rem 1.25rem;
  border-radius: var(--r-sm);
  background: var(--accent);
  color: var(--accent-fg);
  border: none;
  cursor: pointer;
  font-size: var(--fs-16);
}

.dashboard-screen__toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--ink-0);
  color: var(--paper-0);
  padding: 10px 20px;
  border-radius: 999px;
  font-size: var(--fs-14);
  white-space: nowrap;
  z-index: 200;
}

.dashboard-screen__avatar-wrapper {
  position: relative;
}

.dashboard-screen__avatar-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--paper-0);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-md);
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
  font-size: var(--fs-14);
  color: var(--ink-0);
  cursor: pointer;
  text-align: left;
}

.dashboard-screen__avatar-menu-item:hover {
  background: var(--paper-1);
}

.dashboard-screen__avatar-menu-item + .dashboard-screen__avatar-menu-item {
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing.

- [ ] **Step 4: Commit**

```bash
git add src/components/DashboardScreen.tsx src/components/DashboardScreen.css
git commit -m "feat: restyle DashboardScreen with new tokens and Wordmark"
```

---

## Task 9: Restyle ListHeader

**Files:**
- Modify: `frontend/src/components/ListHeader.css`

- [ ] **Step 1: Replace ListHeader.css**

```css
.list-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--paper-0);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 50;
  flex-shrink: 0;
}

.list-header__back {
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--accent);
  font-size: var(--fs-16);
  font-weight: 500;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.list-header__title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 400;
  color: var(--ink-0);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 55%;
  margin: 0;
  letter-spacing: normal;
}

.list-header__menu {
  width: 32px;
  height: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.list-header__menu span {
  width: 20px;
  height: 2px;
  background: var(--ink-0);
  border-radius: 2px;
  display: block;
}

.list-header__emoji {
  margin-inline-end: 0.25em;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ListHeader.css
git commit -m "feat: ListHeader title uses Bree Serif display font"
```

---

## Task 10: Add variant prop to ProgressBar

**Files:**
- Modify: `frontend/src/components/ProgressBar.tsx`
- Modify: `frontend/src/components/ProgressBar.css`

- [ ] **Step 1: Update ProgressBar.tsx**

Replace `frontend/src/components/ProgressBar.tsx` with:

```tsx
import './ProgressBar.css'

interface Props {
  purchased: number
  total: number
  variant?: 'primary' | 'success'
}

export function ProgressBar({ purchased, total, variant = 'primary' }: Props) {
  if (total === 0) return null
  const pct = Math.round((purchased / total) * 100)
  return (
    <div
      className={`progress-bar progress-bar--${variant}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
```

- [ ] **Step 2: Update ProgressBar.css**

```css
.progress-bar {
  height: 3px;
  background: var(--paper-2);
  flex-shrink: 0;
}

.progress-bar--primary .progress-bar__fill {
  background: var(--tinta-0);
}

.progress-bar--success .progress-bar__fill {
  background: var(--verde-0);
}

.progress-bar__fill {
  height: 100%;
  border-radius: 0 2px 2px 0;
  transition: width 0.3s ease;
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProgressBar.tsx src/components/ProgressBar.css
git commit -m "feat: ProgressBar variant prop (primary=tinta, success=verde)"
```

---

## Task 11: Restyle ListCard

**Files:**
- Modify: `frontend/src/components/ListCard.tsx`
- Modify: `frontend/src/components/ListCard.css`

- [ ] **Step 1: Update ListCard.tsx — pass variant to ProgressBar and add empty state**

In `frontend/src/components/ListCard.tsx`, find the `<button className="list-card__tap-target">` section and replace it with:

```tsx
      <button className="list-card__tap-target" onClick={onClick} aria-label={name}>
        <span className="list-card__name">{name}</span>
        <ProgressBar
          purchased={purchased_count}
          total={item_count}
          variant={purchased_count === item_count ? 'success' : 'primary'}
        />
        {item_count > 0 && (
          <span className="list-card__subtitle">{purchased_count} de {item_count} comprados</span>
        )}
        {item_count === 0 && (
          <span className="list-card__subtitle">vacía · añade lo primero</span>
        )}
      </button>
```

- [ ] **Step 2: Replace ListCard.css**

```css
.list-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  background: var(--paper-0);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.list-card__tap-target {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 1rem 0 1rem 1.25rem;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  min-width: 0;
}

.list-card__tap-target:active {
  background: var(--paper-1);
}

.list-card__name {
  font-weight: 600;
  font-size: var(--fs-20);
  color: var(--ink-0);
}

.list-card__subtitle {
  font-size: var(--fs-12);
  color: var(--ink-2);
}

.list-card__menu-btn {
  flex-shrink: 0;
  padding: 0 1rem;
  align-self: stretch;
  background: none;
  border: none;
  font-size: 1.25rem;
  color: var(--ink-2);
  cursor: pointer;
  letter-spacing: 0.05em;
}

.list-card__menu-btn:active {
  color: var(--ink-0);
}

.list-card__drag-handle {
  flex-shrink: 0;
  padding: 0 0 0 1rem;
  align-self: stretch;
  display: flex;
  align-items: center;
  color: var(--border);
  font-size: 1.1rem;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.list-card__drag-handle:active {
  cursor: grabbing;
}

.list-card--dragging {
  opacity: 0.5;
  box-shadow: var(--shadow-lg);
}

.list-card__emoji {
  flex-shrink: 0;
  padding: 0 0.25rem 0 0.5rem;
  align-self: stretch;
  display: flex;
  align-items: center;
  font-size: 1.25rem;
  background: none;
  border: none;
  cursor: pointer;
  line-height: 1;
}

.list-card__emoji--placeholder {
  font-size: 0.875rem;
  color: var(--border);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing.

- [ ] **Step 4: Commit**

```bash
git add src/components/ListCard.tsx src/components/ListCard.css
git commit -m "feat: restyle ListCard with progress bar variant and new tokens"
```

---

## Task 12: Restyle ItemCard — avatar and price tag

**Files:**
- Modify: `frontend/src/components/ItemCard.tsx`
- Modify: `frontend/src/components/ItemCard.css`

- [ ] **Step 1: Update avatar logic in ItemCard.tsx**

`ItemCard` receives `members: Map<string, Member>` and `item.added_by`. It needs the current user's ID to decide self vs. other. Import `useAuth` and read `user.id`.

In `frontend/src/components/ItemCard.tsx`, add the import:

```tsx
import { useAuth } from '../contexts/AuthContext'
```

Then inside the `ItemCard` function, after the existing `const member = ...` line, add:

```tsx
  const { user } = useAuth()
  const isSelf = member?.id === user?.id
  const avatarStyle = isSelf
    ? { background: 'var(--tinta-0)', color: 'var(--accent-fg)' }
    : { background: 'var(--paper-2)', color: 'var(--ink-1)' }
```

Replace the existing avatar `<div>`:

```tsx
        <div
          className="item-card__avatar"
          style={member?.photoUrl ? {} : avatarStyle}
          aria-hidden
        >
          {member?.photoUrl
            ? <img src={member.photoUrl} alt={member.displayName} className="item-card__avatar-img" />
            : initial
          }
        </div>
```

Remove the `const colour = member?.colour ?? '#b0adb5'` line (no longer used).

- [ ] **Step 2: Update the price tag rule in ItemCard.css**

Find the `.item-card__tag--price` rule at the bottom of `frontend/src/components/ItemCard.css`:

```css
.item-card__tag--price {
  background: #1c3a2e;
  color: #30d158;
}
```

Replace with:

```css
.item-card__tag--price {
  background: var(--verde-bg);
  color: var(--verde-0);
  border: 1px solid var(--verde-border);
  font-family: var(--font-mono);
}
```

Also update the purchased-state qty background (currently hardcoded `#f0edf5`):

Find:
```css
.item-card--purchased .item-card__qty {
  background: #f0edf5;
  color: var(--purchased);
}
```

Replace with:
```css
.item-card--purchased .item-card__qty {
  background: var(--paper-1);
  color: var(--purchased);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing.

- [ ] **Step 4: Commit**

```bash
git add src/components/ItemCard.tsx src/components/ItemCard.css
git commit -m "feat: ItemCard avatar uses self/other rule; price tag uses verde tokens"
```

---

## Task 13: Restyle CreateListCard

**Files:**
- Modify: `frontend/src/components/CreateListCard.css`

- [ ] **Step 1: Replace CreateListCard.css**

```css
.create-list-card {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 1rem;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--r-lg);
  background: transparent;
  color: var(--ink-2);
  font-size: var(--fs-15);
  font-family: var(--font-display);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.create-list-card:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.create-list-card--expanded {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: 1.5px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--paper-0);
}

.create-list-card--expanded input {
  flex: 1;
  border: none;
  outline: none;
  font-size: var(--fs-15);
  background: transparent;
  color: var(--ink-0);
  font-family: var(--font-sans);
}

.create-list-card--expanded input::placeholder {
  color: var(--ink-3);
}

.create-list-card--expanded button {
  padding: 0.375rem 0.75rem;
  border-radius: var(--r-sm);
  background: var(--accent);
  color: var(--accent-fg);
  border: none;
  cursor: pointer;
  font-size: var(--fs-14);
  font-family: inherit;
  white-space: nowrap;
}

.create-list-card--expanded button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CreateListCard.css
git commit -m "feat: restyle CreateListCard with dashed border and display font"
```

---

## Task 14: Restyle FrequencySuggestionBanner

**Files:**
- Modify: `frontend/src/components/FrequencySuggestionBanner.css`

- [ ] **Step 1: Replace FrequencySuggestionBanner.css**

```css
.freq-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--miel-bg);
  border: 1px solid var(--miel-border);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.freq-banner__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.freq-banner__name {
  font-size: var(--fs-14);
  font-weight: 600;
  color: var(--ink-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.freq-banner__meta {
  font-size: var(--fs-12);
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.freq-banner__add {
  background: var(--tinta-0);
  color: var(--accent-fg);
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: var(--fs-13);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  flex-shrink: 0;
}

.freq-banner__add:hover {
  background: var(--tinta-1);
}

.freq-banner__dismiss {
  font-size: var(--fs-13);
  color: var(--ink-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  flex-shrink: 0;
  font-family: inherit;
  line-height: 1;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FrequencySuggestionBanner.css
git commit -m "feat: FrequencySuggestionBanner — solid tinta add button, miel bg"
```

---

## Task 15: Restyle Toast, PurchaseToast, InstallBanner

**Files:**
- Modify: `frontend/src/components/Toast.css`
- Modify: `frontend/src/components/PurchaseToast.css`
- Modify: `frontend/src/components/InstallBanner.css`

- [ ] **Step 1: Replace Toast.css**

```css
.toast {
  position: fixed;
  bottom: 96px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--ink-0);
  color: var(--paper-0);
  padding: 10px 20px;
  border-radius: 20px;
  font-size: var(--fs-14);
  font-weight: 500;
  white-space: nowrap;
  z-index: 100;
  box-shadow: var(--shadow-md);
  animation: toast-in 0.2s ease;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

- [ ] **Step 2: Replace PurchaseToast.css**

```css
.pt {
  position: fixed;
  bottom: calc(max(env(safe-area-inset-bottom), 0px) + 80px);
  left: 16px;
  right: 16px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  z-index: 200;
  animation: pt-slide-up 0.25s ease;
}

@keyframes pt-slide-up {
  from { transform: translateY(100px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

.pt__progress {
  height: 3px;
  background: var(--verde-border);
}

.pt__progress-fill {
  height: 100%;
  background: var(--verde-0);
  border-radius: 0 2px 2px 0;
  animation: pt-drain 6s linear forwards;
}

@keyframes pt-drain {
  from { width: 100%; }
  to   { width: 0%; }
}

.pt__body {
  background: var(--verde-bg);
  border: 1px solid var(--verde-border);
  border-top: none;
  padding: 11px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pt__text {
  flex: 1;
  font-size: var(--fs-14);
  color: var(--ink-1);
  line-height: 1.3;
}

.pt__text strong {
  color: var(--ink-0);
  font-weight: 600;
}

.pt__cta {
  font-size: var(--fs-14);
  font-weight: 700;
  color: var(--tinta-0);
  white-space: nowrap;
  padding: 4px 0 4px 4px;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
}

.pt__dismiss {
  font-size: 16px;
  color: var(--ink-2);
  padding: 4px 0 4px 6px;
  cursor: pointer;
  background: none;
  border: none;
}
```

- [ ] **Step 3: Replace InstallBanner.css**

```css
.install-banner {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  background: var(--miel-bg);
  border: 1px solid var(--miel-border);
  color: var(--ink-0);
  border-radius: 12px;
  padding: 0.625rem 0.75rem;
  font-size: var(--fs-14);
}

.install-banner__icon {
  width: 28px;
  height: 28px;
  background: var(--miel-0);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-fg);
  font-weight: 900;
  font-size: 11px;
  flex-shrink: 0;
}

.install-banner__text {
  flex: 1;
  margin: 0;
  line-height: 1.4;
  color: var(--ink-1);
}

.install-banner__cta {
  background: var(--tinta-0);
  color: var(--accent-fg);
  border: none;
  border-radius: var(--r-sm);
  padding: 0.25rem 0.75rem;
  font-size: var(--fs-13);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  font-family: inherit;
}

.install-banner__dismiss {
  background: none;
  border: none;
  color: var(--ink-2);
  cursor: pointer;
  padding: 0;
  font-size: var(--fs-14);
  line-height: 1;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Toast.css src/components/PurchaseToast.css src/components/InstallBanner.css
git commit -m "feat: restyle Toast, PurchaseToast, InstallBanner with new tokens"
```

---

## Task 16: Restyle SmartInputBar and FilterBar

**Files:**
- Modify: `frontend/src/components/SmartInputBar.css`
- Modify: `frontend/src/components/FilterBar.css`

- [ ] **Step 1: Replace SmartInputBar.css**

```css
.smart-input {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--paper-0);
  border-top: 1px solid var(--border);
  padding: 8px 16px 28px;
}

.smart-input__suggestions {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 8px;
  box-shadow: var(--shadow-sm);
}

.smart-input__suggestion {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: var(--paper-0);
  font-size: var(--fs-14);
  font-weight: 500;
  color: var(--ink-0);
  cursor: pointer;
  font-family: inherit;
}

.smart-input__suggestion:last-child { border-bottom: none; }

.smart-input__suggestion--top {
  background: var(--tinta-bg);
  color: var(--tinta-0);
}

.smart-input__suggestion--inferred {
  background: var(--paper-1);
  border-left: 3px solid var(--accent);
  color: var(--ink-0);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.smart-input__preview {
  background: var(--paper-1);
  border: 1px solid var(--tinta-border);
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: center;
}

.smart-input__preview-name {
  font-size: var(--fs-14);
  font-weight: 600;
  color: var(--ink-0);
}

.smart-input__preview-qty {
  font-size: var(--fs-12);
  font-weight: 500;
  color: var(--accent);
  background: var(--accent-bg);
  border-radius: 20px;
  padding: 1px 7px;
}

.smart-input__preview-tag {
  font-size: var(--fs-12);
  background: var(--accent-bg);
  border: 1px solid var(--accent-border);
  border-radius: 5px;
  padding: 1px 6px;
  color: var(--accent);
}

.smart-input__preview-error {
  font-size: var(--fs-12);
  font-weight: 500;
  color: var(--tomate-0);
}

.smart-input__legend {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.smart-input__chip {
  font-size: var(--fs-12);
  color: var(--ink-1);
  background: var(--paper-1);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 7px;
  cursor: pointer;
  font-family: inherit;
}

.smart-input__chip b {
  color: var(--accent);
  font-family: var(--font-mono);
}

.smart-input__chip--active {
  background: var(--accent-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}

.smart-input__row {
  display: flex;
  gap: 10px;
  align-items: center;
  background: var(--paper-1);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 10px 12px;
}

.smart-input__row:focus-within {
  border-color: var(--accent);
}

.smart-input__scan {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--paper-1);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 18px;
  font-family: inherit;
}

.smart-input__field {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: var(--fs-16);
  color: var(--ink-0);
  font-family: inherit;
}

.smart-input__field::placeholder {
  color: var(--ink-3);
}

.smart-input__add {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent);
  border: none;
  color: var(--accent-fg);
  font-size: 22px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
}

.smart-input__add:disabled {
  background: var(--border);
  cursor: not-allowed;
}

.smart-input__add-icon {
  display: block;
  width: 22px;
  height: 22px;
  position: relative;
}

.smart-input__add-icon::before,
.smart-input__add-icon::after {
  content: '';
  position: absolute;
  background: white;
  border-radius: 2px;
}

.smart-input__add-icon::before {
  width: 14px;
  height: 2px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.smart-input__add-icon::after {
  width: 2px;
  height: 14px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.smart-input__ean-code {
  font-size: var(--fs-13);
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--ink-0);
  letter-spacing: 0.03em;
}

.smart-input__buscar {
  margin-left: auto;
  background: var(--accent);
  color: var(--accent-fg);
  border: none;
  border-radius: 8px;
  padding: 3px 12px;
  font-size: var(--fs-13);
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.smart-input__buscar:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.smart-input__clear {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--border);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
  padding: 0;
}

.smart-input__clear-icon {
  display: block;
  width: 10px;
  height: 10px;
  position: relative;
}

.smart-input__clear-icon::before,
.smart-input__clear-icon::after {
  content: '';
  position: absolute;
  width: 10px;
  height: 1.5px;
  background: var(--ink-1);
  border-radius: 2px;
  top: 50%;
  left: 50%;
}

.smart-input__clear-icon::before { transform: translate(-50%, -50%) rotate(45deg); }
.smart-input__clear-icon::after  { transform: translate(-50%, -50%) rotate(-45deg); }
```

- [ ] **Step 2: Replace FilterBar.css**

```css
.filter-bar {
  overflow: hidden;
  position: relative;
  height: 38px;
  flex-shrink: 0;
}

.filter-bar__chips {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;
  transition: transform 320ms ease, opacity 320ms ease;
}

.filter-bar__chips::-webkit-scrollbar {
  display: none;
}

.filter-bar__search {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  transform: translateX(-100%);
  opacity: 0;
  transition: transform 320ms ease, opacity 320ms ease;
}

.filter-bar--search-active .filter-bar__chips {
  transform: translateX(100%);
  opacity: 0;
}

.filter-bar--search-active .filter-bar__search {
  transform: translateX(0);
  opacity: 1;
}

.filter-bar__chip {
  flex-shrink: 0;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  background: var(--paper-1);
  font-size: var(--fs-13);
  color: var(--ink-1);
  cursor: pointer;
  font-family: inherit;
}

.filter-bar__chip--active {
  background: var(--tinta-0);
  border-color: var(--tinta-0);
  color: var(--accent-fg);
}

.filter-bar__search-btn,
.filter-bar__close-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--ink-2);
  padding: 0;
  font-family: inherit;
}

.filter-bar__input {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: var(--fs-14);
  font-family: inherit;
  background: var(--paper-1);
  color: var(--ink-0);
  outline: none;
}

.filter-bar__input:focus {
  border-color: var(--accent);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing.

- [ ] **Step 4: Commit**

```bash
git add src/components/SmartInputBar.css src/components/FilterBar.css
git commit -m "feat: restyle SmartInputBar and FilterBar with new tokens"
```

---

## Task 17: Restyle all action sheets

All 9 sheets share the same chrome pattern: `--paper-0` background, `--shadow-sheet` top shadow, `--paper-edge` drag handle, `--paper-2` row hover. Each gets its full CSS replaced.

**Files:** All `.css` files below.

- [ ] **Step 1: Replace ItemActionSheet.css**

Open `frontend/src/components/ItemActionSheet.css` and do a global find-and-replace:
- `var(--color-bg, #fff)` → `var(--paper-0)`
- `var(--color-border, #e5e7eb)` → `var(--border)`
- `var(--color-text, ...)` → `var(--ink-0)`
- `var(--color-text-secondary, ...)` → `var(--ink-2)`
- `var(--color-primary, ...)` → `var(--accent)`
- `var(--color-muted, ...)` → `var(--ink-2)`
- `var(--color-surface, ...)` → `var(--paper-0)`
- `border-top: 1px solid var(--color-border...)` stays (just token update)

Additionally, update the sheet container rule to use `--shadow-sheet`:

```css
.item-action-sheet {
  /* ... existing position/layout properties unchanged ... */
  background: var(--paper-0);
  border-top: none;
  border-radius: 16px 16px 0 0;
  padding: 8px 0 24px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sheet);
}

.item-action-sheet__handle {
  width: 36px;
  height: 4px;
  background: var(--paper-edge);
  border-radius: 2px;
  margin: 0 auto 12px;
}
```

For every row hover state, use `var(--paper-2)`.

- [ ] **Step 2: Apply the same token replacements to these 8 files**

For each file, apply the same token mapping as Step 1. The key rules to update in each:

| File | Main container class | Handle class |
|---|---|---|
| `ListActionSheet.css` | `.list-action-sheet` | `.list-action-sheet__handle` |
| `ListMembersSheet.css` | `.list-members-sheet` | `.list-members-sheet__handle` |
| `EmojiPickerSheet.css` | `.emoji-picker-sheet` | `.emoji-picker-sheet__handle` |
| `StoreEditSheet.css` | `.store-edit-sheet` | (no handle) |
| `TagEditSheet.css` | `.tag-edit-sheet` | (no handle) |
| `BarcodeScanSheet.css` | `.bss` | (no handle) |
| `LogPriceSheet.css` | `.lps` | `.lps__handle` |
| `PriceHistorySheet.css` | `.phs` | `.phs__handle` |

For `LogPriceSheet.css` and `PriceHistorySheet.css`, which have many dark-mode hardcoded values, apply these mappings:

| Old value | New token |
|---|---|
| `var(--color-bg, #2c2c2e)` | `var(--paper-0)` |
| `var(--color-border, #48484a)` | `var(--border)` |
| `var(--color-text, #fff)` | `var(--ink-0)` |
| `var(--color-muted, #8e8e93)` | `var(--ink-2)` |
| `var(--color-input-bg, #3a3a3c)` | `var(--paper-1)` |
| `var(--color-surface, #1c1c1e)` | `var(--paper-0)` |
| `var(--color-primary, #0a84ff)` | `var(--accent)` |
| `var(--color-primary-bg, ...)` | `var(--accent-bg)` |
| `var(--color-primary-border, ...)` | `var(--accent-border)` |
| `var(--color-success, #30d158)` | `var(--verde-0)` |

For `PriceHistorySheet.css` scope buttons (`.phs__scope-btn--active`) and log button (`.phs__log-btn`): use `var(--accent)` for active/primary, `var(--accent-fg)` for text on accent.

- [ ] **Step 3: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing.

- [ ] **Step 4: Commit**

```bash
git add src/components/ItemActionSheet.css src/components/ListActionSheet.css \
        src/components/ListMembersSheet.css src/components/EmojiPickerSheet.css \
        src/components/StoreEditSheet.css src/components/TagEditSheet.css \
        src/components/BarcodeScanSheet.css src/components/LogPriceSheet.css \
        src/components/PriceHistorySheet.css
git commit -m "feat: restyle all action sheets with shared chrome tokens"
```

---

## Task 18: Restyle BarcodeScanner and verify Mascot

**Files:**
- Modify: `frontend/src/components/BarcodeScanner.css`

- [ ] **Step 1: Replace BarcodeScanner.css**

```css
.barcode-scanner {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.barcode-scanner__video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.barcode-scanner__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: rgba(0, 0, 0, 0.85);
}

.barcode-scanner__frame {
  width: 260px;
  height: 160px;
  border: 2px solid var(--paper-0);
  border-radius: 12px;
  box-shadow: 0 0 0 2000px transparent;
  background: transparent;
}

.barcode-scanner__hint {
  color: var(--paper-0);
  font-size: var(--fs-14);
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.barcode-scanner__close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: var(--paper-0);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
}

.barcode-scanner--error {
  color: var(--paper-0);
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  text-align: center;
}
```

- [ ] **Step 2: Verify Mascot source**

```bash
diff ../../design_handoff_design_system/brand-assets/mascot.png ../public/mascot.png && echo "identical" || echo "differ"
```

If they differ, copy the brand-assets version (it will be done in Task 19 anyway — no action needed here if differ).

- [ ] **Step 3: Commit**

```bash
git add src/components/BarcodeScanner.css
git commit -m "feat: restyle BarcodeScanner overlay and reticle"
```

---

## Task 19: Update brand assets

**Files:**
- Modify: `frontend/public/icons.svg`
- Replace: `frontend/public/favicon.svg`, `mascot.png`, `pwa-512x512.png`, `apple-touch-icon-180x180.png`, `og-image.png`
- Regenerate: `maskable-icon-512x512.png`, `pwa-192x192.png`, `pwa-64x64.png`, `favicon.ico`

All commands run from `.worktrees/design-system/frontend/`.

- [ ] **Step 1: Fix icons.svg — replace old purple with tinta**

```bash
sed -i 's/#aa3bff/#1A3FA0/g' public/icons.svg
```

Verify the replacement:

```bash
grep -c "#aa3bff" public/icons.svg
```

Expected: `0` (no remaining occurrences).

- [ ] **Step 2: Copy good brand assets**

```bash
cp ../../design_handoff_design_system/brand-assets/mascot.png        public/mascot.png
cp ../../design_handoff_design_system/brand-assets/pwa-512.png       public/pwa-512x512.png
cp ../../design_handoff_design_system/brand-assets/apple-touch-icon.png public/apple-touch-icon-180x180.png
```

Note: `og-image.png` from brand-assets is outdated (old purple scheme). Skip it for now — it will need a manual redraw and can be shipped separately.

- [ ] **Step 3: Set favicon from icon-app.svg**

`brand-assets/favicon.svg` is the Vite placeholder. Use `icon-app.svg` (the real app icon) as the favicon instead:

```bash
cp ../../design_handoff_design_system/brand-assets/icon-app.svg public/favicon.svg
```

- [ ] **Step 4: Regenerate PWA raster sizes**

```bash
npx pwa-assets-generator 2>&1 | tail -10
```

Expected: generates `pwa-64x64.png`, `pwa-192x192.png`, `maskable-icon-512x512.png`, `favicon.ico` from the new `favicon.svg`.

If `pwa-assets-generator` reports an error about the config, check `pwa-assets.config.ts` — it should already reference `public/favicon.svg` as the source.

- [ ] **Step 5: Run tests**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing.

- [ ] **Step 6: Commit**

```bash
git add public/icons.svg public/favicon.svg public/mascot.png \
        public/pwa-512x512.png public/apple-touch-icon-180x180.png \
        public/maskable-icon-512x512.png public/pwa-192x192.png \
        public/pwa-64x64.png public/favicon.ico
git commit -m "feat: update brand assets for new design system"
```

---

## Task 20: Final validation

- [ ] **Step 1: Run full test suite**

```bash
npm test -- --run 2>&1 | tail -5
```

Expected: 464 passing, 43 failing. If new failures appear, investigate before proceeding.

- [ ] **Step 2: Typecheck**

```bash
node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
npm run lint 2>&1 | tail -10
```

Expected: no errors (warnings acceptable).

- [ ] **Step 4: Verify no hardcoded hex colours remain in component CSS**

```bash
grep -rn "#[0-9a-fA-F]\{3,6\}" src/components/*.css \
  | grep -v "rgba\|00000\|ffffff\|FFFFFF" \
  | grep -v "BarcodeScanner"
```

Any remaining hits (outside `BarcodeScanner.css` where `rgba(0,0,0,...)` is intentional) should be replaced with a canonical token.

- [ ] **Step 5: Visual verification against ui_kit prototype**

Open the prototype in a browser:

```bash
open ../../design_handoff_design_system/ui_kit/index.html
```

Then run the dev server in a separate terminal:

```bash
npm run dev
```

Compare sign-in screen, dashboard, and list view against the prototype. They should be visually indistinguishable.

- [ ] **Step 6: Final commit if any fixes were made**

```bash
git add -p  # stage only intentional changes
git commit -m "fix: address final validation issues"
```

---

## Acceptance checklist

- [ ] `terminal-themes.css` deleted; `themes.ts` deleted; `ThemeManager` follows OS `prefers-color-scheme`, toggles `class="theme-dark"` on `<body>`
- [ ] `SettingsScreen` component, route, and "Configuración" menu item removed
- [ ] `src/index.css` `:root` block replaced with `@import` of new tokens; compat block in place
- [ ] Fonts loaded via `<link>` in `index.html`; `theme-color` meta = `#EEF1F5`
- [ ] `Wordmark` component created and used in `SignInScreen` and `DashboardScreen`
- [ ] `ProgressBar` has `variant` prop (`primary` / `success`)
- [ ] `ItemCard` avatar painted by self/other rule, not `member.colour`
- [ ] `.item-card__tag--price` repainted to verde tokens + JetBrains Mono
- [ ] `FrequencySuggestionBanner` "Añadir" button = solid tinta
- [ ] `ListCard` shows inline progress bar with verde/tinta rule; empty state shows subtitle
- [ ] `SignInScreen` inline styles lifted to `.css`; "¡a por ello!" Caveat line added
- [ ] All component `.css` files reference canonical tokens (no hardcoded hex remaining)
- [ ] PWA assets regenerated against `#EEF1F5` background; `favicon.svg` is the real app icon
- [ ] `icons.svg` updated: `#aa3bff` → `#1A3FA0`
- [ ] Dark mode toggled by `class="theme-dark"` on `<body>` (not `data-theme` on `<html>`)
- [ ] `SignInScreen.test.tsx` query uses `getByLabelText(/carroquesí/i)`
- [ ] Baseline test count maintained: 464 passing, 43 pre-existing failures (no new failures)
- [ ] `ui_kit/index.html` and live app render identically at sign-in, dashboard, list screens
