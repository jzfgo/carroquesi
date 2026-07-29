# Developer & Agent Guidelines (AGENTS.md)

> `CLAUDE.md`, `GEMINI.md`, `PI.md`, `PILENS.md`, `.cursorrules`, and `.copilotrules` are symlinks to this file. Edit `AGENTS.md` directly.

This file provides guidance to coding agents (such as Antigravity CLI, Claude Code, Codex CLI, OpenCode, Pi Coding Agent, etc.) and developers when working with code in this repository.

## Project Overview

**CarroQueSí** is a collaborative grocery list app where multiple users share lists, mark items as purchased, receive product suggestions from purchase history, and log prices by scanning receipts with Gemini AI.

Two documents hold the durable truth this file does not repeat. Read the relevant one before designing anything: [PRODUCT.md](PRODUCT.md) for who the product serves, what it promises, and the principles that settle a trade-off; [DESIGN.md](DESIGN.md) for the visual system.

## Architecture

- `frontend/`: React + TypeScript (Vite), deployed to Firebase Hosting
- `backend/`: FastAPI + PostgreSQL (Docker), deployed to Cloud Run

- Auth: two paths into `get_current_user` — Google Sign-In via Firebase Auth (frontend sends `Authorization: Bearer <token>`, backend validates with Firebase Admin SDK), and a static `X-Api-Key` header for non-browser clients like Siri Shortcuts ([ADR-006](docs/decisions/006-api-key-auth-for-non-browser-clients.md))

- Data path: all CRUD goes through FastAPI + PostgreSQL (no Firestore)
- Sync: frontend polls `GET /lists/{list_id}/updated-at` every 5s and re-fetches when timestamp changes
- Notifications: Web Push via FCM, sent synchronously on item add and first purchase. This **complements** polling rather than replacing it — polling keeps an *open* app fresh, push reaches a *closed* one. Push is best-effort and unavailable on iOS without a home-screen install, so it can never be relied on as a sync mechanism. See [ADR-010](docs/decisions/010-web-push-via-fcm.md)

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
- `push_tokens`: FCM device tokens per user. **Token presence is the on/off state** — disabling notifications deletes the row, there is no `enabled` column
- `api_keys`: one static per-user key for non-browser clients (Siri Shortcuts); stored hashed, never in plaintext. See [ADR-006](docs/decisions/006-api-key-auth-for-non-browser-clients.md)

Important invariants:

- bump `lists.updated_at` on item writes, member changes, and list rename
- `list_items.purchased_at = NULL` means unpurchased; first purchase sets timestamp
- keep derived `purchased: bool` in API responses for backward compatibility
- invite acceptance is explicit before access is granted
- at most one `list_members.is_default=true` per user; the Siri `"default"` resolver is explicit-only (no most-recently-updated fallback) and 404s when unset. Auto-assigned on a user's first list; never auto-promoted when a default list is deleted. Managed via `backend/app/services/default_list.py`. See [ADR-007](docs/decisions/007-per-user-default-list.md)
- `list_members.last_seen_at` is the push unseen-count watermark. Reset it **only while the list is actually visible** (`POST /lists/{id}/seen`, called from `useListSeen`) — marking a backgrounded tab as seen silently defeats the feature. The count is *derived* from `list_items` at send time, never accumulated, so dropped or duplicate pushes cannot cause drift. See [ADR-010](docs/decisions/010-web-push-via-fcm.md)
- push notifications fire on item creation and on `purchased_at` going `NULL` → set, and on nothing else. Un-purchasing is a correction and must stay silent
- prune a push token only on a **typed** FCM verdict (`UnregisteredError`, `SenderIdMismatchError`), never on an error-message substring — a global misconfiguration would otherwise delete every token in the table

## Frontend

Requires **Node.js v24** (pinned in `frontend/.nvmrc`)

### Commands

Prefer `just` from repo root (`just frontend` lists recipes).

### PWA

PWA uses `vite-plugin-pwa` with `strategies: 'injectManifest'`; the service worker is active in dev (`devOptions.enabled: true`, `type: 'module'`).

