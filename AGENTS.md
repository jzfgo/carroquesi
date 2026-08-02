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

- `users`: user profile, Firebase identity (`firebase_uid`), and receipt-scanning consent (`receipt_consent`: NULL = never asked, else "granted"/"declined"; both receipt endpoints require "granted" on top of the `ai_receipt_scanning` flag, answering 403 `receipt_consent_required`)
- `lists`: list metadata and ownership (`owner_id`)
- `list_members`: list membership links; `is_default` flags the member's default list (the Siri `list_id="default"` target)
- `list_items`: item data, purchase state (`purchased_at`), actual purchased quantity (`purchased_quantity`), pricing (`price`, `price_per`, `price_store`), and the trip it was bought on (`purchase_id`, nullable)
- `purchases`: shopping trips, declared at reconciliation — `tears_off_at` is the stamped local-midnight boundary, `closed_at` NULL means still open (or never written down, on backfilled rows), `total` is a confirmed figure never summed from lines; at most one open trip per `(list_id, tears_off_at)` via partial unique index. See [ADR-014](docs/decisions/014-purchase-entity-and-trip-boundary.md)
- `list_invites`: opt-in invitations; `id` is the share token
- `barcode_cache`: cached barcode lookup data
- `receipt_scans`: receipt scan audit log (store, date, total, parsed lines, match results), plus where the original file sits in the bucket when one was uploaded (`file_path`/`file_content_type`/`file_pages`, recorded when the upload URL is minted — the backend never sees the bytes)
- `receipt_name_mappings`: learned receipt→item name mappings per store; improves auto-matching on future scans
- `list_stores`: per-list store registry — `store_key` → canonical `display_name`, renameable by members. See [ADR-013](docs/decisions/013-store-registry.md)
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
- push notifications fire on item creation, on `purchased_at` going `NULL` → set, and on ownership transfer (`PUT /lists/{list_id}/owner`: `ownership_transferred` to the new owner, `owner_changed` to the other remaining members), and on nothing else. Un-purchasing is a correction and must stay silent
- the list owner cannot leave their own list: owner self-leave answers 409 "Transfer ownership before leaving" — transfer first (owner-only; target must be a current member), then leave normally. Transfer moves only `lists.owner_id`; memberships and default-list flags stay untouched
- prune a push token only on a **typed** FCM verdict (`UnregisteredError`, `SenderIdMismatchError`), never on an error-message substring — a global misconfiguration would otherwise delete every token in the table

## Frontend

Requires **Node.js v24** (pinned in `frontend/.nvmrc`)

### Commands

Prefer `just` from repo root (`just frontend` lists recipes).

### PWA

PWA uses `vite-plugin-pwa` with `strategies: 'injectManifest'`; the service worker is active in dev (`devOptions.enabled: true`, `type: 'module'`).

The worker is **`frontend/src/sw.ts`** — real source, linted and typechecked via `tsconfig.worker.json` — not a generated artifact. It handles precaching, the backend `NetworkOnly` route, and Web Push (display + tap routing). It carries **no Firebase SDK**: `getToken({serviceWorkerRegistration})` subscribes it to standard Web Push, so data messages arrive as ordinary `push` events. `dist/sw.js` is build output; never edit it.

Anything imported by `sw.ts` must stay DOM-free and WebWorker-safe, and must be listed in `tsconfig.worker.json`'s `include` (currently `sw.ts` and `lib/pushCopy.ts`).

`injectManifest.globPatterns` is pinned to the workbox default plus `woff2` (`**/*.{js,css,html,woff2}`) so the self-hosted fonts render offline — do not widen it. The PWA icons and `manifest.webmanifest` are injected from `manifest.icons` via `includeManifestIcons`, not globbed — a broader pattern triples the precache instead of protecting it. Diff the precache manifest before and after any worker config change; a successful build proves nothing. See [ADR-009](docs/decisions/009-single-service-worker.md).

### Dev auth bypass

