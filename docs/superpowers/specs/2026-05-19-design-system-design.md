# Design System Implementation — CarroQueSí

**Date:** 2026-05-19
**Branch:** feat/design-system
**Approach:** Strict handoff order (tokens → fonts → new components → component sweep → brand assets → tests)

---

## Source of Truth

All design decisions live in the repo root at `design_handoff_design_system/`. From this worktree (`.worktrees/design-system/`) that resolves to `../../design_handoff_design_system/`. The canonical files are:

- `../../design_handoff_design_system/tokens/colors_and_type.css` — every CSS custom property
- `../../design_handoff_design_system/ui_kit/index.html` — runnable prototype (open locally to verify fidelity)
- `../../design_handoff_design_system/previews/` — per-component static design cards
- `../../design_handoff_design_system/brand-assets/` — updated SVG/PNG sources against new `#EEF1F5` background

---

## Step 1 — Token & Font Foundation

### Tokens

1. Copy `../../design_handoff_design_system/tokens/colors_and_type.css` verbatim → `frontend/src/colors_and_type.css`.
2. Replace the entire `:root { … }` block in `frontend/src/index.css` with `@import './colors_and_type.css';`.
3. Delete the `@media (prefers-color-scheme: dark)` override in `index.css` — the imported file ships its own dark theme.
4. Add a backwards-compat block in `index.css` so existing components keep working while the migration sweep runs:

```css
/* Compat aliases — remove once every component uses canonical token names */
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
  /* Global rules in index.css use --sans, --heading, --mono, --shadow */
  --sans:                 var(--font-sans);
  --heading:              var(--font-display);
  --mono:                 var(--font-mono);
  --shadow:               var(--shadow-md);
}
```

### Fonts

Add to `frontend/index.html` `<head>` (before any CSS):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Bree+Serif&family=Caveat:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
```

Update `<meta name="theme-color" content="#EEF1F5">` in `index.html`.

Font roles:

| Family | Token | Used for |
|---|---|---|
| Geist | `--font-sans` | All body text, buttons, inputs, item names |
| Bree Serif | `--font-display` | List names, screen titles, hero copy |
| Caveat | `--font-hand` | Wordmark, "¡a por ello!" annotation, empty-state warmth. Never for UI chrome. |
| JetBrains Mono | `--font-mono` | Prices, EAN codes, quantity numerals |

---

## Step 2 — New Component: `Wordmark`

Create `frontend/src/components/Wordmark.tsx` + `Wordmark.css`.

```tsx
// Wordmark.tsx
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

```css
/* Wordmark.css */
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
.wordmark__word { display: inline-block; color: var(--ink-0); }
.wordmark__tick {
  color: var(--verde-0);
  transform: rotate(-6deg) translateY(0.04em);
  align-self: center;
  flex-shrink: 0;
  margin-left: 0.18em;
}
```

Usage: `<Wordmark size={56} />` in `SignInScreen`, `<Wordmark size={26} />` in `DashboardScreen` header.

---

## Step 2.5 — Theme System Removal

The current app has a terminal-theme picker (26 themes: monokai-pro, catppuccin-mocha, etc.) driven by `data-theme` on `<html>` and a `localStorage` key `terminal-theme`. The new design system uses OS-driven light/dark only. Remove the old system entirely.

### Files to delete

- `frontend/src/theme/terminal-themes.css` — all 26 `[data-theme="…"]` overrides
- `frontend/src/lib/themes.ts` — the `THEMES` array and `DEFAULT_THEME` constant

### Files to modify

**`frontend/src/main.tsx`**
- Remove `import './theme/terminal-themes.css'`

**`frontend/src/components/ThemeManager.tsx`**
- Rewrite completely. Drop all terminal-theme logic (`THEMES`, `localStorage`, `data-theme`).
- New behaviour: read `window.matchMedia('(prefers-color-scheme: dark)')` on mount and add a `change` listener; toggle `class="theme-dark"` on `<body>` accordingly. Renders `children` directly (no wrapper div needed).

```tsx
import { useEffect } from 'react'

export function ThemeManager({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (dark: boolean) =>
      document.body.classList.toggle('theme-dark', dark)
    apply(mq.matches)
    mq.addEventListener('change', e => apply(e.matches))
    return () => mq.removeEventListener('change', e => apply(e.matches))
  }, [])
  return <>{children}</>
}
```