The worker is **`frontend/src/sw.ts`** — real source, linted and typechecked via `tsconfig.worker.json` — not a generated artifact. It handles precaching, the backend `NetworkOnly` route, and Web Push (display + tap routing). It carries **no Firebase SDK**: `getToken({serviceWorkerRegistration})` subscribes it to standard Web Push, so data messages arrive as ordinary `push` events. `dist/sw.js` is build output; never edit it.

Anything imported by `sw.ts` must stay DOM-free and WebWorker-safe, and must be listed in `tsconfig.worker.json`'s `include` (currently `sw.ts` and `lib/pushCopy.ts`).

Leave `injectManifest.globPatterns` **unset**. The PWA icons and `manifest.webmanifest` are injected from `manifest.icons` via `includeManifestIcons`, not globbed — setting an explicit pattern triples the precache instead of protecting it. Diff the precache manifest before and after any worker config change; a successful build proves nothing. See [ADR-009](docs/decisions/009-single-service-worker.md).

### Dev auth bypass

Set `DEV_AUTH_BYPASS=true` in `backend/.env` and `VITE_DEV_USER_ID=seed-alice|seed-bob|seed-carol` in `frontend/.env` to bypass Google Sign-In locally. Frontend sends `X-Dev-User-Id` and backend resolves the user from it. Add `X-Dev-Is-Admin: true` to also mark the dev user as admin. **Never enable this in production.**

### Key conventions

- Mobile-first, card-based layout
- Sticky "Smart Input" bar fixed at the bottom of the screen
- Firebase SDK used in the frontend for Auth (Google Sign-In) and AI (Gemini receipt parsing via Firebase AI SDK)
- All data fetched from the FastAPI backend via REST
- Short-poll `GET /lists/{list_id}/updated-at` every 5s; re-fetch items only when timestamp changes
- Item writes go through an **offline queue**, not straight to the API: `useListItems` calls `enqueue()` (`lib/offlineQueue.ts`, IndexedDB store `cqs_offline`) and `useQueueDrain` replays ops on reconnect. Adding a new item mutation means adding a `QueuedOp` type and a drain branch — an API call that bypasses the queue silently loses the write offline
- When mocking modules with partial overrides (e.g. `react-router-dom`), use `importOriginal` to preserve unspecified exports. Plain `vi.mock('module', () => ({...}))` drops everything not listed and throws at runtime.
- Environment constants are centralized in `frontend/src/lib/environment.ts`; import from there instead of accessing `import.meta.env` directly

### E2E Testing (Playwright)

Run with `just frontend test-e2e` (alias: `pnpm test:e2e`). It runs against the **preview build**, not the dev server — changes must be built first.

Visual regression: key screens are checked via `toHaveScreenshot()` (wrapped in the `expectScreenshot` helper in `fixtures.ts`), baselines committed under `frontend/tests/*-snapshots/`. Only `chromium`/`Mobile Chrome` carry baselines. Regenerate with `just frontend update-snapshots`, which runs the container every committed baseline came out of — not a stand-in for CI, which renders on its own runner and is why there is a pixel budget at all. See `frontend/tests/README.md`. Three rules there are easy to breach by accident: the tolerance is an absolute pixel count, never a ratio; anything a screenshot shows must be deterministic — pin the clock before capturing a screen that prints a date; and the suite's timezone is pinned in `playwright.config.ts`, so every committed baseline is Madrid-rendered. Unpinning it or changing the zone hands the render environment back to the machine, which is how a baseline comes to pass while depicting the wrong day. The pin covers the **browser** only — Playwright does not touch the Node runner's `TZ`, and the vitest suite still runs at the machine's zone, so unit tests that touch dates have to be made zone-less themselves.

A screenshot is also a weak guard for a small visual affordance: a real one can cost far less than the tolerance, so the budget lets it vanish silently. When the thing under test *is* a style rule, assert the computed style as well.

The remaining gotchas — ports, dev-auth setup, the `loadEnvFile()` `${VAR}` non-expansion, and the browser matrix — are in `frontend/AGENTS.md`. Read that file directly if your harness does not load nested guidance automatically.

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

All known flags and defaults live in the registry in `backend/app/services/feature_flags.py`; a `user_features.feature` value that isn't a registry key is invalid. Adding, granting, and revoking flags is covered in `backend/AGENTS.md` — read that file directly if your harness does not load nested guidance automatically.

## Infrastructure

