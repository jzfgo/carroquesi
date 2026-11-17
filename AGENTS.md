# Developer & Agent Guidelines (AGENTS.md)

This file provides guidance to Claude Code and developers when working with code in this repository. Claude Code loads it, and the nested `frontend/AGENTS.md` and `backend/AGENTS.md`, natively; the repo has no `CLAUDE.md`.

## Project Overview

**CarroQueSí** is a collaborative grocery list app where multiple users share lists, mark items as purchased, receive product suggestions from purchase history, and log prices by scanning receipts with Gemini AI. Purchases settle onto **trips** (tickets), which stack under the list as the household's spending record, each optionally carrying its stored receipt file.

Two documents hold the durable truth this file does not repeat. Read the relevant one before designing anything: [PRODUCT.md](PRODUCT.md) for who the product serves, what it promises, and the principles that settle a trade-off; [DESIGN.md](DESIGN.md) for the visual system.

For the redesign's visuals, the **approved Claude Design handoff in [docs/design/handoff/](docs/design/handoff/) is canonical** — the frame ids cited throughout this file (13a, 21b, 30a, …) live in its `CarroQueSí - Handoff (aprobados).dc.html`. DESIGN.md is a summary derived from the handoff; when the two disagree, the handoff wins. See the directory's README for contents and provenance.

## Architecture

- `frontend/`: React + TypeScript (Vite), deployed to Firebase Hosting
- `backend/`: FastAPI + PostgreSQL (Docker), deployed to Cloud Run

- Auth: two paths into `get_current_user` — Google Sign-In via Firebase Auth (frontend sends `Authorization: Bearer <token>`, backend validates with Firebase Admin SDK), and a static `X-Api-Key` header for non-browser clients like Siri Shortcuts ([ADR-006](docs/decisions/006-api-key-auth-for-non-browser-clients.md))

- Data path: all CRUD goes through FastAPI + PostgreSQL (no Firestore)
- Sync: frontend polls `GET /lists/{list_id}/updated-at` every 5s and re-fetches when timestamp changes
- Notifications: Web Push via FCM, sent synchronously on item add and first purchase. This **complements** polling rather than replacing it — polling keeps an _open_ app fresh, push reaches a _closed_ one. Push is best-effort and unavailable on iOS without a home-screen install, so it can never be relied on as a sync mechanism. See [ADR-010](docs/decisions/010-web-push-via-fcm.md)

## Core Data Model

