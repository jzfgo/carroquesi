# Frontend Guidelines

> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` directly.
> Repo-wide guidance lives in the root `AGENTS.md`, which every harness loads.
> This file is loaded automatically only by harnesses that discover nested
> guidance (Claude Code). The root file points here by path, so harnesses that
> read a single instructions file — OpenCode and Codex pin `AGENTS.md` — should
> open it directly when working on the frontend.

## Fonts

**The faces are vendored, not fetched.** `src/fonts.css` declares them and `src/assets/fonts/` holds the bytes; nothing in the app talks to `fonts.googleapis.com` or `fonts.gstatic.com`. They are **static files, checked in** — there is no generator, and there is deliberately not one: a refresh is a manual job of a few minutes that comes round every year or two, and the header comment in `src/fonts.css` is the whole recipe. Read it before changing a family, a weight or a subset.

Three things in it that are load-bearing:

- **The `@font-face` blocks are Google's, copied through unedited.** Three of the five families are variable, so Google emits one block per requested weight all pointing at the same file. Collapsing those into a `font-weight: 400 700` range changes which instance the browser picks; dropping `unicode-range` downloads every subset on every page.
- **A changed `.woff2` is a rendering change app-wide.** Regenerate the visual baselines in the same PR, and say in the message that letterforms moved — see the tolerance section in `tests/README.md` for why a font refresh can move every screen by less than the budget and fail nothing.
- **Only ask for a weight the family has.** `fonts.css` is the list, and it is shorter than it looks:

  | family          | token            | vendored weights      |
  | --------------- | ---------------- | --------------------- |
  | Geist           | `--font-sans`    | 400 / 500 / 600 / 700 |
  | Caveat          | `--font-hand`    | 500 / 600 / 700       |
  | JetBrains Mono  | `--font-mono`    | 400 / 500 / 600       |
  | Bree Serif      | `--font-display` | **400 only**          |
  | Patrick Hand SC | `--font-written` | **400 only**          |

  Asking for a weight that is not there gives you one of two very different things, and **which one depends on the face that gets chosen, not on how far the request missed.** The browser first selects the nearest available cut; it then draws a synthetic bold — thickening the outlines algorithmically — only if that chosen cut is below 600. So JetBrains Mono answers a request for 700 with its real 600 and nothing is faked, while Bree Serif answers 600 _or_ 700 with its 400 and both are smeared. A family that stops at 600 is safe from the ugly outcome; one that stops at 400 is not.

  The quiet outcome is the one to watch, because nothing about it looks wrong. Caveat has no 400, so asking for one gets the 500 face — heavier than you asked, no smear to give it away, and nothing in CI able to say so. Count the rows above before writing a `font-weight` next to one of these tokens.

  **A weight can be asked for without anyone writing one.** The UA stylesheet bolds `b`, `strong`, `th` and `h1`–`h6`, and `bolder`/`lighter` resolve against whatever is inherited — so grepping for `font-weight:` finds the declarations and misses these entirely. When a rule sets one of these tokens on an element the UA already bolds, or on an ancestor of one, say the weight explicitly.

  Four rules breach this today and are known: `.rls__title` and `.invite-screen__list-name` at 700, `.settings-sheet__block-title` and `.waitlist__success-headline` at 600. All four land on Bree Serif's 400, so all four are drawn with synthetic bold. They are left alone because correcting them decides how much emphasis a heading carries, which is a design question rather than a bug — but do not read them as a precedent, and do not lengthen this list without making that decision. Nothing else breaches it: `--font-serif` is an unused alias of `--font-display`, no descendant of a `--font-written` element asks for a heavier cut, and every `--font-mono` request resolves to a real cut.

Never hard-code a face in a component. Resolve through the tokens in `colorsAndType.css` (`--font-sans`, `--font-display`, `--font-hand`, `--font-written`, `--font-mono`); `--written-scale` is a cap-height correction measured against the specific face `--font-written` names, so swapping that face means re-measuring the number.

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
