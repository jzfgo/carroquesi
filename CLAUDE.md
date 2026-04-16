# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

Always use a git worktree (via the `/worktrunk` skill) to isolate branch work before starting any feature, bugfix, or PR review. Never work directly on `main`.

## Project Overview

**CarroQueSí** — a collaborative grocery shopping list web app. Multiple users share lists, mark items as purchased, and get smart product suggestions based on purchase history.

## Architecture

```
carroquesi/
├── frontend/   # React + TypeScript (Vite) → Firebase Hosting
└── backend/    # Python + FastAPI + PostgreSQL (Dockerized → Cloud Run)
```

**Firebase Auth** handles Google Sign-In only. The frontend gets a Firebase ID token and sends it as `Authorization: Bearer <token>` on every API request. The backend validates it via the Firebase Admin SDK.

**FastAPI + PostgreSQL** is the primary data path for all CRUD. There is no Firestore. Real-time sync is handled by short polling: the frontend polls `GET /lists/{list_id}/updated-at` every 5 seconds and re-fetches items when the timestamp changes.

**Deployment:** Frontend → Firebase Hosting, Backend → Google Cloud Run (Docker).

## Core Data Model

| Table | Key fields |
|-------|-----------|
| `users` | id (UUID), firebase_uid, display_name, email, photo_url, created_at |
| `lists` | id, name, emoji (nullable), owner_id (FK→users), created_at, updated_at |
| `list_members` | id, list_id (FK→lists), user_id (FK→users), created_at |
| `list_items` | id, list_id, name, quantity, brand, stores (JSON array), purchased_at (nullable datetime), added_by, price (nullable float), price_per (nullable str), price_store (nullable str), created_at, updated_at |
| `list_invites` | id, list_id, invited_email (nullable), invited_by, created_at |
| `barcode_cache` | id, ean (unique), name, brand, stores (nullable comma-separated), created_at |

- `lists.updated_at` is bumped on every item write, member change, and list rename.
- `list_items.purchased_at` is `NULL` when unpurchased, set to `now()` on first purchase. The API exposes a derived `purchased: bool` computed field for backward compatibility.
- `list_invites.id` is the shareable invite token (UUID is unguessable — no separate token field).
- Invitations are opt-in: invitees must explicitly accept before gaining list access.

## Frontend

### Commands
Prefer `just` from the repo root (run `just` with no args to list all recipes). Direct npm commands when needed:
```bash
cd frontend
npm install --legacy-peer-deps  # ⚠️ required: vite-plugin-pwa@1.x doesn't declare Vite 8 peer support yet
npm run dev          # dev server (Vite)
npm run build        # production build
npm run preview      # preview production build
npm run test         # Vitest unit tests
npm run test:watch   # Vitest in watch mode
npm run test -- path/to/file.test.tsx  # run a single test file
npm run lint         # ESLint
# ⚠️ root tsconfig has files:[] — `npm run typecheck` always passes silently! Use instead:
node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

### PWA
The app is a Progressive Web App (`vite-plugin-pwa`). The service worker is active even in dev (`devOptions.enabled: true`). The generated `sw.js` in the build output is managed by Workbox — do not edit it directly.

### Dev auth bypass
Set `DEV_AUTH_BYPASS=true` in `backend/.env` and `VITE_DEV_USER_ID=seed-alice` (or `seed-bob` / `seed-carol`) in `frontend/.env` to skip Google Sign-In entirely during local development. The frontend sends `X-Dev-User-Id: <firebase_uid>` instead of a real token; the backend resolves the user directly from that header. **Never set `DEV_AUTH_BYPASS=true` in production.**

### Key conventions
- Mobile-first, card-based layout
- Sticky "Smart Input" bar fixed at the bottom of the screen
- Firebase SDK used directly in the frontend for Auth only
- All data fetched from the FastAPI backend via REST
- Short-poll `GET /lists/{list_id}/updated-at` every 5s; re-fetch items only when timestamp changes
- `FrequencySuggestionBanner` sits above the SmartInputBar and cycles through due suggestions every 6s; dismissals are persisted in `localStorage` (`cqs_dismissed_suggestions`) with a TTL computed by the backend
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

Price display throughout the app uses `formatPrice(amount, pricePer?)` from `frontend/src/lib/formatPrice.ts` — an `Intl.NumberFormat`-based formatter that renders locale-aware currency strings.

When `parsed.ean` is set, the input is in **EAN mode**: the regular parse preview is hidden, an EAN preview with a "Buscar" CTA is shown, and the add button is disabled. `ListScreen` holds an `EanLookupState` discriminated union (`idle | loading | found | error`) and passes `onEanSearch`, `eanLoading`, `eanError` to `SmartInputBar`.

A **clear button** (✕) replaces the camera scan button whenever the input has text.

### Purchased item rules
Purchased items (`item.purchased === true`) are **read-only** in the UI. Allowed: unchecking, deleting, viewing price history. Disallowed: rename, quantity/brand/store edits, adding/changing/removing price. `ItemCard` renders tags as `<span>` (not `<button>`) for purchased items and hides all "add" CTAs. `ItemActionSheet` hides the rename option. `PriceHistorySheet` hides the log-price button when `readOnly` is passed.

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
uv run uvicorn app.main:app --reload # dev server
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
