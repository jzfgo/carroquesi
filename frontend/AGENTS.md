# Frontend Guidelines

> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` directly.
> Repo-wide guidance lives in the root `AGENTS.md`, which every harness loads.
> This file is loaded automatically only by harnesses that discover nested
> guidance (Claude Code). The root file points here by path, so harnesses that
> read a single instructions file — OpenCode and Codex pin `AGENTS.md` — should
> open it directly when working on the frontend.

## Unit tests (vitest)

**Stylesheets are inert by default.** `getComputedStyle` in jsdom returns nothing for a rule that lives in a CSS file, so a test asserting a computed style passes whatever the stylesheet says — it is vacuous, not green. Opt a file in through `test.css.include` in `frontend/vite.config.ts`, one pattern at a time. Turning it on everywhere lets jsdom compute visibility from stylesheets across the whole suite, which can flip any existing visibility assertion.

Two things to know before writing such a test:

- **Prove it fails.** Delete the rule, watch the test go red, put it back. That is the only way to tell an applied stylesheet from an unapplied one.
- **jsdom drops a shorthand containing `var()`.** `border: 1.5px dashed var(--ink-3)` parses to nothing; `border-width` / `border-style` / `border-color` as longhands works. Write the longhands and say why in a comment, or the next reader will tidy them back.

This is worth reaching for when the thing under test is a small visual affordance. A screenshot cannot guard one: a 1.5 px dashed border costs fewer pixels than the tolerance, so it can vanish silently.

**The clock is the machine's.** Playwright pins the browser's timezone; vitest does not, and nothing pins the date. A fixture holding a timestamp near "now" starts failing on its own overnight — `itemState` takes `now` as a parameter for exactly this reason, so pass it.

## E2E Testing (Playwright)

Run with `just frontend test-e2e` (alias: `pnpm test:e2e`; extra arguments reach playwright, so `--grep` and `--project` work). Config: `frontend/playwright.config.ts`. Tests live in `frontend/tests/`.

**`fixtures.ts` runs in Node, the page runs on a pinned clock.** A route handler that stamps a response with its own `new Date()` writes the machine's date into a page that thinks it is some other day — and a purchase stamped in the page's future never reads as settled. Derive every instant in a handler from the request, never locally.

**Scope queries to the thing under test.** The list screen carries a filter chip per shop and a store control on the input bar, so an unscoped `getByRole('button', { name: 'Mercadona' })` matches the filter rather than the sheet. Anchor on the component's own root.

Key gotchas:

- Runs against the **preview build** (`pnpm build && pnpm preview`), not the dev server — changes must be built first
- Default port is `4173`; override with `FRONTEND_PORT_E2E` / `FRONTEND_URL_E2E`
- The config hardcodes `VITE_DEV_USER_ID` (default `seed-alice`; override it to switch users) and `VITE_BACKEND_URL`. `VITE_DEV_USER_ID` alone drives the auth bypass, entirely client-side: `AuthContext.tsx` skips Firebase when it is set, and `api.ts` sends `X-Dev-User-Id`. **`DEV_AUTH_BYPASS` plays no part in an E2E run** — `webServer` starts the preview build and nothing else, and `fixtures.ts` intercepts every `localhost:8000` call and fulfils it from frozen literals
- Uses `loadEnvFile()` which does **not** expand `${VAR}` syntax — config explicitly overrides `VITE_BACKEND_URL` to work around this
- Browsers: Chromium, Firefox, WebKit, Mobile Chrome (Pixel 10), Mobile Safari (iPhone 17)

Visual-regression baselines and how to regenerate them are in the root `AGENTS.md` — the regenerate command is run from the repo root, so that guidance must stay always-loaded.
