# Developer & Agent Guidelines (AGENTS.md)

> `CLAUDE.md`, `GEMINI.md`, `PI.md`, and `PILENS.md` are symlinks to this file. Edit `AGENTS.md` directly.

This file provides guidance to coding agents (such as Antigravity CLI, Claude Code, Codex CLI, OpenCode, Pi Coding Agent, etc.) and developers when working with code in this repository.

## Project Overview

**CarroQueSí** is a collaborative grocery list app where multiple users share lists, mark items as purchased, receive product suggestions from purchase history, and log prices by scanning receipts with Gemini AI.

## Architecture

- `frontend/`: React + TypeScript (Vite), deployed to Firebase Hosting
- `backend/`: FastAPI + PostgreSQL (Docker), deployed to Cloud Run

- Auth: Google Sign-In via Firebase Auth; frontend sends `Authorization: Bearer <token>`, backend validates with Firebase Admin SDK

- Data path: all CRUD goes through FastAPI + PostgreSQL (no Firestore)
- Sync: frontend polls `GET /lists/{list_id}/updated-at` every 5s and re-fetches when timestamp changes

## Core Data Model

- `users`: user profile and Firebase identity (`firebase_uid`)
- `lists`: list metadata and ownership (`owner_id`)
- `list_members`: list membership links; `is_default` flags the member's default list (the Siri `list_id="default"` target)
- `list_items`: item data, purchase state (`purchased_at`), actual purchased quantity (`purchased_quantity`), and pricing (`price`, `price_per`, `price_store`)
- `list_invites`: opt-in invitations; `id` is the share token
- `barcode_cache`: cached barcode lookup data
- `price_cache`: cached community price data by EAN (amount, price_per, fetched_at); negative-caches misses too
- `receipt_scans`: receipt scan audit log (store, date, total, parsed lines, match results)
- `receipt_name_mappings`: learned receipt→item name mappings per store; improves auto-matching on future scans
- `feedback_submissions`: in-app user feedback (message, email, source, user_agent)
- `waitlist_signups`: early-access waitlist (email, allowed_at, invite_token)
- `user_features`: per-user feature flag overrides; `feature` must match a key in the flag registry in `backend/app/services/feature_flags.py`

Important invariants:

- bump `lists.updated_at` on item writes, member changes, and list rename
- `list_items.purchased_at = NULL` means unpurchased; first purchase sets timestamp
- keep derived `purchased: bool` in API responses for backward compatibility
- invite acceptance is explicit before access is granted
- at most one `list_members.is_default=true` per user; the Siri `"default"` resolver is explicit-only (no most-recently-updated fallback) and 404s when unset. Auto-assigned on a user's first list; never auto-promoted when a default list is deleted. Managed via `backend/app/services/default_list.py`. See [ADR-007](docs/decisions/007-per-user-default-list.md)

## Frontend

Requires **Node.js v24** (pinned in `frontend/.nvmrc`)

### Commands

Prefer `just` from repo root (`just frontend` lists recipes).

### PWA

PWA uses `vite-plugin-pwa`; service worker is active in dev (`devOptions.enabled: true`). `sw.js` is Workbox-generated and should not be edited manually.

### Dev auth bypass

Set `DEV_AUTH_BYPASS=true` in `backend/.env` and `VITE_DEV_USER_ID=seed-alice|seed-bob|seed-carol` in `frontend/.env` to bypass Google Sign-In locally. Frontend sends `X-Dev-User-Id` and backend resolves the user from it. Add `X-Dev-Is-Admin: true` to also mark the dev user as admin. **Never enable this in production.**

### Key conventions

- Mobile-first, card-based layout
- Sticky "Smart Input" bar fixed at the bottom of the screen
- Firebase SDK used in the frontend for Auth (Google Sign-In) and AI (Gemini receipt parsing via Firebase AI SDK)
- All data fetched from the FastAPI backend via REST
- Short-poll `GET /lists/{list_id}/updated-at` every 5s; re-fetch items only when timestamp changes
- When mocking modules with partial overrides (e.g. `react-router-dom`), use `importOriginal` to preserve unspecified exports. Plain `vi.mock('module', () => ({...}))` drops everything not listed and throws at runtime.
- Environment constants are centralized in `frontend/src/lib/environment.ts`; import from there instead of accessing `import.meta.env` directly

