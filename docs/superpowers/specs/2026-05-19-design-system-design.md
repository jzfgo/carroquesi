# Design System Implementation — CarroQueSí

**Date:** 2026-05-19
**Branch:** feat/design-system
**Approach:** Strict handoff order (tokens → fonts → new components → component sweep → brand assets → tests)

---

## Source of Truth

All design decisions live in `design_handoff_design_system/`. The canonical files are:

- `tokens/colors_and_type.css` — every CSS custom property
- `ui_kit/index.html` — runnable prototype (open locally to verify fidelity)
- `previews/` — per-component static design cards
- `brand-assets/` — updated SVG/PNG sources against new `#EEF1F5` background

---

## Step 1 — Token & Font Foundation

### Tokens

1. Copy `design_handoff_design_system/tokens/colors_and_type.css` verbatim → `frontend/src/colors_and_type.css`.
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

Replace in `frontend/public/`:

| Target file | Source from `brand-assets/` |
|---|---|
| `favicon.svg` | `favicon.svg` |
| `mascot.png` | `mascot.png` |
| `pwa-512x512.png` | `pwa-512.png` |
| `maskable-icon-512x512.png` | `maskable-512.png` |
| `apple-touch-icon-180x180.png` | `apple-touch-icon.png` |
| `og-image.png` | `og-image.png` |

Then regenerate remaining raster sizes (192×192, 64×64, `favicon.ico`):

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