- `users`: user profile, Firebase identity (`firebase_uid`), and receipt-scanning consent (`receipt_consent`: NULL = never asked, else "granted"/"declined"; both receipt endpoints require "granted" on top of the `ai_receipt_scanning` flag, answering 403 `receipt_consent_required`), and the IANA `timezone` the browser last declared (`X-Client-Timezone`, stored on auth when it changes; scheduled jobs cut the owner's calendar with it)
- `lists`: list metadata and ownership (`owner_id`)
- `list_members`: list membership links; `is_default` flags the member's default list (the Siri `list_id="default"` target)
- `list_items`: item data, purchase state (`purchased_at`), actual purchased quantity (`purchased_quantity`), pricing (`price`, `price_per`, `price_store`; `price_reduced` and `price_before` for a reduced label's price, which the backend keeps out of `cheaper_elsewhere`), the line's pack format (`pack_count`, `pack_content`, `pack_content_unit`: 6 × 1,5 L; per line, since formats change between purchases), and the trip it was bought on (`purchase_id`, nullable). Name + brand name the product (the price history groups by them); the EAN names one format, so changing the format by hand clears it. A format typed in the name («Agua 6x1,5L») moves to the format on every save that creates or renames a line (`services/pack_from_name.py`). A receipt line that prints one («AGUA 6X1,5L») fills a line with no format on the receipt apply. A new line with an EAN takes the format of the list's last line with that EAN, or else the package size Open Food Facts gives for it. `pack_source` records where a format came from: a typed one is never replaced, a name typed later replaces a guess (a format copied from another line, by EAN or by re-buy, is a guess too, even one typed there), and a receipt or Open Food Facts fills only an empty format. See [ADR-019](docs/decisions/019-product-and-format-keys.md)
- `purchases`: shopping trips, declared at reconciliation — `tears_off_at` is the stamped local-midnight boundary, `closed_at` NULL means still open (or never written down, on backfilled rows), `total` is a confirmed figure never summed from lines; at most one open trip per `(list_id, tears_off_at)` via partial unique index. See [ADR-014](docs/decisions/014-purchase-entity-and-trip-boundary.md)
- `list_invites`: opt-in invitations; `id` is the share token
- `barcode_cache`: cached Open Food Facts lookups by EAN: name, brand, stores and the package size (`quantity`, «6 x 33 cl»)
- `receipt_scans`: receipt scan audit log (store, date, total, parsed lines, match results), plus where the original file sits in the bucket when one was uploaded (`file_path`/`file_content_type`/`file_pages`, recorded when the upload URL is minted — the backend never sees the bytes)
- `receipt_name_mappings`: learned receipt→item name mappings per store; improves auto-matching on future scans
- `chain_article_mappings`: per list, a chain's in-store label article code → the item name and brand it was saved as. Written when a close or receipt apply line carries `article`; `chain` is the chain's store key. List-scoped, unlike `receipt_name_mappings`, because the names are one household's own
- `list_stores`: per-list store registry — `store_key` → canonical `display_name`, renameable by members. See [ADR-013](docs/decisions/013-store-registry.md)
- `feedback_submissions`: in-app user feedback (message, email, source, user_agent)
- `waitlist_signups`: early-access waitlist (email, allowed_at, invite_token)
- `report_opt_outs`: owners who stopped the monthly report for one list. Row presence is the opt-out; keyed by `(user_id, list_id)`, so a new owner after a transfer still gets the report
- `report_runs`: the monthly spend report's send ledger, unique on `(list_id, period)` so a repeated trigger never sends twice. Only `failed` is retried; a `running` row may already have sent, so it is reported as stuck instead. See [ADR-018](docs/decisions/018-scheduled-jobs-via-a-token-guarded-endpoint.md)
- `user_features`: per-user feature flag overrides; `feature` must match a key in the flag registry in `backend/app/services/feature_flags.py`
- `user_list_prefs`: per-user, per-list presentation preferences — currently the **board**, the paper backdrop a member sees behind a list. Personal, never shared: identity (name, emoji) belongs to the list, orientation belongs to the member, which is why this is its own table and not a `list_members` column. Assigned lazily on first single-list read, walking the palette in `backend/app/services/list_board.py` before repeating; writes never bump `lists.updated_at`
- `push_tokens`: FCM device tokens per user. **Token presence is the on/off state** — disabling notifications deletes the row, there is no `enabled` column
- `api_keys`: one static per-user key for non-browser clients (Siri Shortcuts); stored hashed, never in plaintext. See [ADR-006](docs/decisions/006-api-key-auth-for-non-browser-clients.md)

Important invariants:

- bump `lists.updated_at` on item writes, member changes, and list rename
- `list_items.purchased_at = NULL` means unpurchased; first purchase sets timestamp
- an unreconciled trip (`closed_at` NULL) goes with its last item: every path that takes an item out of a trip (un-purchase, delete) calls `trips.prune_if_empty`, or the empty trip tears off into a line-less purchase in the history. A closed trip is a record and stays, empty or not
- keep derived `purchased: bool` in API responses for backward compatibility
- invite acceptance is explicit before access is granted
- at most one `list_members.is_default=true` per user; the Siri `"default"` resolver is explicit-only (no most-recently-updated fallback) and 404s when unset. Auto-assigned on a user's first list; never auto-promoted when a default list is deleted. Managed via `backend/app/services/default_list.py`. See [ADR-007](docs/decisions/007-per-user-default-list.md)
- `list_members.last_seen_at` is the push unseen-count watermark. Reset it **only while the list is actually visible** (`POST /lists/{id}/seen`, called from `useListSeen`) — marking a backgrounded tab as seen silently defeats the feature. The count is _derived_ from `list_items` at send time, never accumulated, so dropped or duplicate pushes cannot cause drift. See [ADR-010](docs/decisions/010-web-push-via-fcm.md)
- push notifications fire on item creation, on `purchased_at` going `NULL` → set, and on ownership transfer (`PUT /lists/{list_id}/owner`: `ownership_transferred` to the new owner, `owner_changed` to the other remaining members), and on nothing else. Un-purchasing is a correction and must stay silent
- the list owner cannot leave their own list: owner self-leave answers 409 "Transfer ownership before leaving" — transfer first (owner-only; target must be a current member), then leave normally. Transfer moves only `lists.owner_id`; memberships and default-list flags stay untouched
- prune a push token only on a **typed** FCM verdict (`UnregisteredError`, `SenderIdMismatchError`), never on an error-message substring — a global misconfiguration would otherwise delete every token in the table

## Frontend

Requires **Node.js v24** (pinned in `frontend/.nvmrc`). pnpm needs no install: the `just` recipes run `corepack pnpm`, and Corepack (bundled with Node 24) fetches the version `packageManager` pins in `frontend/package.json`. A package.json script must not call `pnpm` itself — a machine without a global pnpm has none on PATH — so nested scripts use `npm run`

### Commands

Prefer `just` from repo root (`just frontend` lists recipes).

### Dev auth bypass

Set `DEV_AUTH_BYPASS=true` in `backend/.env` and `VITE_DEV_USER_ID=seed-alice|seed-bob|seed-carol` in `frontend/.env` to bypass Google Sign-In locally. Frontend sends `X-Dev-User-Id` and backend resolves the user from it. Add `X-Dev-Is-Admin: true` to also mark the dev user as admin. **Never enable this in production.**

### Key conventions

Frontend-only conventions (item row, sheets, offline, reconcile, stack, theme, test mocks, module-graph contracts) live in `frontend/AGENTS.md`, which loads when working under `frontend/`.

- API types are generated, not written: the aliases in `frontend/src/types.ts` re-export `src/apiSchema.generated.ts`, which `openapi-typescript` derives from `backend/openapi.json` (regenerate both with `just openapi`). Never edit the generated file or the snapshot by hand. A backend schema change is a three-commit-in-one: the schema, the regenerated snapshot, the regenerated types — a backend test fails when the snapshot is stale, and `pnpm openapi:check` (runs inside `pnpm lint`) fails when the types are. Frontend-only types (`ParsedInput`, `Member`, …) stay hand-written in `types.ts` below the aliases

### E2E Testing (Playwright)

Run with `just frontend test-e2e` (alias: `corepack pnpm test:e2e`). It runs against the **preview build**, not the dev server — changes must be built first.

Visual regression: key screens are checked via `toHaveScreenshot()` (wrapped in the `expectScreenshot` helper in `fixtures.ts`), baselines committed under `frontend/tests/*-snapshots/`. Only `chromium`/`Mobile Chrome` carry baselines. Regenerate with `just frontend update-snapshots`, which runs the container every committed baseline came out of — not a stand-in for CI, which renders on its own runner and is why there is a pixel budget at all. See `frontend/tests/README.md`. Three rules there are easy to breach by accident: the tolerance is an absolute pixel count, never a ratio; anything a screenshot shows must be deterministic — pin the clock before capturing a screen that prints a date; and the suite's timezone is pinned in `playwright.config.ts`, so every committed baseline is Madrid-rendered. Unpinning it or changing the zone hands the render environment back to the machine, which is how a baseline comes to pass while depicting the wrong day. The pin covers the **browser** only — Playwright does not touch the Node runner's `TZ`, and the vitest suite still runs at the machine's zone, so unit tests that touch dates have to be made zone-less themselves.

A screenshot is also a weak guard for a small visual affordance: a real one can cost far less than the tolerance, so the budget lets it vanish silently. When the thing under test _is_ a style rule, assert the computed style as well.

The remaining gotchas — ports, dev-auth setup, the `loadEnvFile()` `${VAR}` non-expansion, and the browser matrix — are in `frontend/AGENTS.md`.

### Store names

Store names are free text from four sources and no two people spell a shop the same way, so **comparisons go through a deterministic key and display goes through the per-list registry** ([ADR-013](docs/decisions/013-store-registry.md)). The key collapses spelling variants only (case, accents, whitespace, punctuation) — vocabulary variants like `BM` vs `BM Supermercados` stay apart on purpose, and fuzzy matching was measured and rejected (a wrong merge silently fuses price histories). Two implementations, one rule: `backend/app/services/store_key.py` and `frontend/src/lib/storeKey.ts`, pinned to the shared vector file `storeKeyVectors.json` that both suites assert — change one only through that file. `receipt_name_mappings` stores key-normalised `store` and `normalise()`d `receipt_name` (they are pure lookup keys, never displayed). Item rows keep the raw typed strings; rendering resolves them via `displayStore` (from `useListItems`), falling back to the raw string for unregistered keys. Any backend write that introduces a store string must call `ensure_stores` (`app/services/store_registry.py`); any new store comparison must use the key; never persist a resolved display name back onto an item.

### Chain profiles

Everything specific to one supermarket chain lives in `backend/app/chains/`, one folder per chain ([ADR-017](docs/decisions/017-chain-profiles-in-the-backend.md)): its store keys, own brands, and in-store label decoders, each decoder pinned to the chain's `vectors.json`. The frontend holds no chain logic. It reads the own-brand table from `GET /chains`, and until that answers, from `frontend/src/lib/chains.generated.json` — generated by `just backend chains-snapshot`, never edited by hand, and deliberately not checked for freshness. What the camera read goes to `GET /chains/labels?code=`: a barcode's digits, or a QR label's GS1 Digital Link, which the frontend passes through unread (Mercadona's «Bajada de precio» sticker carries only a QR; its printed digits have no barcode). The digits-only `GET /chains/labels/{digits}` stays for older clients. With a `store` hint of a known chain only that chain decodes and its refusal is final; with no hint, or a store no chain claims, exactly one chain must accept. The frontend reads `reads_label_weight` to offer the dashed «Peso» chip (`lib/weighedLabel.showsWeightChip`); the scan itself is `LabelScanFlow`, one step shared by the receipt line detail (13b) and the close editor (10d). With a receipt a used label keeps the paper's amount and adds the weight and €/kg; without one it sets the amount. Either way the save sends the label's `article`. A chain's grouping of store keys never merges price histories or display names (ADR-013).

### Receipt scanning

Four-step flow: client parse (`receiptAi.ts` via Gemini) → backend fuzzy match (`receipt_matcher.py`) → user review (`ReceiptScanSheet`) → apply, which **closes a trip**. The full contract — match pool and targeted attach, the review/illegible/consent sheets, stored receipt files — lives in the `receipt-scanning` skill ([.agents/skills/receipt-scanning/SKILL.md](.agents/skills/receipt-scanning/SKILL.md)), which Claude Code loads automatically when working on receipt files (through its `.claude/rules/` symlink); read it before touching any part of the scan flow. `VITE_RECAPTCHA_SITE_KEY` required in production for Firebase App Check (reCAPTCHA v3).

### Purchased item rules

Purchased items are mostly read-only (rename/qty/brand/store edits disabled). The pack format is the exception: it is an attribute of the line, not of its price, so the ficha's «Formato» row stays editable on a closed purchase, and a format-only PATCH never stamps `updated_at`. Whether a purchase can still be corrected is the **trip-open rule** ([ADR-014](docs/decisions/014-purchase-entity-and-trip-boundary.md)): an item's trip stops taking changes at `closed_at ?? tears_off_at`, exposed to clients as `ItemRead.purchase_ends_at` and answered by `app/services/trips.is_open` on the backend and `lib/isTripOpen.ts` on the frontend. The mirror treats a missing `purchase_ends_at` as open — an optimistic write has no trip yet, and the server has the last word — while the backend treats a purchased item with a NULL or dangling `purchase_id` as **closed** (refusing an edit is recoverable; reopening spend nobody can date is not). The viewer's timezone (`X-Client-Timezone`, [ADR-012](docs/decisions/012-viewer-day-for-date-guards.md)) decides where the boundary is stamped when a trip opens; it is no longer consulted when a guard fires. Price deletion uses this rule: `DELETE /lists/{id}/items/{item_id}/prices` enforces it (422 once the trip has ended). The app offers no delete control at all, because its price sheet opens only on closed-trip records. The dashboard progress counts in `app/routers/lists.py` use the same rule in SQL, via a LEFT JOIN onto `purchases`.

Un-purchasing is allowed only while the trip is open, **plus a write grace window**: a record written within `UNPURCHASE_GRACE` (backend items router, mirrored in `useListItems`) can be un-purchased regardless of its trip, because a receipt scan closes a trip dated to the shopping day and a wrong receipt link must stay reversible. The grace keys off `list_items.updated_at`, so any endpoint that marks an item purchased must also stamp `updated_at` — the receipt apply does when it settles a pending line. The converse holds too: a receipt that settles an item already sitting in the open cart leaves its `purchased_at`/`updated_at` untouched, so closing the trip never reopens the grace window on a co-shopper's earlier tap — and a targeted apply's price patches never stamp `updated_at` either, for the same reason: the purchase they complete may be days old. The price-delete guard needs no grace: it only fires while `purchased_at` is set, so un-purchase first, then delete freely.

## Backend

Requires **Python 3.14** (pinned in `backend/.python-version`).

### Commands

Prefer `just` from repo root (`just backend` lists recipes).

### Key conventions

Backend conventions (ty, import-linter layers, SQLModel/Alembic on SQLite, `is_admin`, spend insights) live in `backend/AGENTS.md`, which loads when working under `backend/`.

### Feature Flag Management

All known flags and defaults live in the registry in `backend/app/services/feature_flags.py`; a `user_features.feature` value that isn't a registry key is invalid. Adding, granting, and revoking flags is covered in `backend/AGENTS.md`.

## Infrastructure

- Firebase project config lives in `frontend/src/lib/firebase.ts` (Auth only — no Firestore, no Storage)
- Receipt files (photos or PDFs, 10 MB cap) live in a private GCS bucket (`RECEIPT_STORAGE_BUCKET`; empty = storage disabled). Clients never touch the bucket directly: the backend checks membership in Postgres and mints short-lived V4 signed URLs (`app/services/receipt_storage.py`), and `frontend/storage.rules` stays fully locked. Uploading gates on the flag + consent like scanning; downloading gates on membership only. The trip header's miniature is a small JPEG the backend renders from the original on first view and stores beside it (`thumb-url`), never the original itself. Retention is list-lifetime — deleting a list purges its `receipts/{list_id}/` prefix best-effort. See [ADR-015](docs/decisions/015-gcs-receipt-storage-signed-urls.md)
- **Scheduled jobs** go through `POST /internal/reports/monthly`, guarded by `X-Trigger-Token` (`REPORT_TRIGGER_TOKEN`; empty = endpoint off). Cloud Scheduler calls it on Cloud Run, cron on an always-on host; it is safe to fire daily or more often. There is no in-process scheduler. See [ADR-018](docs/decisions/018-scheduled-jobs-via-a-token-guarded-endpoint.md)
- **Email** goes out over plain SMTP through `app/services/mailer.py` (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM`; empty host or sender = email off). `send()` never raises on a delivery failure; it logs and returns False. It is also the one place `EMAIL_REDIRECT_TO` applies: every message goes to that address, with the real recipient in the subject and `X-Original-To`. Staging must set it, because it runs on real users' data; the backend deploy workflow refuses a staging deploy with `SMTP_HOST` set and no redirect. The workflow reads the email settings from GitHub Environment variables, and `SMTP_PASSWORD`/`EMAIL_TOKEN_SECRET` from secrets. The report's unsubscribe link (`/u/{token}`, rewritten by Hosting to the backend) is HMAC-signed with `EMAIL_TOKEN_SECRET` and never expires; GET only asks, POST (the page's button or a mail client's RFC 8058 one-click) records the opt-out
- **Staging**: `develop` auto-deploys to a parallel stack — Hosting site `cqs-stg` (cqs-stg.web.app), Cloud Run `carroquesi-backend-staging`, a Neon branch of the production DB (reset with `just staging-db-reset`, which also scrubs `push_tokens`), and its own receipts bucket. Same Firebase project: shared auth pool, FCM sender, App Check key. Access is gated by the waitlist (`WAITLIST_ENABLED=true`, nobody granted): existing users sign in normally, new sign-ups hit the wall. See [ADR-016](docs/decisions/016-staging-environment-and-develop-branch.md)
- **The app is Postgres-host-agnostic** — the backend's entire contract with the database is `DATABASE_URL`, and no code path assumes a particular provider. Keep it that way: don't introduce host-specific assumptions without an ADR
- The **canonical deployment** (the one the maintainer runs) hosts Postgres on Neon. Its backup policy, RPO/RTO, and restore runbook are in [ADR-008](docs/decisions/008-database-backup-policy.md) — read it before a risky migration or any recovery attempt. If you deployed this yourself elsewhere, the Neon specifics don't apply to you; the decision structure does

## Workflows

### General Workflow

- **YAGNI.** Build what the task needs, not what a later one might: no parameter, abstraction, or config knob without a caller today. This is _Complexity is earned_ at coding time — see [PRODUCT.md](PRODUCT.md)
- **DRY is about rules, not lines.** Duplicated code is often fine — abstract on the third occurrence, not the second. Duplicated _rules_ drift apart, so encode one twice only when the copies do different jobs (the trip-open price guard is a UI affordance and an API enforcement), never when they do the same one
- **Write comments and docs in plain, short English.** One idea per sentence. Use common words, not rare or figurative ones: the reader is not always a native speaker. A comment says _why_, not _where_: never cite line numbers, file paths, or issue IDs in a code comment. Nothing checks those links, so they go stale on the next move, and the commit message tells the reader more. Docs are the index, so they cite freely. Keep the length in proportion to the decision. Commit and PR titles are exempt; their style is deliberate.
- **A paragraph defending a workaround means the code is wrong.** If a paragraph is needed to argue the hack is OK, fix the code instead
- Start both servers: `just dev` (uses overmind + `Procfile.local`); use `just dev network` to expose on LAN

### Agent Guardrails

Hooks in `.claude/hooks/` and lefthook enforce these regardless of what a session is told. Every denial names its own reason and remedy, so what follows is only what you need _before_ the first attempt:

- **Create a worktree before touching any file** — `wt switch --create <branch> --no-cd --format=json`, then `EnterWorktree` with the path it reports. Edits are denied by _target path_, so this holds even when the session is rooted somewhere else, and worktree lifecycle goes through `wt` rather than raw `git worktree`.
- **`--no-verify` and `LEFTHOOK=0` are denied** — fix the failing hook instead of skipping it.
- **A turn does not end on a lint failure** — changed Python and TypeScript are re-checked when Claude Code tries to stop, and the turn is continued to fix them. It forces one continuation, not a loop; lefthook is the backstop at commit time.

Each guard's rationale is in its hook's docstring; the staged-file checks are in `lefthook.yml`.

### CI

All PR checks live in `.github/workflows/ci.yml`. `CI gate` is the only required status check, and `ci.yml` must never get `paths:`. The full contract is in the `ci` skill (`.agents/skills/ci/SKILL.md`), which Claude Code loads automatically when working on CI files (through its `.claude/rules/` symlink).

### Architecture Decision Records

Significant architectural decisions are documented in `docs/decisions/`. Before making a choice that overlaps with an existing ADR (auth strategy, ORM, sync mechanism, AI provider, feature flags), read the relevant record — it explains what was considered and why the current approach was chosen.

When introducing a new significant tradeoff (a new infrastructure dependency, a data model pattern, a sync strategy change), add or update an ADR. Edit in place; git history is the audit trail.

### Git Workflow

- Feature PRs target `develop` (the repo default branch) and are squash-merged; every push to `develop` deploys **staging**
- Production ships only through a release PR from `develop` into `main` (also squashed — `main` holds one commit per release); pushes to `main` deploy **production**
- After a release merges, `develop` is force-reset onto `main` (a step in the release skill). Never merge into `develop` between a release merge and its reset
- Use squash merge for PRs by default
- When asked to 'update X', assume this includes committing and pushing unless stated otherwise
- Always check git status for untracked changes before assuming worktree is clean
- If the current worktree contains unrelated or unexpected changes, stop and ask before proceeding
- **Alembic migrations must be the last step before merging**, after rebasing on develop — never create a migration in parallel with another branch that also has one (migration version conflicts require manual resolution and are easy to get wrong)

### Changelog & Release Workflow

- `CHANGELOG.md` is generated by `git-cliff` (`cliff.toml`). **Never generate it on a feature branch**: squash merges collapse the branch's commits, so the entries describe commits that will not exist. To preview what landed since the last tag, run `git cliff --unreleased` on `develop` (stdout only).
- Releases go through the `/release` skill (`.agents/skills/release/SKILL.md`), which also explains why the release branch is the one safe place to regenerate. Don't reconstruct the steps by hand.

### Local Dev Environment

- Skills live in `.agents/skills/`, the shared location: Antigravity and Codex read it directly. `.claude/skills` is a symlink to it, so Claude Code sees the same skills; edit and commit the files under `.agents/skills/`. Path-scoped guidance (`ci`, `receipt-scanning`) is a skill with `paths:` frontmatter and `user-invocable: false`, plus a symlink to its `SKILL.md` in `.claude/rules/`. The rule symlink is what puts the text in Claude's context when a matching file is touched; a skill's `paths:` alone only lists the skill, and Claude may never open it. The other agents pick the skill by its description. Hooks (`.claude/hooks/`) stay Claude-only; lefthook is the guard every agent hits. Third-party skills are tracked in `skills-lock.json`: add one with `npx skills add <repo> -s <skill> -a claude-code`, refresh them all with `npx skills update -p`. The symlink makes the CLI write a single copy into `.agents/skills/`. The project's own skills (`release`, `ship`, …) are not in the lock
- Backend uses FastAPI with Firebase; ensure `.env` and Firebase config are present before running
- Frontend typecheck must use `tsconfig.app.json` (root tsconfig.json has files:[] and silently passes)
- Never commit a **platform-narrowed** `pnpm-lock.yaml` — one where a native binding resolved for your platform only, so installs break everywhere else. Note this is about _completeness, not presence_: packages like `sharp` and `@rollup/rollup` legitimately ship a full per-platform matrix, and every version bump of them adds new per-platform entries. That is expected and fine. The `lockfile-guard` pre-commit hook enforces exactly this — for each native binding family added, the lockfile must name it for more than one OS

## Bug Investigation

- When user reports a bug, investigate and attempt a concrete fix before declaring scope issues
- Don't silently change URLs, endpoints, or external identifiers (e.g., es.openfoodfacts.org → world.openfoodfacts.org)

## Validation Checklist

- Frontend changes: run lint, relevant tests, and `just frontend typecheck`
- Backend changes: run `just backend typecheck`, lint, and relevant `just backend test-file {file}` tests (full suite when feasible `just backend test`)
- Before push: verify only intentional files are changed, and that `pnpm-lock.yaml` was not platform-narrowed (a full per-platform matrix from a dependency upgrade is fine; only _your_ platform appearing is not)
- Shortcut: `just ci` runs format-check + typecheck + lint + tests (frontend and backend) in one shot
- **Do not run `just changelog` on a feature branch** — it belongs to the release flow (release branch cut from `develop`)

## Definition of Done

A task is complete only when **all** of the following are true:

- [ ] Worktree confirmed active (not on `main` or `develop`) before any file was touched
- [ ] Lint and relevant tests pass (`just ci` for full check)
- [ ] Only intentional files changed (no platform-narrowed `pnpm-lock.yaml`)
- [ ] `CHANGELOG.md` untouched — it is generated during the release flow, on a release branch cut from `develop`. The release PR is the only exception

## Open Action Items (1:1 — 2026-08-30)

**You:**

- [ ] Brain-dump the redesign polish list into Linear (Redesign label) before starting Panopticon — it currently lives only in your head
- [ ] Siri writeup once Panopticon v1 ships — the material already exists

> When you notice context in a session that relates to one of these items, surface it proactively — don't wait for the next 1:1. Mark items complete or remove them when done.