**`frontend/src/components/SettingsScreen.tsx` + `SettingsScreen.css`**
- Delete both files. Theme switching was the only content; the screen becomes dead code.

**`frontend/src/App.tsx`**
- Remove `import { SettingsScreen }` and the `/settings` route.

**`frontend/src/components/DashboardScreen.tsx`**
- Remove the "Configuración" user-menu item that calls `navigate('/settings')`.

### Checklist additions

- [ ] `terminal-themes.css` deleted; `themes.ts` deleted
- [ ] `ThemeManager` follows OS preference via `matchMedia`; toggles `class="theme-dark"` on `<body>`
- [ ] `SettingsScreen` component and route removed
- [ ] "Configuración" menu item removed from `DashboardScreen`
- [ ] `terminal-theme` localStorage key no longer read or written

---

## Step 3 — Component Sweep

All component changes use sidecar `.css` files plus minimal TSX edits where noted. No component is rewritten — this is a restyle.

### Screens

**`SignInScreen.tsx`**
- Create `SignInScreen.css` (lift all inline styles into it).
- Add Caveat "¡a por ello!" annotation above mascot (rotated ~-5deg, `--accent` color).
- Replace `<h1>CarroQueSí</h1>` with `<Wordmark size={56} />`.
- Structure: `signin` > `signin__hand` + `<Mascot size={160}>` + `signin__title` + `signin__tag` + `signin__cta`.

**`DashboardScreen.tsx`**
- Header: replace wordmark element with `<Wordmark size={26} />`.
- Restyle via tokens (no structural changes).

**`ListHeader.tsx`**
- List name: `font-family: var(--font-display)`, `font-size: 26px`, `font-weight: 400`.

**`ListScreen.tsx`, `InviteScreen.tsx`, `SettingsScreen.tsx`**
- Token-only CSS updates.

### Cards

**`ListCard.tsx`** (TSX + CSS)
- Add inline `<ProgressBar value={purchased} max={total} variant={purchased === total ? 'success' : 'primary'} />` below list name.
- Empty list: show "vacía · añade lo primero" subtitle.
- CSS: restyle via tokens.

**`ItemCard.tsx`** (TSX + CSS)
- Avatar logic: `isSelf` → `{ background: 'var(--tinta-0)', color: 'var(--accent-fg)' }`; others → `{ background: 'var(--paper-2)', color: 'var(--ink-1)' }`. Remove `member.color` from driving the UI.
- Price tag (`.item-card__tag--price`): `background: var(--verde-bg); color: var(--verde-0); border: 1px solid var(--verde-border); font-family: var(--font-mono)`.

**`CreateListCard.tsx`**
- Dashed `--border-strong` outline, `--ink-2` text, `--font-display` for label.

### Banners & Toasts

**`FrequencySuggestionBanner.tsx`** (CSS only)
- `.freq-banner__add`: solid tinta primary (`background: var(--tinta-0); color: var(--accent-fg); border: none`).
- Banner shell stays `--miel-bg` (translucent warm).

**`PurchaseToast.tsx`** (CSS only)
- `background: var(--verde-bg); border: 1px solid var(--verde-border)`.
- "Deshacer" button: tinta color.

**`InstallBanner.tsx`** (CSS only)
- `background: var(--miel-bg); border: 1px solid var(--miel-border)`.

**`Toast.tsx`** (CSS only)
- Token restyle.

### Input & Filter

**`SmartInputBar.tsx`** (CSS only)
- Token restyle; chip rail uses `--tinta-border` chips.

**`FilterBar.tsx`** (CSS only)
- Selected chip: solid tinta (`--tinta-0` bg, `--accent-fg` text).
- Unselected chip: `--paper-1` bg, `--paper-edge` border.

### Sheets (all CSS only)

Shared chrome for all action sheets (`ItemActionSheet`, `ListActionSheet`, `ListMembersSheet`, `EmojiPickerSheet`, `StoreEditSheet`, `TagEditSheet`, `BarcodeScanSheet`, `LogPriceSheet`, `PriceHistorySheet`):

- Background: `var(--paper-0)`
- Top shadow: `var(--shadow-sheet)`
- Drag handle: `var(--paper-edge)`
- Row hover: `var(--paper-2)`

### Utilities

**`ProgressBar.tsx`** (TSX + CSS)
- Add `variant: 'primary' | 'success'` prop.
- Fill: `--tinta-0` for `primary`, `--verde-0` for `success`.
- Track: `--paper-2`.

