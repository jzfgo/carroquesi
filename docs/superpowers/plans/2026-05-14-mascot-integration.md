# Mascot Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the CarroQueSí shopping-cart mascot PNG across the sign-in screen, two empty states, the invite screen, and all PWA app icons.

**Architecture:** A shared `<Mascot size={number} />` component wraps the PNG import — change the asset once, every surface updates. Screens render the mascot as a hero element (140–180 px, centred). Icons are generated from the same source PNG using the already-installed `@vite-pwa/assets-generator` CLI.

**Tech Stack:** React + TypeScript (Vite), `@vite-pwa/assets-generator` (already in devDeps), Vitest + Testing Library

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/assets/mascot.png` | **New** — source mascot PNG (copy from user's file) |
| `frontend/src/components/Mascot.tsx` | **New** — shared `<Mascot size?>` component |
| `frontend/src/components/Mascot.test.tsx` | **New** — unit tests for Mascot |
| `frontend/src/components/SignInScreen.tsx` | **Modify** — add `<Mascot size={160} />` above title |
| `frontend/src/components/SignInScreen.test.tsx` | **Modify** — add mascot presence test |
| `frontend/src/components/ItemList.tsx` | **Modify** — replace empty-state text with mascot + two lines |
| `frontend/src/components/ItemList.test.tsx` | **Modify** — update empty-state test for new copy + mascot |
| `frontend/src/components/CreateListCard.tsx` | **Modify** — add mascot + heading when `isFirst` |
| `frontend/src/components/CreateListCard.test.tsx` | **Modify** — add mascot presence test when `isFirst` |
| `frontend/src/components/InviteScreen.css` | **Modify** — add `flex-direction: column; gap: 1.5rem` to `.invite-screen` |
| `frontend/src/components/InviteScreen.tsx` | **Modify** — add `<Mascot size={100} />` above card in preview state |
| `frontend/src/components/InviteScreen.test.tsx` | **Modify** — add mascot presence test in preview state |
| `frontend/public/mascot.png` | **New** — source image for `@vite-pwa/assets-generator` |
| `frontend/pwa-assets.config.ts` | **New** — icon generation config |
| `frontend/public/pwa-*.png` + `favicon.ico` etc. | **Regenerated** — output of `pwa-assets-generator` |

---

## Task 1: Add mascot asset and create shared `<Mascot>` component

**Files:**
- Create: `frontend/src/assets/mascot.png`
- Create: `frontend/src/components/Mascot.tsx`
- Create: `frontend/src/components/Mascot.test.tsx`

- [ ] **Step 1.1: Copy the mascot PNG into the project**

  ```bash
  cp "/Users/javi/Documents/Projects/carroquesi/ChatGPT Image May 13, 2026, 07_02_55 PM.png" \
     /Users/javi/Projects/personal/carroquesi/frontend/src/assets/mascot.png
  ```

- [ ] **Step 1.2: Write the failing test**

  Create `frontend/src/components/Mascot.test.tsx`:

  ```tsx
  import { render, screen } from '@testing-library/react'
  import { Mascot } from './Mascot'

  test('renders img with correct alt text', () => {
    render(<Mascot />)
    expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  })

  test('applies default size of 160', () => {
    render(<Mascot />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('width', '160')
    expect(img).toHaveAttribute('height', '160')
  })

  test('applies custom size prop', () => {
    render(<Mascot size={80} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('width', '80')
    expect(img).toHaveAttribute('height', '80')
  })
  ```

- [ ] **Step 1.3: Run test — expect FAIL (module not found)**

  ```bash
  cd frontend && npm run test -- src/components/Mascot.test.tsx
  ```

  Expected: `Cannot find module './Mascot'`

- [ ] **Step 1.4: Create the `Mascot` component**

  Create `frontend/src/components/Mascot.tsx`:

  ```tsx
  import mascotUrl from '../assets/mascot.png'

  interface Props {
    size?: number
  }

  export function Mascot({ size = 160 }: Props) {
    return (
      <img
        src={mascotUrl}
        alt="Mascota de CarroQueSí"
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
      />
    )
  }
  ```

- [ ] **Step 1.5: Run test — expect PASS**

  ```bash
  cd frontend && npm run test -- src/components/Mascot.test.tsx
  ```

  Expected: 3 tests pass

- [ ] **Step 1.6: Commit**

  ```bash
  git add frontend/src/assets/mascot.png \
          frontend/src/components/Mascot.tsx \
          frontend/src/components/Mascot.test.tsx
  git commit -m "feat: add mascot asset and shared Mascot component"
  ```

---

## Task 2: Update sign-in screen

**Files:**
- Modify: `frontend/src/components/SignInScreen.tsx`
- Modify: `frontend/src/components/SignInScreen.test.tsx`

- [ ] **Step 2.1: Write the failing test**

  Add to `frontend/src/components/SignInScreen.test.tsx` inside the `describe('SignInScreen')` block:

  ```tsx
  it('renders mascot image', () => {
    render(<SignInScreen />)
    expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  })
  ```

- [ ] **Step 2.2: Run the new test — expect FAIL**

  ```bash
  cd frontend && npm run test -- src/components/SignInScreen.test.tsx
  ```

  Expected: `renders mascot image` fails — no img element found

- [ ] **Step 2.3: Update `SignInScreen.tsx`**

  Replace the entire file content:

  ```tsx
  import { useAuth } from '../contexts/AuthContext'
  import { usePageTitle } from '../hooks/usePageTitle'
  import { Mascot } from './Mascot'

  export function SignInScreen() {
    usePageTitle()
    const { signIn } = useAuth()

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100dvh',
          gap: '1.5rem',
          padding: '2rem',
        }}
      >
        <Mascot size={160} />
        <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>CarroQueSí</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          Lista de compras compartida
        </p>
        <button
          onClick={() => void signIn()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 500,
          }}
        >
          Continuar con Google
        </button>
      </div>
    )
  }
  ```

- [ ] **Step 2.4: Run tests — expect all PASS**

  ```bash
  cd frontend && npm run test -- src/components/SignInScreen.test.tsx
  ```

  Expected: 4 tests pass

- [ ] **Step 2.5: Commit**

  ```bash
  git add frontend/src/components/SignInScreen.tsx \
          frontend/src/components/SignInScreen.test.tsx
  git commit -m "feat: add mascot to sign-in screen"
  ```

---

## Task 3: Update list empty state

**Files:**
- Modify: `frontend/src/components/ItemList.tsx`
- Modify: `frontend/src/components/ItemList.test.tsx`

- [ ] **Step 3.1: Update the existing empty-state test**

  In `frontend/src/components/ItemList.test.tsx`, find the `'shows empty state'` test and replace it:

  ```ts
  test('shows empty state with mascot and updated copy', () => {
    render(
      <ItemList status="success" items={[]} members={MEMBERS}
        onTogglePurchased={() => {}} onTagClick={() => {}} onMenuOpen={() => {}} onRetry={() => {}}
        onPriceClick={() => {}} />
    )
    expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
    expect(screen.getByText(/Sin productos todavía/i)).toBeInTheDocument()
    expect(screen.getByText(/Añade el primero desde abajo/i)).toBeInTheDocument()
  })
  ```

- [ ] **Step 3.2: Run the test — expect FAIL**

  ```bash
  cd frontend && npm run test -- src/components/ItemList.test.tsx
  ```

  Expected: the updated `'shows empty state'` test fails — old copy and no img

- [ ] **Step 3.3: Update the empty state in `ItemList.tsx`**

  In `frontend/src/components/ItemList.tsx`, add the import after the existing imports:

  ```tsx
  import { Mascot } from './Mascot'
  ```

  Then find the empty-state block (currently lines 67–73):

  ```tsx
  if (active.length === 0 && purchased.length === 0) {
    return (
      <div className="item-list item-list--centered">
        <p>Sin productos — añade el primero abajo</p>
      </div>
    )
  }
  ```

  Replace it with:

  ```tsx
  if (active.length === 0 && purchased.length === 0) {
    return (
      <div className="item-list item-list--centered" style={{ gap: '0.75rem' }}>
        <Mascot size={120} />
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>
          Sin productos todavía
        </p>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
          Añade el primero desde abajo
        </p>
      </div>
    )
  }
  ```

- [ ] **Step 3.4: Run tests — expect all PASS**

  ```bash
  cd frontend && npm run test -- src/components/ItemList.test.tsx
  ```

  Expected: all tests pass

- [ ] **Step 3.5: Commit**

  ```bash
  git add frontend/src/components/ItemList.tsx \
          frontend/src/components/ItemList.test.tsx
  git commit -m "feat: add mascot to list empty state"
  ```

---

## Task 4: Update dashboard empty state

**Files:**
- Modify: `frontend/src/components/CreateListCard.tsx`
- Modify: `frontend/src/components/CreateListCard.test.tsx`

- [ ] **Step 4.1: Write the failing test**

  Add to `frontend/src/components/CreateListCard.test.tsx` inside the `describe('CreateListCard')` block:

  ```tsx
  it('shows mascot when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  })

  it('shows "Aún no tienes listas" text when isFirst', () => {
    render(<CreateListCard isFirst onCreate={vi.fn()} />)
    expect(screen.getByText(/Aún no tienes listas/i)).toBeInTheDocument()
  })

  it('does not show mascot when not isFirst', () => {
    render(<CreateListCard onCreate={vi.fn()} />)
    expect(screen.queryByRole('img', { name: /mascota/i })).not.toBeInTheDocument()
  })
  ```

- [ ] **Step 4.2: Run the new tests — expect FAIL**

  ```bash
  cd frontend && npm run test -- src/components/CreateListCard.test.tsx
  ```

  Expected: the three new tests fail

- [ ] **Step 4.3: Update `CreateListCard.tsx`**

  Replace the entire file:

  ```tsx
  import { useState } from 'react'
  import './CreateListCard.css'
  import { Mascot } from './Mascot'

  interface Props {
    isFirst?: boolean
    onCreate: (name: string) => Promise<void>
  }

  export function CreateListCard({ isFirst, onCreate }: Props) {
    const [expanded, setExpanded] = useState(false)
    const [name, setName] = useState('')
    const [creating, setCreating] = useState(false)

    if (!expanded) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          {isFirst && (
            <>
              <Mascot size={120} />
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>
                Aún no tienes listas
              </p>
            </>
          )}
          <button className="create-list-card" onClick={() => setExpanded(true)}>
            {isFirst ? 'Crea tu primera lista' : '+ Nueva lista'}
          </button>
        </div>
      )
    }

    const handleSubmit = async () => {
      if (!name.trim()) return
      setCreating(true)
      try {
        await onCreate(name.trim())
        setName('')
        setExpanded(false)
      } finally {
        setCreating(false)
      }
    }

    return (
      <div className="create-list-card create-list-card--expanded">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la lista"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit()
            if (e.key === 'Escape') { setExpanded(false); setName('') }
          }}
        />
        <button
          disabled={!name.trim() || creating}
          onClick={() => void handleSubmit()}
        >
          Crear lista
        </button>
      </div>
    )
  }
  ```

- [ ] **Step 4.4: Run tests — expect all PASS**

  ```bash
  cd frontend && npm run test -- src/components/CreateListCard.test.tsx
  ```

  Expected: all tests pass (including the original 6 + the 3 new ones)

- [ ] **Step 4.5: Commit**

  ```bash
  git add frontend/src/components/CreateListCard.tsx \
          frontend/src/components/CreateListCard.test.tsx
  git commit -m "feat: add mascot to dashboard empty state"
  ```

---

## Task 5: Update invite screen

**Files:**
- Modify: `frontend/src/components/InviteScreen.css`
- Modify: `frontend/src/components/InviteScreen.tsx`
- Modify: `frontend/src/components/InviteScreen.test.tsx`

- [ ] **Step 5.1: Fix the `.invite-screen` container so children stack vertically**

  In `frontend/src/components/InviteScreen.css`, update `.invite-screen`:

  ```css
  .invite-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    min-height: 100dvh;
    padding: 1.5rem;
    background: var(--color-bg);
  }
  ```

- [ ] **Step 5.2: Write the failing test**

  In `frontend/src/components/InviteScreen.test.tsx`, add after the `'shows list name and inviter name in preview'` test:

  ```tsx
  test('shows mascot in preview state', async () => {
    vi.mocked(api.getInvitePreview).mockResolvedValue(previewData)
    render(<InviteScreen />)
    await waitFor(() => expect(screen.getByText('Compras')).toBeInTheDocument())
    expect(screen.getByRole('img', { name: /mascota/i })).toBeInTheDocument()
  })
  ```

- [ ] **Step 5.3: Run the new test — expect FAIL**

  ```bash
  cd frontend && npm run test -- src/components/InviteScreen.test.tsx
  ```

  Expected: `'shows mascot in preview state'` fails — no img element found

- [ ] **Step 5.4: Update `InviteScreen.tsx`**

  Add the `Mascot` import after the existing imports:

  ```tsx
  import { Mascot } from './Mascot'
  ```

  Then find the `preview` return block (starts at line 136). Replace it:

  ```tsx
  return (
    <div className="invite-screen">
      <Mascot size={100} />
      <div className="invite-screen__card">
        <div className="invite-screen__icon">{preview?.list_emoji ?? '🛒'}</div>
        <h1 className="invite-screen__list-name">{preview?.list_name}</h1>
        {preview?.invited_by_name && (
          <p className="invite-screen__inviter">Invitado por {preview.invited_by_name}</p>
        )}
        <button className="invite-screen__btn" onClick={() => void handleAccept()}>
          {user ? 'Unirse a la lista' : 'Iniciar sesión para unirse'}
        </button>
      </div>
    </div>
  )
  ```

- [ ] **Step 5.5: Run tests — expect all PASS**

  ```bash
  cd frontend && npm run test -- src/components/InviteScreen.test.tsx
  ```

  Expected: all tests pass

- [ ] **Step 5.6: Commit**

  ```bash
  git add frontend/src/components/InviteScreen.css \
          frontend/src/components/InviteScreen.tsx \
          frontend/src/components/InviteScreen.test.tsx
  git commit -m "feat: add mascot to invite screen"
  ```

---

## Task 6: Generate PWA app icons

**Files:**
- Create: `frontend/public/mascot.png` — source image for the generator
- Create: `frontend/pwa-assets.config.ts` — icon generation config
- Regenerate: `frontend/public/pwa-*.png`, `frontend/public/apple-touch-icon-180x180.png`, `frontend/public/maskable-icon-512x512.png`, `frontend/public/favicon.ico`

`@vite-pwa/assets-generator` is already installed in devDependencies — no new packages needed.

- [ ] **Step 6.1: Copy the mascot to `public/` as the generator source**

  ```bash
  cp frontend/src/assets/mascot.png frontend/public/mascot.png
  ```

- [ ] **Step 6.2: Create the generator config**

  Create `frontend/pwa-assets.config.ts`:

  ```ts
  import { defineConfig } from '@vite-pwa/assets-generator/config'

  export default defineConfig({
    preset: {
      transparent: {
        sizes: [64, 192, 512],
        favicons: [[48, 'favicon.ico']],
        resizeOptions: { background: '#ffffff', fit: 'contain' },
        padding: 0.1,
      },
      maskable: {
        sizes: [512],
        resizeOptions: { background: '#aa3bff', fit: 'contain' },
        padding: 0.1,
      },
      apple: {
        sizes: [180],
        resizeOptions: { background: '#ffffff', fit: 'contain' },
        padding: 0.1,
      },
    },
    images: ['public/mascot.png'],
  })
  ```

- [ ] **Step 6.3: Run the generator**

  ```bash
  cd frontend && npx pwa-assets-generator --config pwa-assets.config.ts
  ```

  Expected output lists each generated file:
  ```
  ✓ public/favicon.ico
  ✓ public/pwa-64x64.png
  ✓ public/pwa-192x192.png
  ✓ public/pwa-512x512.png
  ✓ public/maskable-icon-512x512.png
  ✓ public/apple-touch-icon-180x180.png
  ```

  If the command is not found, try: `npx @vite-pwa/assets-generator --config pwa-assets.config.ts`

- [ ] **Step 6.4: Verify output visually**

  Open the generated icons to confirm the mascot is visible:

  ```bash
  open frontend/public/pwa-192x192.png
  open frontend/public/maskable-icon-512x512.png
  ```

  The 192×192 should show the mascot on a white background. The maskable 512×512 should show the mascot on a purple (`#aa3bff`) background with padding.