Set `DEV_AUTH_BYPASS=true` in `backend/.env` and `VITE_DEV_USER_ID=seed-alice|seed-bob|seed-carol` in `frontend/.env` to bypass Google Sign-In locally. Frontend sends `X-Dev-User-Id` and backend resolves the user from it. Add `X-Dev-Is-Admin: true` to also mark the dev user as admin. **Never enable this in production.**

### Key conventions

- Mobile-first, single-column layout. The dashboard is the flat `38a` panel — rows on 1px rules, no cards, whole-row drag to reorder; the row subtitle comes from `lib/listSubtitle.ts` and must tolerate cached list payloads that predate `members`/`cart_count`. DESIGN.md governs the visuals
- The item row (`components/ItemCard.tsx`, `30a`/`33a`) has **three states, two voices**: pending is an instruction in the written face (name, qty holding the right edge, brand beneath — no shop, the group header names it, and never a price); in-cart is derived, not stored (`purchased && isTripOpen(purchase_ends_at)`), cart glyph on `--tinta-0`, still no amount; bought is a mono record — qty folds into the meta row, the amount sits in the right-hand column in `--ink-1` — only the tick is green, and **no strikethrough anywhere**. **Prices belong to closed-trip records only**: no amount and no price entry (`ItemActionSheet`) until the item's trip has closed. Rows carry no rules between them — rules belong to sections (sheet title, store headers, both the dashed `--rule-dashed` voice). Two touch targets per row: the leading control and the row body (chevron in `--ink-2` at the row's edge signals the tap), which opens `ItemActionSheet` — the single home for per-field editing; the row carries no chips, avatar, or menu button of its own. On non-today records the check yields its slot to the bare re-buy glyph in `--ink-1` (JAV-128 clone) — never both, never the accent (the Grayscale Ink Rule: inside a sheet only the status circle keeps colour). The pending sheet groups items under store headers by `storeKey()`, labelled with the registry display name; the circle renders dashed while offline. While a list is open the board paints edge-to-edge (fixed underlay in `ListScreen.css`) and the list is full-width at every viewport — no column cap
- «Gestionar Miembros» opens the `17c` members sheet (`components/ListMembersSheet.tsx`): the 5-member cap is said upfront (header count, invite footer), removal confirms in place, and «Salir de esta lista» sits below its own rule. An owner's leave first hands the list to another member (`transferOwnership`, then own `DELETE` membership); a sole owner is not offered leave at all. The crown marks the owner's row for **every** viewer, which is why callers pass the list's `owner_id` down through `ListActionSheet` instead of a viewer-relative flag
- The dashboard avatar opens the `23a` settings sheet (`components/SettingsSheet.tsx`) — the single home for the `34a` appearance switcher (Aspecto: Claro/Oscuro/Sistema), the push toggle, the Siri shortcut key (issued lazily on open, shown masked, regenerated behind a confirm sub-state), install, feedback, and sign-out. Don't add a second surface for any of these. The footer prints `__APP_VERSION__`, injected from package.json in `vite.config.ts`
- The appearance preference lives in `lib/theme.ts` (`cqs_theme` in localStorage; absent means system). `ThemeManager` applies `.theme-light`/`.theme-dark` on `<html>` — neither class for system, which rides the `prefers-color-scheme` media query — and syncs `meta[name=theme-color]` to the resolved `--paper-0`. An inline script in `index.html` does the same work once before first paint; it can import nothing, so its key, validity rule, and colours must be kept in step with `lib/theme.ts` by hand
- Sticky "Smart Input" bar fixed at the bottom of the screen
- Bottom sheets build on the shared `Sheet` primitive (`components/Sheet.tsx`), not on hand-rolled overlays. It owns the portal, scrim, grabber, swipe/Escape/scrim dismissal, focus trap, body scroll lock, and the open/close slide. Parents control presence by mounting; the sheet owns the exit — a dismiss plays the slide-down and only then calls `onClose`, with a timeout fallback so a missed `transitionend` can never wedge a sheet open. `onDismiss` remaps dismiss gestures for sub-state sheets ("go back" instead of close), and the `SheetHandle` ref closes with the animation from content buttons
- Firebase SDK used in the frontend for Auth (Google Sign-In) and AI (Gemini receipt parsing via Firebase AI SDK). Clients are constructed **lazily** behind memoised accessors in `lib/firebase.ts` (`getFirebaseAuth()`, `getFirebaseAi()`, `getMessagingIfSupported()`) — never at module scope. A client built at import time turns a bad config into a crash during module evaluation, and forces credentials onto every test that transitively imports the module; CI runs the suite with no Firebase env, so that mistake surfaces only there
- All data fetched from the FastAPI backend via REST
- Short-poll `GET /lists/{list_id}/updated-at` every 5s; re-fetch items only when timestamp changes
- **Offline is read-only** ([ADR-011](docs/decisions/011-offline-is-read-only.md)): connectivity lives in a module store (`lib/connectivity.ts`) fed by browser events and by every `apiFetch` outcome — any response proves the server reachable, a fetch `TypeError` proves it is not, last signal wins. `OfflineBand` (rendered once in `App`) overlays the top of the screen while offline; it must stay `position: fixed`, never in flow, or spotty signal shifts the layout. Every mutation in `useListItems` starts with an `isOnline()` guard that refuses with a toast. A new mutation needs that guard; without it the write fails as a rollback + generic error toast instead of a clean refusal — worse copy, same safety
- A list read **reconciles** into the items on screen (`lib/reconcileItems.ts`), it never replaces them. A read already in flight when the user writes carries the list from before that write, so painting it whole undoes the write. Every write in `useListItems` marks its item with `markWritten`, and a write that paints before it sends marks twice — at the paint and at the server's answer — because in between nobody knows whether the server applied it. A new mutation that skips `markWritten` reintroduces the revert, and nothing will fail. Marks name the list too, because opening a list from a push tap changes only the route parameter and leaves this hook mounted with the previous list's items in state. The merge keeps the whole item, not the written field, so a change another shopper made to that same item is dropped with it. A read a write raced therefore asks the next poll to read again, and keeps asking until one lands clean
- One item write sits outside that guard, from before it existed: the receipt price apply in `ListScreen` writes through `submitReceiptPrices` and re-reads. It can be undone for one poll tick and heals on the next read. Route a new write through `useListItems` instead of adding a second
- The list on screen can stop being the user's after mount — deleted elsewhere, or membership revoked. Every write in `useListItems` (and the poll, and the members sheet) reports a 403/404 answer through `suspectListGone`; `ListScreen.confirmListGone` re-reads the list and only a second 403/404 evicts, by swapping in `ListRoute`'s error screen. Never evict on the first answer — the missing thing is often just the item, and one wrong check costs somebody their screen mid-shop. A new mutation's catch must report too; nothing fails if it doesn't, the arrival just goes back to being ignored
- The list cache in `localStorage` is written from the items on screen, not from the read. It is what the next open paints before the network answers, so a read-shaped cache would put a raced write back on screen
- When mocking modules with partial overrides (e.g. `react-router-dom`), use `importOriginal` to preserve unspecified exports. Plain `vi.mock('module', () => ({...}))` drops everything not listed and throws at runtime.
- Build test mocks with the implementation baked in: `vi.fn(() => value)`, not `vi.fn().mockReturnValue(value)`. `mockReset: true` wipes attached implementations before every test but restores baked ones, so an attachment evaluated at module load leaves a mock returning `undefined` — and an awaited `undefined` can pass vacuously. An ESLint rule bans the attached spelling everywhere, because the AST cannot tell module scope from a test body. For `.mockXOnce` sequences, construct bare (`const m = vi.fn()`) and attach inside the test.
- Environment constants are centralized in `frontend/src/lib/environment.ts`; import from there instead of accessing `import.meta.env` directly
- API types are generated, not written: the aliases in `frontend/src/types.ts` re-export `src/apiSchema.generated.ts`, which `openapi-typescript` derives from `backend/openapi.json` (regenerate both with `just openapi`). Never edit the generated file or the snapshot by hand. A backend schema change is a three-commit-in-one: the schema, the regenerated snapshot, the regenerated types — a backend test fails when the snapshot is stale, and `pnpm openapi:check` (runs inside `pnpm lint`) fails when the types are. Frontend-only types (`ParsedInput`, `Member`, …) stay hand-written in `types.ts` below the aliases