**`BarcodeScanner.tsx`** (CSS only)
- Camera overlay: `rgba(0,0,0,0.85)`.
- Reticle border + help text: `--paper-0`.

**`Mascot.tsx`**
- Verify PNG source matches `brand-assets/mascot.png`. No code change expected.

**`ThemeManager.tsx`**
- Ensure dark mode is toggled by adding/removing `class="theme-dark"` on `<body>`. Dark palette is already shipped in `colors_and_type.css` — no extra CSS needed.

---

## Step 4 — Brand Assets

Four files in `../../design_handoff_design_system/brand-assets/` are **outdated** (still use the old purple `#aa3bff` accent scheme): `favicon.svg`, `icons.svg`, `maskable-512.png`, `og-image.png`. Do **not** copy these.

### Files safe to copy directly

| Target in `frontend/public/` | Source |
|---|---|
| `mascot.png` | `../../design_handoff_design_system/brand-assets/mascot.png` |
| `pwa-512x512.png` | `../../design_handoff_design_system/brand-assets/pwa-512.png` |
| `apple-touch-icon-180x180.png` | `../../design_handoff_design_system/brand-assets/apple-touch-icon.png` |

### Files that need regeneration against `#EEF1F5`

- `favicon.svg` — the copy in `brand-assets/` is the default Vite placeholder icon (not a CarroQueSí asset). The real source is `../../design_handoff_design_system/brand-assets/icon-app.svg` (notebook page + verde ticks + Caveat text). Copy `icon-app.svg` → `frontend/public/favicon.svg`, then use it as the input for `pwa-assets-generator`.
- `maskable-icon-512x512.png` — regenerate from the corrected `favicon.svg` using `npx pwa-assets-generator`.
- `og-image.png` — uses old purple accent scheme; regenerate or redraw against the new `#EEF1F5` / tinta palette.
- `icons.svg` — has 5 hardcoded `stroke="#aa3bff"` attributes. Do not copy from brand-assets; instead update `frontend/public/icons.svg` directly by replacing every `#aa3bff` → `#1A3FA0` (tinta-0). CSS vars cannot be used in standalone SVG files served from `public/`.

### PWA raster regeneration

Once `favicon.svg` is corrected, regenerate all remaining raster sizes (512×512 maskable, 192×192, 64×64, `favicon.ico`):

```bash
cd frontend && npx pwa-assets-generator
```

---

## Step 5 — Tests

- `SignInScreen.test.tsx`: change text query to `getByLabelText(/carroquesí/i)` (covers the `aria-label` on `<Wordmark>`).
- Regenerate any snapshot tests after CSS changes land.
- Acceptance: `npm test` + `just frontend typecheck` + `npm run lint` all pass clean.

---

## Acceptance Checklist

- [ ] `terminal-themes.css` deleted; `themes.ts` deleted; `ThemeManager` follows OS `prefers-color-scheme`
- [ ] `SettingsScreen` component, route, and "Configuración" menu item removed
- [ ] `src/index.css` `:root` block replaced with `@import` of new tokens; compat block in place
- [ ] Fonts loaded via `<link>` in `index.html`; `theme-color` meta = `#EEF1F5`
- [ ] `Wordmark` component created and used in `SignInScreen` and `DashboardScreen`
- [ ] `ProgressBar` has `variant` prop (`primary` / `success`)
- [ ] `ItemCard` avatar painted by self/other rule, not `member.color`
- [ ] `.item-card__tag--price` repainted to verde tokens + JetBrains Mono
- [ ] `FrequencySuggestionBanner` "Añadir" button = solid tinta
- [ ] `ListCard` shows inline progress bar with verde/tinta rule
- [ ] `SignInScreen` inline styles lifted to `.css`; "¡a por ello!" Caveat line added
- [ ] All component `.css` files reference canonical tokens (no hardcoded hex remaining)
- [ ] PWA assets regenerated against `#EEF1F5` background
- [ ] Dark mode toggled by `class="theme-dark"` on `<body>`
- [ ] `ui_kit/index.html` and live app render identically at sign-in, dashboard, list screens
- [ ] `SignInScreen.test.tsx` query updated to `getByLabelText`
- [ ] Baseline test count maintained (464 passing pre-existing; 43 pre-existing failures unchanged)

---

## Baseline

- Tests on `main` at spec time: 464 passing, 43 failing (pre-existing, unrelated to design system)
- Worktree: `.worktrees/design-system` on branch `feat/design-system`
