# CarroQueSí — Design System

A grounded, notepad-inspired design system for **CarroQueSí**, a
collaborative grocery-list web app for families and households.

> **Product in one line.** Shared shopping lists you tick off together,
> with smart suggestions for what you usually buy, per-item price
> history, barcode lookup, and a running total per shopping session.

This is a **ground-up redesign**. The existing frontend (in `/frontend`,
attached read-only) ships a mauve-purple direction on system fonts; the
team flagged that they don't like it. The design here keeps the
character (mascot, Spanish-language warmth, sigil-driven input) and
re-grounds the visuals as if the app were a real, hand-jotted
shopping list — without ever crossing into skeuomorphism.

## Sources used

| Source | Where | How to access |
|---|---|---|
| Frontend codebase | `/frontend` mounted folder (read-only) | `local_ls("frontend")`, `local_read(...)` |
| Mascot artwork | `uploads/ChatGPT Image May 13, 2026, 07_02_55 PM.png` (copied to `assets/mascot.png`) | included |

No Figma file was provided.

---

## Index

- **[`colors_and_type.css`](./colors_and_type.css)** — all design tokens (CSS variables): palette, semantic aliases, type scale, spacing, radii, shadows, motion, plus light/dark mode overrides and helper utilities (`.t-hero`, `.t-body`, `.bg-ruled`, etc).
- **[`assets/`](./assets/)** — mascot, app icon (new SVG), favicons, OG image.
- **[`fonts/README.md`](./fonts/README.md)** — type stack and substitution flag.
- **[`preview/`](./preview/)** — small HTML cards that document the system; each renders one concept (registered in the **Design System** tab).
- **[`ui_kits/app/`](./ui_kits/app/)** — interactive PWA recreation; see its `README.md`.
- **[`SKILL.md`](./SKILL.md)** — entry point for using this system as an Agent Skill.

---

## CONTENT FUNDAMENTALS

### Language

- **Spanish (es-ES)** throughout. Spain Spanish — *vosotros* and store names like *Mercadona*, *Lidl*, *Carrefour*. The product name puns on the idiom *"claro que sí"* (of course) — *"Carro que sí"* ≈ *the cart that says yes*.
- English is not provided; if i18n becomes a need, plan strings; never machine-translate the wordmark.

### Voice & tone

> **The voice is a friend at the doorway, not a clerk behind a counter.**
> Warm. Lowercase-leaning. Brief. Inviting. Never apologetic, never
> robotic.

| Pillar | What it means |
|---|---|
| **Familiar** | Tutea (use *tú*, not *usted*). Talk to one person, even when the list is shared. *"Aún no tienes listas. Empieza una y compártela en casa."* |
| **Grounded** | Concrete nouns (*tomates pera*, *aceite v.e.*), not generic ones (*producto*, *artículo*) except in field labels. |
| **Light** | Confirmations are little congratulations: *"tomates pera tachados"*. Errors are kind: *"No se pudo guardar el precio. Comprueba tu conexión."* |
| **Quiet** | Never **all-caps**, never exclamation-stacking. One *¡así!* at a time, max. |

### Casing

- **Sentence case** for buttons, headings, sheet rows: *"Crear lista"*, *"Eliminar producto"*. **Never** title case.
- **lowercase** in toasts and hand-jotted accents: *"listo ✓"*, *"¡a por ello!"*.
- Spanish punctuation rules apply: opening *¿* and *¡* required.

### Numbers, money, units

- Euros with comma decimal and the symbol BEFORE the value: `€ 6,99` (not `6,99 €`). Tabular figures via JetBrains Mono so totals line up.
- Quantities pluralize in Spanish: *1 kg*, *2 kg* (no irregular plurals in our domain). Units lowercase (`kg`, `g`, `ud`, `L`).

### Emoji

- **Curated only.** A list emoji (🥑, 🎉, 🌮) personalises a list. That's allowed and intentional.
- **No emoji in body copy.** No 🙏, no 💯, no flame icons, ever.
- Old code used emoji as tag glyphs (🏷, 🏪, 💶). The new system replaces those with **Lucide icons** for UI affordances; emoji is reserved for user-chosen list icons and the hand-jotted accent (Caveat) "¡listo ✓".

### Examples — sí / no