- Firebase project config lives in `frontend/src/lib/firebase.ts` (Auth only — no Firestore, no Storage)
- Environment variables go in `.env` files (see `backend/.env.example` and `frontend/.env.example`)
- Cloud Run service URL stored as an env var in the frontend for API calls
- **The app is Postgres-host-agnostic** — the backend's entire contract with the database is `DATABASE_URL`, and no code path assumes a particular provider. Keep it that way: don't introduce host-specific assumptions without an ADR
- The **canonical deployment** (the one the maintainer runs) hosts Postgres on Neon. Its backup policy, RPO/RTO, and restore runbook are in [ADR-008](docs/decisions/008-database-backup-policy.md) — read it before a risky migration or any recovery attempt. If you deployed this yourself elsewhere, the Neon specifics don't apply to you; the decision structure does

## Workflows

### General Workflow

- Check `git status --short` before and after changes
- Implement the smallest complete fix first, then iterate
- **Write comments and docs in plain, short English.** One idea per sentence. Use common words, not rare or figurative ones: the reader is not always a native speaker. A comment says *why*, not *where*: never cite line numbers, file paths, or issue IDs in a code comment. Nothing checks those links, so they go stale on the next move, and the commit message tells the reader more. Docs are the index, so they cite freely. Keep the length in proportion to the decision. Commit and PR titles are exempt; their style is deliberate.
- Start both servers: `just dev` (uses overmind + `Procfile.local`); use `just dev network` to expose on LAN

### Agent Guardrails

Hooks in `.claude/hooks/` and lefthook enforce these regardless of what a session is told. Every denial names its own reason and remedy, so what follows is only what you need *before* the first attempt:

- **Create a worktree before touching any file** — `wt switch --create <branch> --no-cd --format=json`, then `EnterWorktree` with the path it reports. Edits are denied by *target path*, so this holds even when the session is rooted somewhere else, and worktree lifecycle goes through `wt` rather than raw `git worktree`.
- **`--no-verify` and `LEFTHOOK=0` are denied** — fix the failing hook instead of skipping it.
- **A turn does not end on a lint failure** — changed Python and TypeScript are re-checked when Claude Code tries to stop, and the turn is continued to fix them. It forces one continuation, not a loop; lefthook is the backstop at commit time.

Each guard's rationale is in its hook's docstring; the staged-file checks are in `lefthook.yml`.

### CI

All PR checks live in `.github/workflows/ci.yml` and run only for the areas a PR touches. `scripts/ci-changed-areas.sh` classifies the diff; each job gates on its output with `if:`.

Three things about this are load-bearing and easy to break by accident:

- **`CI gate` is the only required status check.** Every other job may be renamed, split, or skipped freely — the ruleset no longer names them. Do not re-add per-job contexts; that is what made renaming a job (to add mypy, say) deadlock every open PR.
- **Never add `paths:` to `ci.yml`.** A workflow skipped by a path filter never posts its checks, so a required context waits for a status that will never arrive and the PR becomes unmergeable. A *job* skipped by `if:` posts success. That asymmetry is the whole design — gate jobs, never the trigger. Playwright may look like a counterexample; it used to carry its own `paths:` list, and was folded in precisely because two encodings of one rule drift apart.
- **The classifier must fail open.** Its output decides which jobs are skipped, and a skipped job reports **success** to a required check — so a crash there does not block a PR, it waves one through with a green checks page and nothing verified. Anything ambiguous resolves to "run everything". `CI gate` (`if: always()`) is the second line of defence.

When changing what a job covers, edit the classifier and add a case to `scripts/test-ci-changed-areas.py` — run both with `just test-tooling`. Both are dependency-free on purpose so they run on a bare checkout; if a test needs a dependency to reach the thing it tests, the thing is in the wrong place.

Playwright is currently **advisory** — it is not in `CI gate`'s `needs`, so a PR can merge with E2E red. Promote it deliberately, not as a side effect of another change.

### Architecture Decision Records

Significant architectural decisions are documented in `docs/decisions/`. Before making a choice that overlaps with an existing ADR (auth strategy, ORM, sync mechanism, AI provider, feature flags), read the relevant record — it explains what was considered and why the current approach was chosen.

When introducing a new significant tradeoff (a new infrastructure dependency, a data model pattern, a sync strategy change), add or update an ADR. Edit in place; git history is the audit trail.