### E2E Testing (Playwright)

Run with `just frontend test-e2e` (alias: `pnpm test:e2e`). It runs against the **preview build**, not the dev server — changes must be built first.

Visual regression: key screens are checked via `toHaveScreenshot()` (wrapped in the `expectScreenshot` helper in `fixtures.ts`), baselines committed under `frontend/tests/*-snapshots/`. Only `chromium`/`Mobile Chrome` carry baselines. Regenerate with `just frontend update-snapshots`, which runs the container every committed baseline came out of — not a stand-in for CI, which renders on its own runner and is why there is a pixel budget at all. See `frontend/tests/README.md`. Three rules there are easy to breach by accident: the tolerance is an absolute pixel count, never a ratio; anything a screenshot shows must be deterministic — pin the clock before capturing a screen that prints a date; and the suite's timezone is pinned in `playwright.config.ts`, so every committed baseline is Madrid-rendered. Unpinning it or changing the zone hands the render environment back to the machine, which is how a baseline comes to pass while depicting the wrong day. The pin covers the **browser** only — Playwright does not touch the Node runner's `TZ`, and the vitest suite still runs at the machine's zone, so unit tests that touch dates have to be made zone-less themselves.

A screenshot is also a weak guard for a small visual affordance: a real one can cost far less than the tolerance, so the budget lets it vanish silently. When the thing under test *is* a style rule, assert the computed style as well.