| ✅ Sí | ❌ No |
|---|---|
| *"Aún no tienes listas. Empieza una y compártela en casa."* | *"No hay listas asociadas al usuario actual."* |
| *"tomates pera comprados"* (toast) | *"El producto ha sido marcado como comprado correctamente."* |
| *"No se pudo guardar el precio. Comprueba tu conexión."* | *"Error 500: Network unreachable."* |
| *"Sueles comprar leche entera los jueves. ¿La añadimos?"* | *"Suggested item based on purchase history."* |

---

## VISUAL FOUNDATIONS

### Colours

A warm, paper-cream palette anchored by a deep "ink" navy. The accent
choice was deliberate: it reads like ballpoint on paper, not like a
SaaS dashboard.

| Role | Token | Light | Dark | When |
|---|---|---|---|---|
| Brand · primary | `--tinta-0` | `#1F3A8A` | `#91AEFF` | Buttons, links, primary action, sigil glyphs |
| Success · "tachado" | `--verde-0` | `#3A7A4A` | `#84C99A` | Purchased state, totals-bought, success toasts |
| Destructive · sale | `--tomate-0` | `#C0392B` | `#E68A82` | Errors, delete actions, *en oferta* tags |
| Attention · promo | `--miel-0` | `#C9941F` | `#E6C56A` | Suggestions, highlights, promotion chips |
| Paper surfaces | `--paper-0..2`, `--paper-edge` | Warm off-whites | Warm graphites | Backgrounds, dividers |
| Ink text | `--ink-0..3`, `--ink-strike` | Warm blacks | Cream | Body text, muted text |

**No purples, no SaaS-blue gradients.** Dark mode is *warm graphite*,
not pure black — paper at lights-out, not chrome.

Imagery vibe: **warm, soft, midday**. Avoid cool/blue photo treatments.
The mascot is rendered, slightly clay-3D; matching this look in any
future illustration is fine.

### Typography

See `fonts/README.md` for the four-family stack (Geist · Instrument
Serif · Caveat · JetBrains Mono) and substitution flag.

**Type rules:**
- Headings are **Instrument Serif Italic**. Body is **Geist**. Hand-jotted *Caveat* is reserved for moments that earn personality — empty states, the wordmark accent, "¡listo!" on ticked items in the empty state mascot.
- Numbers, prices, totals, EAN codes are **always JetBrains Mono** with `font-variant-numeric: tabular-nums`.
- Minimum readable size on mobile is **15 px** (touch); use 16 px for body where possible.

### Spacing

Standard 4-based scale: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Use
multiples of 4. Card padding is `14 16`; sheet padding is `16` with
`28` bottom safe-area. Touch hit-targets minimum **44 px**.

### Backgrounds & surfaces

- **No full-bleed photography.** The product is utilitarian; imagery competes with grocery items.
- **No gradients** on UI surfaces. Backgrounds are flat colour. The two allowed background patterns are `.bg-ruled` (faint horizontal lines, like a notepad) and `.bg-grid` (graph paper); use them sparingly on marketing surfaces or empty states.
- **Paper texture** is implied through the warm off-white palette and one-pixel `--rule` dividers — never a literal noise texture overlay.

### Borders, dividers, cards

- Default border colour is `--border` (`#DCD3B6` light / `#3A362A` dark) at 1 px. Strong borders use `--border-strong` and 1.5 px (used on input outlines).
- List rows are separated by **1 px horizontal rules** (`--rule`), not card shadows. Reserve shadows for elevated surfaces.
- Cards have **14 px corner radius**. Inputs use 12–14 px. Pills/chips use 999. App-icon corners are 22 % (iOS-style mask).

### Shadows / elevation

Soft, single-layer, warm-tinted. Three rungs:

- `--shadow-sm` — resting cards (list rows, list cards on dashboard)
- `--shadow-md` — popovers, lifted-while-dragging
- `--shadow-lg` — action sheets, modals
- `--shadow-sheet` — bottom sheets (shadows _upward_)

**No inner shadows.** No glow effects. No coloured drop-shadows beyond
the warm-tint baked into the tokens.

### Motion

- **`--ease-out` (default)** for affordances, hover, focus rings.
- **`--ease-spring`** for bottom sheets opening — they need to feel
  physical. No bounces on hover or page transitions.
- Durations: `--dur-fast` (120 ms) micro, `--dur-base` (200 ms) most,
  `--dur-slow` (320 ms) sheets.
- **No parallax. No scroll-jacking.** Fades are fine. Slides up from
  bottom (sheets, toasts) are fine.

