# Developer & Agent Guidelines (AGENTS.md)

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
- `list_members`: list membership links
- `list_items`: item data, purchase state (`purchased_at`), actual purchased quantity (`purchased_quantity`), and pricing (`price`, `price_per`, `price_store`)
- `list_invites`: opt-in invitations; `id` is the share token
- `barcode_cache`: cached barcode lookup data
- `receipt_scans`: receipt scan audit log (store, date, total, parsed lines, match results)
- `receipt_name_mappings`: learned receipt→item name mappings per store; improves auto-matching on future scans

Important invariants:

- bump `lists.updated_at` on item writes, member changes, and list rename
- `list_items.purchased_at = NULL` means unpurchased; first purchase sets timestamp
- keep derived `purchased: bool` in API responses for backward compatibility
- invite acceptance is explicit before access is granted

## Frontend

### Commands

Prefer `just` from repo root (`just` lists recipes). Direct `npm` commands when needed:

```bash
cd frontend
npm install
npm run dev
npm run build
npm run preview
npm run test
npm run test -- path/to/file.test.tsx  # run a single test file
npm run lint
# root tsconfig has files:[]; use this for real frontend typecheck:
node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

### PWA

PWA uses `vite-plugin-pwa`; service worker is active in dev (`devOptions.enabled: true`). `sw.js` is Workbox-generated and should not be edited manually.

### Dev auth bypass

Set `DEV_AUTH_BYPASS=true` in `backend/.env` and `VITE_DEV_USER_ID=seed-alice|seed-bob|seed-carol` in `frontend/.env` to bypass Google Sign-In locally. Frontend sends `X-Dev-User-Id` and backend resolves the user from it. **Never enable this in production.**

### Key conventions

- Mobile-first, card-based layout
- Sticky "Smart Input" bar fixed at the bottom of the screen
- Firebase SDK used in the frontend for Auth (Google Sign-In) and AI (Gemini receipt parsing via Firebase AI SDK)
- All data fetched from the FastAPI backend via REST
- Short-poll `GET /lists/{list_id}/updated-at` every 5s; re-fetch items only when timestamp changes
### SmartInputBar sigil system

`parseInput.ts` → `ParsedInput`. Sigils: `+qty`, `#brand`, `@store` (multiple allowed), `|EAN` (8/13 digits). Values with spaces need quotes: `#"El Corte Inglés"`, `@'Carrefour Express'`.

### Receipt scanning

Four-step flow: client parse (`receiptAi.ts` via Gemini) → backend fuzzy match (`receipt_matcher.py`) → user review (`ReceiptScanSheet`) → apply prices. `VITE_RECAPTCHA_SITE_KEY` required in production for Firebase App Check (reCAPTCHA v3).

### Purchased item rules

Purchased items are mostly read-only (rename/qty/brand/store edits disabled). Price deletion has a **same-day guard**: enforced in both `LogPurchaseSheet` (frontend) and `DELETE /lists/{id}/items/{item_id}/prices` (returns 422 for prior-day purchases).

### Testing conventions

When mocking modules with partial overrides (e.g. `react-router-dom`), use `importOriginal` to preserve unspecified exports. Plain `vi.mock('module', () => ({...}))` drops everything not listed and throws at runtime.

## Backend

Requires **Python 3.13** (pinned in `backend/.python-version`).

### Commands

Prefer `just` from repo root (`just` lists recipes). Direct `uv` commands when needed:

```bash
cd backend
uv sync                              # install / sync dependencies
uv run fastapi dev --host 0.0.0.0 --port 8000 # dev server
uv run pytest                        # run all tests
uv run pytest tests/path/to/test.py  # run single test file
uv add <package>                     # add a dependency
uv run alembic upgrade head          # run migrations
uv run alembic revision --autogenerate -m "description"  # generate migration
uv run python scripts/seed.py        # seed local DB with test data (or: just seed)
```

### Key conventions

- FastAPI app entrypoint: `backend/app/main.py`
- ORM: **SQLModel** (canonical FastAPI approach). Migrations via **Alembic**.
- Settings via `pydantic_settings` in `backend/app/core/config.py`, loaded from `backend/.env`
- Firebase Admin SDK init in `backend/app/core/firebase.py` — singleton pattern
- Auth dependency in `backend/app/dependencies.py`: `get_current_user`, `require_member`, `require_owner`
- Schemas (request/response Pydantic models) in `backend/app/schemas/`
- Tests use SQLite in-memory (via `StaticPool`) — no Postgres needed to run the test suite
- Dockerized: `backend/Dockerfile` → deployed to Cloud Run; runs `alembic upgrade head` on startup

