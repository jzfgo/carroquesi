# Frontend Guidelines

> `CLAUDE.md` is a symlink to this file. Edit `AGENTS.md` directly.
> Repo-wide guidance lives in the root `AGENTS.md`, which every harness loads.
> This file is loaded automatically only by harnesses that discover nested
> guidance (Claude Code). The root file points here by path, so harnesses that
> read a single instructions file — OpenCode and Codex pin `AGENTS.md` — should
> open it directly when working on the frontend.

## E2E Testing (Playwright)

Run with `just frontend test-e2e` (alias: `pnpm test:e2e`). Config: `frontend/playwright.config.ts`. Tests live in `frontend/tests/`.

Key gotchas:

- Runs against the **preview build** (`pnpm build && pnpm preview`), not the dev server — changes must be built first
- Default port is `4173`; override with `FRONTEND_PORT_E2E` / `FRONTEND_URL_E2E`
- The config does **not** set `DEV_AUTH_BYPASS` — that lives in `backend/.env` and has to be on for the run to authenticate. What the config does hardcode is `VITE_DEV_USER_ID` (default `seed-alice`; override it to switch users) and `VITE_BACKEND_URL`
- Uses `loadEnvFile()` which does **not** expand `${VAR}` syntax — config explicitly overrides `VITE_BACKEND_URL` to work around this
- Browsers: Chromium, Firefox, WebKit, Mobile Chrome (Pixel 10), Mobile Safari (iPhone 17)

Visual-regression baselines and how to regenerate them are in the root `AGENTS.md` — the regenerate command is run from the repo root, so that guidance must stay always-loaded.