### Interaction states

| State | Treatment |
|---|---|
| Hover (mouse) | Background lifts to `--bg-hover` (next paper rung). |
| Focus | `--focus-ring` — 3 px outset accent at 30 % opacity. **Always visible** when keyboard-focused; never `outline: none` without replacement. |
| Press (touch) | Subtle scale **0.97** on buttons; **0.99** on cards. ~120 ms ease-out. **No colour change** on press — touch users can't see colour under their finger. |
| Disabled | `--border-strong` background, no shadow, no transition. |
| Drag | `box-shadow: var(--shadow-md)` and 0.5 opacity; cursor `grabbing`. |

### Transparency & blur

- **Sparingly.** Sheet overlay is `rgba(20,16,8,0.45)` — a warm scrim. No `backdrop-filter` blur on overlays (battery + perf).
- The iOS frame in the UI kit uses Apple's glass for **status bar pills** only; the app itself is flat surfaces.

### Layout rules

- **Mobile / touch first.** Design at 402 × 874 (iPhone 16). Single column.
- **Fixed elements**: app header (top), smart input bar (bottom). The content list scrolls between them with `padding-bottom: 220px` to clear the input bar.
- Sheets slide up from the bottom and dim the page behind them.
- The desktop view stretches the same column to ~480–520 px max; **don't widen into a two-pane layout** — the product is a fundamentally personal-device experience.

---

## ICONOGRAPHY

The original codebase used **emoji as tag glyphs** (🏷 marca, 🏪 tienda,
💶 precio) and a hand-rolled inline `<svg>` for the barcode scanner.
There was no icon system.

### The new system

- **Lucide** (<https://lucide.dev>) at stroke-width **1.8**, rounded
  caps and joins, monochrome (`currentColor`), loaded from
  `unpkg.com/lucide@0.484.0`. Documented in
  `preview/brand-icons.html` and used everywhere in the UI kit.

> 🚩 **Substitution flag.** Lucide was **not** in the original
> codebase. It was chosen because it's a wide, free icon set with the
> right tone (modern, friendly, not over-decorative) and ships a clean
> UMD bundle. **Swap it freely** if the team prefers Phosphor, Feather,
> Tabler, or hand-rolled SVGs.

### Tag glyphs

The legacy tag glyphs (🏷 🏪 💶) are replaced one-to-one:

| Old emoji | New Lucide |
|---|---|
| 🏷 (brand)    | `tag` |
| 🏪 (store)    | `store` |
| 💶 (price)    | `euro` |
| 🔢 (quantity) | inline numeric in a pill — no icon |
| 📷 (scan)     | `scan-line` |

### Where emoji is still used

- **List icons** — the user picks one when creating a list (🥑 🎉 🌮 …). This is a *content* element, not chrome.
- **The hand-jotted accent** (Caveat) sometimes pairs with a single check `✓` — that's a Unicode character, not emoji.

### Brand visual assets

- `assets/mascot.png` — the 3D shopping-cart character with glasses and a thumbs-up. Used on sign-in, empty states, marketing.
- `assets/icon-app.svg` — a paper-textured app icon (warm cream, ruled lines, italic "CQ" wordmark, hand-drawn green tick). Replaces the old purple "CQ" tile.
- `assets/favicon.svg`, `assets/apple-touch-icon.png`, `assets/og-image.png`, `assets/pwa-512.png`, `assets/maskable-512.png` — copied from the existing PWA; **these still carry the OLD purple branding** and should be regenerated from `icon-app.svg` when the new direction is approved.
- `assets/icons.svg` — copied from `/frontend/public/icons.svg`; mostly Vite-template social-icon symbols (Bluesky / Discord / GitHub / X) that the app doesn't actually use. Kept for completeness; safe to delete.

---

## CAVEATS

Things you should know before iterating.

- **Type families are substitutions.** Geist + Instrument Serif + Caveat + JetBrains Mono. Easy to swap in `colors_and_type.css`.
- **Icon family is a substitution.** Lucide @ 1.8 stroke. Documented above.
- **Favicon / PWA icons** still use the old purple "CQ". Only `assets/icon-app.svg` reflects the new direction.
- **No real Settings, Invite, or Price-history screens** in the UI kit — easy to add following the same patterns; flagged in `ui_kits/app/README.md`.
- **No Figma file** was provided; everything is derived from the codebase + brief.