- [ ] **Step 6.5: Commit**

  ```bash
  git add frontend/public/mascot.png \
          frontend/pwa-assets.config.ts \
          frontend/public/pwa-64x64.png \
          frontend/public/pwa-192x192.png \
          frontend/public/pwa-512x512.png \
          frontend/public/maskable-icon-512x512.png \
          frontend/public/apple-touch-icon-180x180.png \
          frontend/public/favicon.ico
  git commit -m "feat: replace placeholder icons with mascot"
  ```

---

## Task 7: Final validation

- [ ] **Step 7.1: Run full test suite**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all tests pass

- [ ] **Step 7.2: Run typecheck**

  ```bash
  cd frontend && node_modules/.bin/tsc -p tsconfig.app.json --noEmit
  ```

  Expected: no errors

- [ ] **Step 7.3: Run linter**

  ```bash
  cd frontend && npm run lint
  ```

  Expected: no errors

- [ ] **Step 7.4: Start dev server and verify visually**

  ```bash
  cd frontend && npm run dev
  ```

  Open http://localhost:5173 and check:
  - Sign-in screen shows mascot above "CarroQueSí" title
  - An empty list shows mascot above "Sin productos todavía"
  - Dashboard with no lists shows mascot above "Aún no tienes listas"
  - An invite link (`/i/<id>`) shows mascot above the invite card
  - Browser tab shows the new favicon
