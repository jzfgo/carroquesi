# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and similar coding agents when working with code in this repository.

## Workflow

Always use a git worktree (via the `/worktrunk` skill) to isolate branch work before starting any feature, bugfix, or PR review. Never work directly on `main`.
Standard flow for any non-trivial task:
- Check `git status --short` before making changes
- Implement the smallest complete fix first, then iterate
- Run relevant validation commands before committing/pushing
- Re-check `git status --short` to confirm only intentional files changed

## Git Workflow
- Use squash merge for PRs by default
- When asked to 'update X', assume this includes committing and pushing unless stated otherwise
- Always check git status for untracked changes before assuming worktree is clean
- For CI: use `npm ci --legacy-peer-deps` when the project requires it
- If the current worktree contains unrelated or unexpected changes, stop and ask before proceeding

## Local Dev Environment
- Use nvm (respect .nvmrc) for Node version management
- Backend uses FastAPI with Firebase; ensure .env and Firebase config are present before running
- Frontend typecheck must use `tsconfig.app.json` (root tsconfig.json has files:[] and silently passes)
- Use `--legacy-peer-deps` for npm installs to match CI
- Never commit platform-specific (darwin/linux) native bindings to package-lock.json

## Bug Investigation
- When user reports a bug, investigate and attempt a concrete fix before declaring scope issues
- Limit exploration to ~3-5 file reads before either fixing or asking a targeted question
- Don't silently change URLs, endpoints, or external identifiers (e.g., es.openfoodfacts.org → world.openfoodfacts.org)

## Validation Checklist
- Frontend changes: run lint, relevant tests, and `node_modules/.bin/tsc -p tsconfig.app.json --noEmit`
- Backend changes: run relevant `uv run pytest` tests (full suite when feasible)
- Before push: verify only intentional files are changed and no platform-specific native binding churn was introduced in `package-lock.json`
- Shortcut: `just ci` runs frontend typecheck + lint + backend tests in one shot

## Project Overview

CarroQueSí is a collaborative grocery list app where multiple users share lists, mark items as purchased, and receive product suggestions from purchase history.

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
- `list_items`: item data, purchase state (`purchased_at`), and pricing (`price`, `price_per`, `price_store`)
- `list_invites`: opt-in invitations; `id` is the share token
- `barcode_cache`: cached barcode lookup data

Important invariants:
- bump `lists.updated_at` on item writes, member changes, and list rename
- `list_items.purchased_at = NULL` means unpurchased; first purchase sets timestamp
- keep derived `purchased: bool` in API responses for backward compatibility
- invite acceptance is explicit before access is granted

## Frontend

### Commands
Prefer `just` from repo root (`just` lists recipes). Direct npm commands when needed:
```bash
cd frontend
npm install --legacy-peer-deps
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
- Firebase SDK used directly in the frontend for Auth only
- All data fetched from the FastAPI backend via REST
- Short-poll `GET /lists/{list_id}/updated-at` every 5s; re-fetch items only when timestamp changes
- `FrequencySuggestionBanner` sits above the SmartInputBar and cycles through due suggestions every 6s; dismissals are persisted in `localStorage` (`cqs_dismissed_suggestions`) with a TTL computed by the backend
- `FilterBar` renders above the item list when the list has any items with stores. It has two modes: **chip mode** (one chip per distinct store, "Todas" resets the filter) and **search mode** (slide-in text input, accepts full sigil syntax). `filterItems()` in `frontend/src/hooks/useItemFilter.ts` reuses `parseInput` to match text, `@store`, and `#brand` simultaneously.
- `lookupOwnBrandStore(brand)` in `frontend/src/lib/ownBrands.ts` maps ~50 Spanish own-brand names (e.g. `Hacendado` → `Mercadona`, `Milbona` → `Lidl`) to their parent store; `useOwnBrandInference` auto-fills the `@store` chip when a matching brand is typed in SmartInputBar.
- `cqs_last_price_store` (localStorage, 1-hour TTL) persists the last store used in `LogPriceSheet` to pre-fill the store field on the next price log
- Settings are now accessible through the user menu for theme customization
- `PriceHistorySheet` groups entries by store client-side and renders an SVG sparkline per store; the expanded view shows a larger chart + last/min/max stats. `PriceEntry` includes `purchased_at` for the time axis.
- `ListScreen` shows running cost totals next to section labels (client-side only, `frontend/src/lib/itemCost.ts`):
  - Unpurchased section → estimated total (accent/purple); purchased date labels → daily spent (green)
  - `≥` prefix when any item has no price or an unresolvable per-kg quantity
  - `parseQuantityFactor(quantity, pricePer)` rules: SI units `g kg ml cl dl l` supported (comma/dot decimal, optional trailing `.`); 1 L = 1 kg; `price_per=null` + SI unit → ×1 (pack descriptor); `price_per=null` + plain number → count multiplier; `price_per='KILOGRAM'` without a recognised SI unit → `null` (excluded, triggers `≥`)
  - `purchasedDateLabel(purchased_at)` is the canonical date-label function — used by both `ListScreen` and `ItemList` so grouping keys always match