The remaining gotchas — ports, dev-auth setup, the `loadEnvFile()` `${VAR}` non-expansion, and the browser matrix — are in `frontend/AGENTS.md`. Read that file directly if your harness does not load nested guidance automatically.

### SmartInputBar sigil system

`parseInput.ts` → `ParsedInput`. Sigils: `+qty`, `#brand`, `@store` (multiple allowed), `|EAN` (8/13 digits). Values with spaces need quotes: `#"El Corte Inglés"`, `@'Carrefour Express'`.

### Store names

Store names are free text from four sources and no two people spell a shop the same way, so **comparisons go through a deterministic key and display goes through the per-list registry** ([ADR-013](docs/decisions/013-store-registry.md)). The key collapses spelling variants only (case, accents, whitespace, punctuation) — vocabulary variants like `BM` vs `BM Supermercados` stay apart on purpose, and fuzzy matching was measured and rejected (a wrong merge silently fuses price histories). Two implementations, one rule: `backend/app/services/store_key.py` and `frontend/src/lib/storeKey.ts`, pinned to the shared vector file `storeKeyVectors.json` that both suites assert — change one only through that file. `receipt_name_mappings` stores key-normalised `store` and `normalise()`d `receipt_name` (they are pure lookup keys, never displayed). Item rows keep the raw typed strings; rendering resolves them via `displayStore` (from `useListItems`), falling back to the raw string for unregistered keys. Any backend write that introduces a store string must call `ensure_stores` (`app/services/store_registry.py`); any new store comparison must use the key; never persist a resolved display name back onto an item.

### Receipt scanning

Four-step flow: client parse (`receiptAi.ts` via Gemini) → backend fuzzy match (`receipt_matcher.py`) → user review (`ReceiptScanSheet`) → apply prices. `VITE_RECAPTCHA_SITE_KEY` required in production for Firebase App Check (reCAPTCHA v3).

### Purchased item rules