### Git Workflow

- Use squash merge for PRs by default; `main`'s ruleset rules out a merge commit there, so squash or rebase are the only options into it
- **A PR that merges `main` into a long-lived branch is the exception — merge it, don't squash.** The ancestry link is its whole product, and a squash drops it. Repair a squashed one with `git merge -s ours` against **the exact `main` commit that PR brought in, never `origin/main`** — the wrong sha discards content silently. Why, and how to derive that commit: [CONTRIBUTING.md](CONTRIBUTING.md#merging-a-pr-that-brings-main-into-a-long-lived-branch)
- When asked to 'update X', assume this includes committing and pushing unless stated otherwise
- Always check git status for untracked changes before assuming worktree is clean
- For CI: use `pnpm install --frozen-lockfile` for clean installs
- If the current worktree contains unrelated or unexpected changes, stop and ask before proceeding
- **Alembic migrations must be the last step before merging**, after rebasing on main — never create a migration in parallel with another branch that also has one (migration version conflicts require manual resolution and are easy to get wrong)

### Changelog & Release Workflow

- `CHANGELOG.md` is the canonical record of what shipped, generated by `git-cliff` (`cliff.toml`).
- **Never generate on a feature branch.** PRs are squash-merged, so a branch's individual `feat`/`fix` commits stop existing at merge. Generating pre-squash writes entries for commits that are about to collapse, and the next branch to regenerate then *deletes* the extra entries already committed on `main`. Between releases there is simply no `[Unreleased]` section; to see what has landed since the last tag, run `git cliff --unreleased`, which prints to stdout and leaves `CHANGELOG.md` alone (`just changelog` rewrites the file). The release branch is the one exception: it is based on `main` and adds no `feat`/`fix` commits of its own, so `git cliff` sees the same history `main` will.
- The release procedure itself — version bump, changelog regeneration, PR, and post-merge tagging — lives in `.agents/skills/release/SKILL.md`. Invoke `/release` if your harness supports skills, otherwise read that file; either way don't reconstruct the steps by hand.

### Local Dev Environment

- Use direnv (`.envrc` in repo root) for local environment variables — run `direnv allow` after cloning
- Use nvm (respect `.nvmrc`) for Node version management
- Use uv for Python toolchain and virtual environment management
- Backend uses FastAPI with Firebase; ensure `.env` and Firebase config are present before running
- Frontend typecheck must use `tsconfig.app.json` (root tsconfig.json has files:[] and silently passes)
- Never commit a **platform-narrowed** `pnpm-lock.yaml` — one where a native binding resolved for your platform only, so installs break everywhere else. Note this is about *completeness, not presence*: packages like `sharp` and `@rollup/rollup` legitimately ship a full per-platform matrix, and every version bump of them adds new per-platform entries. That is expected and fine. The `lockfile-guard` pre-commit hook enforces exactly this — for each native binding family added, the lockfile must name it for more than one OS

## Bug Investigation

- When user reports a bug, investigate and attempt a concrete fix before declaring scope issues
- Don't silently change URLs, endpoints, or external identifiers (e.g., es.openfoodfacts.org → world.openfoodfacts.org)

## Validation Checklist

- Frontend changes: run lint, relevant tests, and `just frontend typecheck`
- Backend changes: run relevant `just backend test-file {file}` tests (full suite when feasible `just backend test`)
- Before push: verify only intentional files are changed, and that `pnpm-lock.yaml` was not platform-narrowed (a full per-platform matrix from a dependency upgrade is fine; only *your* platform appearing is not)
- Shortcut: `just ci` runs format-check + typecheck + lint + tests (frontend and backend) in one shot
- **Do not run `just changelog` on a feature branch** — it belongs to the release flow on `main`

## Definition of Done

A task is complete only when **all** of the following are true:

- [ ] Worktree confirmed active (not on `main`) before any file was touched
- [ ] Lint and relevant tests pass (`just ci` for full check)
- [ ] Only intentional files changed (no platform-narrowed `pnpm-lock.yaml`)
- [ ] `CHANGELOG.md` untouched — it is generated on `main` at release time. The release PR is the only exception

## Out of Scope

- Submitting prices to Open Prices (requires proof image + OSM location)