### SmartInputBar sigil system
The input bar parses sigils from free text via `parseInput.ts` → `ParsedInput`:
- `+` quantity (e.g. `+2`, `+1 bolsa`)
- `#` brand (e.g. `#Danone`)
- `@` store — multiple allowed (e.g. `@Mercadona @Lidl`)
- `$`/`€` price — single token, accepts comma or dot decimal separator, optional `/kg` suffix (e.g. `$1,50`, `€3.20/kg`); normalised to a float and stored as `price`/`pricePer` on `ParsedInput`. Logged atomically with item creation via `ItemCreate.price` / `price_per` / `price_store`. A price preview pill appears in the input preview when a valid price is parsed.
- `|` EAN barcode — 8 or 13 digits only (e.g. `|4011200296908`); triggers a barcode lookup via `getBarcode()` and opens `BarcodeScanSheet` on success. Can combine with `#`/`@` to pre-fill brand/store in the sheet.

Sigil values containing spaces must be quoted with double or single quotes (e.g. `#"El Corte Inglés"`, `@'Ahorramas express'`). Unclosed quotes pass through unchanged.

Price display throughout the app uses `formatPrice(amount, pricePer?)` from `frontend/src/lib/formatPrice.ts` — an `Intl.NumberFormat`-based formatter that renders locale-aware currency strings.

When `parsed.ean` is set, the input is in **EAN mode**: the regular parse preview is hidden, an EAN preview with a "Buscar" CTA is shown, and the add button is disabled. `ListScreen` holds an `EanLookupState` discriminated union (`idle | loading | found | error`) and passes `onEanSearch`, `eanLoading`, `eanError` to `SmartInputBar`.

A **clear button** (✕) replaces the camera scan button whenever the input has text.

### Purchased item rules
Purchased items (`item.purchased === true`) are **read-only** in the UI. Allowed: unchecking, deleting, viewing price history. Disallowed: rename, quantity/brand/store edits, adding/changing/removing price. `ItemCard` renders tags as `<span>` (not `<button>`) for purchased items and hides all "add" CTAs. `ItemActionSheet` hides the rename option. `PriceHistorySheet` hides the log-price button when `readOnly` is passed.

Price deletion has a **same-day guard**: the delete button in `LogPriceSheet` is only shown when `isSameCalendarDay(item.purchased_at)` is true (frontend), and the backend `DELETE /lists/{id}/items/{item_id}/prices` enforces the same rule, returning 422 for prior-day purchases.

### Testing conventions
- When mocking `react-router-dom` (or any module where you only need to override specific exports), use `importOriginal` to avoid stripping the real module's exports:
  ```ts
  vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router-dom')>()
    return { ...actual, useLocation: vi.fn(), useNavigate: vi.fn().mockReturnValue(vi.fn()) }
  })
  ```
- Plain `vi.mock('module', () => ({ ... }))` replaces the entire module — any hook or class not listed will be missing and throw at runtime.

## Backend

Requires **Python 3.13** (pinned in `backend/.python-version`).

### Commands
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
```
backend/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py        # Settings (DATABASE_URL, FIREBASE_CREDENTIALS_PATH, ALLOWED_ORIGINS)
│   │   ├── firebase.py      # Firebase Admin SDK init + verify_id_token()
│   │   └── http.py          # Shared httpx headers (User-Agent) for outbound API calls
│   ├── db/
│   │   ├── session.py       # SQLModel engine + get_session dependency
│   │   └── models.py        # SQLModel table models
│   ├── routers/
│   │   ├── auth.py          # POST /auth/sync
│   │   ├── lists.py         # GET/POST/PATCH/DELETE /lists[/{id}]
│   │   ├── members.py       # GET/POST/DELETE /lists/{id}/members[/{user_id}]
│   │   ├── items.py         # GET/POST/PATCH/DELETE /lists/{id}/items[/{id}]
│   │   ├── invites.py       # GET/POST/DELETE /invites[/{id}[/accept]]
│   │   ├── prices.py        # GET/POST /lists/{id}/items/{item_id}/prices
│   │   ├── suggestions.py   # GET /lists/{id}/due-suggestions, GET /lists/{id}/updated-at
│   │   ├── barcode.py       # GET /barcode/{ean} — OpenFoodFacts lookup + local cache
│   │   └── share.py         # GET /i/{invite_id} — OG meta-tag preview page for invite links
│   ├── schemas/             # Pydantic request/response models (one file per router; due_suggestions.py for DueSuggestionRead)
│   ├── services/
│   │   └── community_price.py  # Open Prices API lookup with negative-cache; shared by barcode + prices routers
│   └── dependencies.py      # get_current_user, require_member, require_owner
└── alembic/                 # Migrations
```

### Environment variables
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carroquesi
FIREBASE_CREDENTIALS_PATH=firebase-credentials.json
ALLOWED_ORIGINS=["http://localhost:5173"]
DEV_AUTH_BYPASS=true   # local only — skips Firebase token validation
```

## Infrastructure

- Firebase project config lives in `frontend/src/lib/firebase.ts` (Auth only — no Firestore, no Storage)
- Environment variables go in `.env` files — never committed
- Cloud Run service URL stored as an env var in the frontend for API calls

## Out of Scope

- Receipt scanning (OCR)
- Submitting prices to Open Prices (requires proof image + OSM location)