### Project layout

`frontend/src/`: `App.tsx`, `main.tsx`, `types.ts`
- `components/` — one file per component (`*.tsx`, `*.css`, `*.test.tsx`)
- `lib/` — pure logic, hooks, API client (`api.ts`), feature flags, receipt AI, parseInput
- `contexts/` — React contexts (`AuthContext`, `FeatureFlagsContext`)

### E2E Testing (Playwright)

Run with `just frontend test-e2e` (alias: `pnpm test:e2e`). Config: `frontend/playwright.config.ts`. Tests live in `frontend/tests/`.

Key gotchas:
- Runs against the **preview build** (`pnpm build && pnpm preview`), not the dev server — changes must be built first
- Default port is `4173`; override with `FRONTEND_PORT_E2E` / `FRONTEND_URL_E2E`
- `DEV_AUTH_BYPASS` is hardcoded to `true` in the config; defaults to `seed-alice`; set `VITE_DEV_USER_ID` to switch users
- Uses `loadEnvFile()` which does **not** expand `${VAR}` syntax — config explicitly overrides `VITE_BACKEND_URL` to work around this
- Browsers: Chromium, Firefox, WebKit, Mobile Chrome (Pixel 10), Mobile Safari (iPhone 17)
- Visual regression: key screens are also checked via `toHaveScreenshot()` (wrapped in the `expectScreenshot` helper in `fixtures.ts`), baselines committed under `frontend/tests/*-snapshots/`. Only `chromium`/`Mobile Chrome` carry baselines. Regenerate with `just frontend update-snapshots` (runs Docker, matching CI's Linux font rendering) — see `frontend/tests/README.md` for why and how.

### SmartInputBar sigil system

`parseInput.ts` → `ParsedInput`. Sigils: `+qty`, `#brand`, `@store` (multiple allowed), `|EAN` (8/13 digits). Values with spaces need quotes: `#"El Corte Inglés"`, `@'Carrefour Express'`.

### Receipt scanning

Four-step flow: client parse (`receiptAi.ts` via Gemini) → backend fuzzy match (`receipt_matcher.py`) → user review (`ReceiptScanSheet`) → apply prices. `VITE_RECAPTCHA_SITE_KEY` required in production for Firebase App Check (reCAPTCHA v3).

### Purchased item rules

Purchased items are mostly read-only (rename/qty/brand/store edits disabled). Price deletion has a **same-day guard**: enforced in both `LogPurchaseSheet` (frontend) and `DELETE /lists/{id}/items/{item_id}/prices` (returns 422 for prior-day purchases).

## Backend

Requires **Python 3.13** (pinned in `backend/.python-version`).

### Commands

Prefer `just` from repo root (`just backend` lists recipes).

### Key conventions

- FastAPI app entrypoint: `backend/app/main.py`
- ORM: **SQLModel** (canonical FastAPI approach). Migrations via **Alembic**.
- Settings via `pydantic_settings` in `backend/app/core/config.py`, loaded from `backend/.env`
- Firebase Admin SDK init in `backend/app/core/firebase.py` — singleton pattern
- Auth dependency in `backend/app/dependencies.py`: `get_current_user`, `require_member`, `require_owner`, `require_admin`
- `is_admin` is a transient Python attribute on `User`, read from Firebase JWT custom claim `decoded.get("is_admin", False)` — never stored in the DB
- Schemas (request/response Pydantic models) in `backend/app/schemas/`
- Tests use SQLite in-memory (via `StaticPool`) — no Postgres needed to run the test suite
- Dockerized: `backend/Dockerfile` → deployed to Cloud Run; runs `alembic upgrade head` on startup

### Feature Flag Management

- **Registry** — all known flags and defaults live in `backend/app/services/feature_flags.py`. Adding a flag = one `FlagDef` entry in `REGISTRY`.
- **Adding a new flag**: add `FlagDef` to `REGISTRY` + add constant to `frontend/src/lib/featureFlags.ts` + seed test data in `scripts/seed.py` + add tests + gate the endpoint/UI
- **Granting/revoking**: `just backend feature <firebase_uid> <flag> on|off|reset`
- **Setting admin**: `just backend set-admin <firebase_uid>` — sets Firebase custom claim; user must refresh their token (up to 1 hour wait, or force-refresh in the app)

### Project layout

`backend/app/`: `main.py`, `core/` (config, firebase, http), `db/` (session, models), `routers/` (one per resource), `schemas/`, `services/` (community_price, receipt_matcher, feature_flags), `dependencies.py`. Migrations in `alembic/`.

## Infrastructure

- Firebase project config lives in `frontend/src/lib/firebase.ts` (Auth only — no Firestore, no Storage)
- Environment variables go in `.env` files (see `backend/.env.example` and `frontend/.env.example`)
- Cloud Run service URL stored as an env var in the frontend for API calls

## Workflows

### General Workflow

- Check `git status --short` before and after changes
- Implement the smallest complete fix first, then iterate
- Start both servers: `just dev` (uses overmind + `Procfile.local`); use `just dev network` to expose on LAN

### Agent Guardrails

The following constraints are enforced by Claude Code hooks (`.claude/hooks/`), Claude Code permission rules (`.claude/settings.json`), and by lefthook git hooks. They apply regardless of instructions given in a session:

- **No `--no-verify` / `LEFTHOOK=0`** — bypassing the lefthook gates is denied at the `PreToolUse` level. Fix the failing hook instead.
- **No edits on `main`** — any `Edit` or `Write` whose **target path** resolves to a checkout on `main` is denied. Run `/worktrunk` first; no exceptions. The check is per-path, not per-session, so writing into a worktree by absolute path works even when the session itself is rooted on `main` — which is the normal case here, since `EnterWorktree` is denied and nothing else can re-root a session.
- **Worktree lifecycle belongs to worktrunk** — creating or removing a worktree any other way skips this project's `wt` hooks (direnv, deps, migrate, seed) and produces a worktree with no `.env`, no `node_modules`, and an unmigrated DB. So `EnterWorktree` without a `path`, `ExitWorktree` with `action: "remove"`, and `git worktree add|remove|prune|move` are all denied. **Navigation is not** — `EnterWorktree({path})` into an existing worktree and `ExitWorktree({action: "keep"})` are allowed, since they touch no git state. The flow is `wt switch --create <branch> --no-cd --format=json`, then `EnterWorktree` with the `path` it reports.
- **Auto-lint on stop** — after each turn, changed Python files are checked with `ruff` and changed TypeScript files with `eslint`. If either fails, Claude Code continues the turn to fix the issue before stopping.

Lefthook pre-commit hooks run on staged files: `ruff check --fix` + `ruff format` (Python), `eslint --fix` (TypeScript/TSX), `stylelint --fix` (CSS), a platform-native-binding guard on `pnpm-lock.yaml`, and `gitleaks` secret scanning (skipped gracefully if not installed). The `pre-push` hook checks that `CHANGELOG.md` is current.

### Architecture Decision Records

Significant architectural decisions are documented in `docs/decisions/`. Before making a choice that overlaps with an existing ADR (auth strategy, ORM, sync mechanism, AI provider, feature flags), read the relevant record — it explains what was considered and why the current approach was chosen.

When introducing a new significant tradeoff (a new infrastructure dependency, a data model pattern, a sync strategy change), add or update an ADR. Edit in place; git history is the audit trail.

### Git Workflow

- Use squash merge for PRs by default
- When asked to 'update X', assume this includes committing and pushing unless stated otherwise
- Always check git status for untracked changes before assuming worktree is clean
- For CI: use `pnpm install --frozen-lockfile` for clean installs
- If the current worktree contains unrelated or unexpected changes, stop and ask before proceeding
- **Alembic migrations must be the last step before merging**, after rebasing on main — never create a migration in parallel with another branch that also has one (migration version conflicts require manual resolution and are easy to get wrong)

### Changelog & Release Workflow

- `CHANGELOG.md` is the canonical record of what shipped.
- `cliff.toml` drives automated generation via `git-cliff`. Commit types map as: `feat` → Added, `fix` → Fixed, `refactor/perf` → Changed; `chore/docs/test/ci` are excluded.
- A lefthook `pre-push` hook (`scripts/check-changelog.sh`) aborts if `CHANGELOG.md` is out of date and prompts you to run `just changelog`, commit, and push again. Activate with `just setup` after cloning (requires `lefthook`: `brew install lefthook` and `git-cliff`: `brew install git-cliff`).
- Before a release:
  1. Run `just changelog` — prepends new commits to `CHANGELOG.md` under `## [Unreleased]`
  2. Rename `## [Unreleased]` to the new version + date (e.g. `## [0.11.0] — 2026-05-01`)
  3. Commit and tag: `git tag vX.Y.Z`

### Local Dev Environment

- Use direnv (`.envrc` in repo root) for local environment variables — run `direnv allow` after cloning
- Use nvm (respect `.nvmrc`) for Node version management
- Use uv for Python toolchain and virtual environment management
- Backend uses FastAPI with Firebase; ensure `.env` and Firebase config are present before running
- Frontend typecheck must use `tsconfig.app.json` (root tsconfig.json has files:[] and silently passes)
- Never commit platform-specific (darwin/linux) native bindings to `pnpm-lock.yaml`

## Bug Investigation

- When user reports a bug, investigate and attempt a concrete fix before declaring scope issues
- Limit exploration to ~3-5 file reads before either fixing or asking a targeted question
- Don't silently change URLs, endpoints, or external identifiers (e.g., es.openfoodfacts.org → world.openfoodfacts.org)

## Validation Checklist

- Frontend changes: run lint, relevant tests, and `just frontend typecheck`
- Backend changes: run relevant `just backend test-file {file}` tests (full suite when feasible `just backend test`)
- Before push: verify only intentional files are changed and no platform-specific native binding churn was introduced in `pnpm-lock.yaml`
- Shortcut: `just ci` runs format-check + typecheck + lint + tests (frontend and backend) in one shot
- **CHANGELOG.md** — run `just changelog` and commit the result before pushing. This is blocking, not optional cleanup.

## Definition of Done

A task is complete only when **all** of the following are true:

- [ ] Worktree confirmed active (not on `main`) before any file was touched
- [ ] Lint and relevant tests pass (`just ci` for full check)
- [ ] `CHANGELOG.md` updated — `just changelog` run and result committed
- [ ] Only intentional files changed (no platform-specific `pnpm-lock.yaml` churn)

## Out of Scope

- Submitting prices to Open Prices (requires proof image + OSM location)

## Open Action Items (1:1 — 2026-07-22)

**AI:**

- [ ] In every `/brainstorming` session, add an explicit **failure-space section** before converging — how the proposal breaks with multiple users, with state changing between calls, with zero items, with many. Its own named section, not woven into prose. _(from #111's non-deterministic default-list resolver, which #113 had to replace)_
- [ ] Take positions in design discussions, not neutral considerations — "this is wrong because X", not "one consideration might be". The user has explicitly asked for more pushback.
- [ ] For refactors touching environment-conditional logic (dev/prod branches, feature flags, config gating), explicitly verify both branches' behavior before calling the change done — not just tests/lint _(carried from #94; still no real test case)_
- [ ] Flag mobile-path issues (input type, viewport, safe area) during implementation, not just at handoff

**You:**

- [ ] Drop MCP from tracked goals unless the target-audience assumption changes — MCP clients are a developer audience, which fails the "regular users, transparent and seamless" bar _(agent loops research is separate and stays: a professional-capability goal, not a product bet)_
- [ ] Push Siri Shortcuts further toward the writeup — the remaining setup friction is the material
- [ ] Bring a Document AI vs. Gemini comparison into the next receipt scanning `/brainstorming` session

> When you notice context in a session that relates to one of these items, surface it proactively — don't wait for the next 1:1. Mark items complete or remove them when done.