### Project layout

`backend/app/`: `main.py`, `core/` (config, firebase, http), `db/` (session, models), `routers/` (one per resource), `schemas/`, `services/` (community_price, receipt_matcher), `dependencies.py`. Migrations in `alembic/`.

### Environment variables

See `backend/.env.example` and `frontend/.env.example`.

## Infrastructure

- Firebase project config lives in `frontend/src/lib/firebase.ts` (Auth only — no Firestore, no Storage)
- Environment variables go in `.env` files — never committed
- Cloud Run service URL stored as an env var in the frontend for API calls

## Workflows

### General Workflow

> **HARD STOP — before touching any file:** confirm a worktree is active (not `main`). If on `main`, run `/worktrunk` first. No exceptions — not for "quick fixes", not for docs, not for config.

- Check `git status --short` before and after changes
- Implement the smallest complete fix first, then iterate

### Git Workflow

- Use squash merge for PRs by default
- When asked to 'update X', assume this includes committing and pushing unless stated otherwise
- Always check git status for untracked changes before assuming worktree is clean
- For CI: use `npm ci` for clean installs
- If the current worktree contains unrelated or unexpected changes, stop and ask before proceeding
- **Alembic migrations must be the last step before merging**, after rebasing on main — never create a migration in parallel with another branch that also has one (migration version conflicts require manual resolution and are easy to get wrong)

### Changelog & Release Workflow

- `CHANGELOG.md` is the canonical record of what shipped.
- `TODO.md` tracks only open work items — remove entries when they ship.
- `cliff.toml` drives automated generation via `git-cliff`. Commit types map as: `feat` → Added, `fix` → Fixed, `refactor/perf` → Changed; `chore/docs/test/ci` are excluded.
- A `pre-push` git hook (`hooks/pre-push`) aborts if `CHANGELOG.md` is out of date and prompts you to run `just changelog`, commit, and push again. Activate with `just setup` after cloning (requires `git-cliff`: `brew install git-cliff`).
- Before a release:
  1. Run `just changelog` — prepends new commits to `CHANGELOG.md` under `## [Unreleased]`
  2. Rename `## [Unreleased]` to the new version + date (e.g. `## [0.11.0] — 2026-05-01`)
  3. Commit and tag: `git tag vX.Y.Z`

### Local Dev Environment

- Use nvm (respect `.nvmrc`) for Node version management
- Use uv for Python toolchain and virtual environment management
- Backend uses FastAPI with Firebase; ensure `.env` and Firebase config are present before running
- Frontend typecheck must use `tsconfig.app.json` (root tsconfig.json has files:[] and silently passes)
- Never commit platform-specific (darwin/linux) native bindings to `package-lock.json`

## Bug Investigation

- When user reports a bug, investigate and attempt a concrete fix before declaring scope issues
- Limit exploration to ~3-5 file reads before either fixing or asking a targeted question
- Don't silently change URLs, endpoints, or external identifiers (e.g., es.openfoodfacts.org → world.openfoodfacts.org)

## Validation Checklist

- Frontend changes: run lint, relevant tests, and `just frontend typecheck`
- Backend changes: run relevant `just backend test-file {file}` tests (full suite when feasible `just backend test`)
- Before push: verify only intentional files are changed and no platform-specific native binding churn was introduced in `package-lock.json`
- Shortcut: `just ci` runs frontend typecheck + lint + backend tests in one shot
- **TODO.md** — remove any items that shipped in this task. This is blocking, not optional cleanup.
- **CHANGELOG.md** — run `just changelog` and commit the result before pushing. This is blocking, not optional cleanup.

## Definition of Done

A task is complete only when **all** of the following are true:

- [ ] Worktree confirmed active (not on `main`) before any file was touched
- [ ] Lint and relevant tests pass (`just ci` for full check)
- [ ] `TODO.md` updated — any shipped items removed
- [ ] `CHANGELOG.md` updated — `just changelog` run and result committed
- [ ] Only intentional files changed (no platform-specific `package-lock.json` churn)

## Out of Scope

- Submitting prices to Open Prices (requires proof image + OSM location)

## Open Action Items (1:1 — 2026-06-01)

> When you notice context in a session that relates to one of these items, surface it proactively — don't wait for the next 1:1. Mark items complete or remove them when done.