Purchased items are mostly read-only (rename/qty/brand/store edits disabled). Whether a purchase can still be corrected is the **trip-open rule** ([ADR-014](docs/decisions/014-purchase-entity-and-trip-boundary.md)): an item's trip stops taking changes at `closed_at ?? tears_off_at`, exposed to clients as `ItemRead.purchase_ends_at` and answered by `app/services/trips.is_open` on the backend and `lib/isTripOpen.ts` on the frontend. The mirror treats a missing `purchase_ends_at` as open — an optimistic write has no trip yet, and the server has the last word — while the backend treats a purchased item with a NULL or dangling `purchase_id` as **closed** (refusing an edit is recoverable; reopening spend nobody can date is not). The viewer's timezone (`X-Client-Timezone`, [ADR-012](docs/decisions/012-viewer-day-for-date-guards.md)) decides where the boundary is stamped when a trip opens; it is no longer consulted when a guard fires. Price deletion uses this rule: `LogPurchaseSheet` hides the control, and `DELETE /lists/{id}/items/{item_id}/prices` enforces it (422 once the trip has ended). The dashboard progress counts in `app/routers/lists.py` use the same rule in SQL, via a LEFT JOIN onto `purchases`.

Un-purchasing is allowed only while the trip is open, **plus a write grace window**: a record written within `UNPURCHASE_GRACE` (backend items router, mirrored in `useListItems`) can be un-purchased regardless of its trip, because a receipt scan backdates the purchase to the shopping trip and a wrong receipt link must stay reversible. The grace keys off `list_items.updated_at`, so any endpoint that sets `purchased_at` must also stamp `updated_at` — the receipt apply does. The converse holds too: a price-only receipt patch to an already-purchased item deliberately does not move `updated_at`, because that would reopen the window on someone's days-old purchase. The price-delete guard needs no grace: it only fires while `purchased_at` is set, so un-purchase first, then delete freely.

## Backend

Requires **Python 3.13** (pinned in `backend/.python-version`).

### Commands

Prefer `just` from repo root (`just backend` lists recipes).

### Key conventions

- FastAPI app entrypoint: `backend/app/main.py`
- ORM: **SQLModel** (canonical FastAPI approach). Migrations via **Alembic**. Local dev runs on SQLite, which cannot alter a column or add and drop constraints in place — wrap those in `op.batch_alter_table()`. The test suite builds its schema from the models and never runs migrations, so a green suite proves nothing here. Batch mode rebuilds the table with a `CAST`, which can corrupt a type change; migration `465041cfdecb` branches on the dialect instead, and explains when to do that.
- Settings via `pydantic_settings` in `backend/app/core/config.py`, loaded from `backend/.env`
- Firebase Admin SDK init in `backend/app/core/firebase.py` — singleton pattern
- Auth dependency in `backend/app/dependencies.py`: `get_current_user`, `require_member`, `require_owner`, `require_admin`
- `is_admin` is a transient Python attribute on `User`, read from Firebase JWT custom claim `decoded.get("is_admin", False)` — never stored in the DB
- Tests use SQLite in-memory (via `StaticPool`) — no Postgres needed to run the test suite
- Dockerized: `backend/Dockerfile` → deployed to Cloud Run; runs `alembic upgrade head` on startup

### Feature Flag Management

All known flags and defaults live in the registry in `backend/app/services/feature_flags.py`; a `user_features.feature` value that isn't a registry key is invalid. Adding, granting, and revoking flags is covered in `backend/AGENTS.md` — read that file directly if your harness does not load nested guidance automatically.

## Infrastructure

- Firebase project config lives in `frontend/src/lib/firebase.ts` (Auth only — no Firestore, no Storage)
- Receipt files (photos or PDFs, 10 MB cap) live in a private GCS bucket (`RECEIPT_STORAGE_BUCKET`; empty = storage disabled). Clients never touch the bucket directly: the backend checks membership in Postgres and mints short-lived V4 signed URLs (`app/services/receipt_storage.py`), and `frontend/storage.rules` stays fully locked. Uploading gates on the flag + consent like scanning; downloading gates on membership only. Retention is list-lifetime — deleting a list purges its `receipts/{list_id}/` prefix best-effort. See [ADR-015](docs/decisions/015-gcs-receipt-storage-signed-urls.md)
- Cloud Run service URL stored as an env var in the frontend for API calls
- **The app is Postgres-host-agnostic** — the backend's entire contract with the database is `DATABASE_URL`, and no code path assumes a particular provider. Keep it that way: don't introduce host-specific assumptions without an ADR
- The **canonical deployment** (the one the maintainer runs) hosts Postgres on Neon. Its backup policy, RPO/RTO, and restore runbook are in [ADR-008](docs/decisions/008-database-backup-policy.md) — read it before a risky migration or any recovery attempt. If you deployed this yourself elsewhere, the Neon specifics don't apply to you; the decision structure does

## Workflows

### General Workflow

- **YAGNI.** Build what the task needs, not what a later one might: no parameter, abstraction, or config knob without a caller today. This is *Complexity is earned* at coding time — see [PRODUCT.md](PRODUCT.md)
- **DRY is about rules, not lines.** Duplicated code is often fine — abstract on the third occurrence, not the second. Duplicated *rules* drift apart, so encode one twice only when the copies do different jobs (the trip-open price guard is a UI affordance and an API enforcement), never when they do the same one
- **Write comments and docs in plain, short English.** One idea per sentence. Use common words, not rare or figurative ones: the reader is not always a native speaker. A comment says *why*, not *where*: never cite line numbers, file paths, or issue IDs in a code comment. Nothing checks those links, so they go stale on the next move, and the commit message tells the reader more. Docs are the index, so they cite freely. Keep the length in proportion to the decision. Commit and PR titles are exempt; their style is deliberate.
- **A paragraph defending a workaround means the code is wrong.** If a paragraph is needed to argue the hack is OK, fix the code instead
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

CI runs the suite on two workers, and `retries: 2` means a first-attempt failure still reports as a pass. So judge any change to parallelism on a `--retries=0` run: the retries exist to absorb noise, and they absorb real defects just as well. `frontend/tests/README.md` records what the numbers were and which bug this hid.

### Architecture Decision Records

Significant architectural decisions are documented in `docs/decisions/`. Before making a choice that overlaps with an existing ADR (auth strategy, ORM, sync mechanism, AI provider, feature flags), read the relevant record — it explains what was considered and why the current approach was chosen.

When introducing a new significant tradeoff (a new infrastructure dependency, a data model pattern, a sync strategy change), add or update an ADR. Edit in place; git history is the audit trail.

### Git Workflow

- Use squash merge for PRs by default
- When asked to 'update X', assume this includes committing and pushing unless stated otherwise
- Always check git status for untracked changes before assuming worktree is clean
- If the current worktree contains unrelated or unexpected changes, stop and ask before proceeding
- **Alembic migrations must be the last step before merging**, after rebasing on main — never create a migration in parallel with another branch that also has one (migration version conflicts require manual resolution and are easy to get wrong)

### Changelog & Release Workflow

- `CHANGELOG.md` is the canonical record of what shipped, generated by `git-cliff` (`cliff.toml`).
- **Never generate on a feature branch.** PRs are squash-merged, so a branch's individual `feat`/`fix` commits stop existing at merge. Generating pre-squash writes entries for commits that are about to collapse, and the next branch to regenerate then *deletes* the extra entries already committed on `main`. Between releases there is simply no `[Unreleased]` section; to see what has landed since the last tag, run `git cliff --unreleased`, which prints to stdout and leaves `CHANGELOG.md` alone (`just changelog` rewrites the file). The release branch is the one exception: it is based on `main` and adds no `feat`/`fix` commits of its own, so `git cliff` sees the same history `main` will.
- The release procedure itself — version bump, changelog regeneration, PR, and post-merge tagging — lives in `.agents/skills/release/SKILL.md`. Invoke `/release` if your harness supports skills, otherwise read that file; either way don't reconstruct the steps by hand.

### Local Dev Environment

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
