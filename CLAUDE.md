# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
| `list_items` | id, list_id, name, quantity, brand, stores (JSON array), purchased, added_by, created_at, updated_at |
| `list_invites` | id, list_id, invited_email (nullable), invited_by, created_at |
| `barcode_cache` | id, ean (unique), name, brand, stores (nullable comma-separated), created_at |

- `lists.updated_at` is bumped on every item write, member change, and list rename.
- `list_invites.id` is the shareable invite token (UUID is unguessable — no separate token field).
- Invitations are opt-in: invitees must explicitly accept before gaining list access.

## Frontend

### Commands
```bash
cd frontend
npm install --legacy-peer-deps  # ⚠️ required: vite-plugin-pwa@1.x doesn't declare Vite 8 peer support yet
npm run dev          # dev server (Vite)
npm run build        # production build
npm run preview      # preview production build
npm run test         # Vitest unit tests
npm run test:watch   # Vitest in watch mode
npm run lint         # ESLint
npm run typecheck    # WARNING: root tsconfig has files:[] — always passes silently! Use instead:
npx tsc -p tsconfig.app.json --noEmit  # actual typecheck
```

### PWA
The app is a Progressive Web App (`vite-plugin-pwa`). The service worker is active even in dev (`devOptions.enabled: true`). The generated `sw.js` in the build output is managed by Workbox — do not edit it directly.

### Key conventions
- Mobile-first, card-based layout
- Sticky "Smart Input" bar fixed at the bottom of the screen
- Firebase SDK used directly in the frontend for Auth only
- All data fetched from the FastAPI backend via REST
- Short-poll `GET /lists/{list_id}/updated-at` every 5s; re-fetch items only when timestamp changes

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
│   │   └── firebase.py      # Firebase Admin SDK init + verify_id_token()
│   ├── db/
│   │   ├── session.py       # SQLModel engine + get_session dependency
│   │   └── models.py        # SQLModel table models
│   ├── routers/
│   │   ├── auth.py          # POST /auth/sync
│   │   ├── lists.py         # GET/POST/PATCH/DELETE /lists[/{id}]
│   │   ├── members.py       # GET/POST/DELETE /lists/{id}/members[/{user_id}]
│   │   ├── items.py         # GET/POST/PATCH/DELETE /lists/{id}/items[/{id}]
│   │   ├── invites.py       # GET/POST/DELETE /invites[/{id}[/accept]]
│   │   ├── suggestions.py   # GET /suggestions, GET /lists/{id}/updated-at
│   │   ├── barcode.py       # GET /barcode/{ean} — OpenFoodFacts lookup + local cache
│   │   └── share.py         # GET /i/{invite_id} — OG meta-tag preview page for invite links
│   ├── schemas/             # Pydantic request/response models (one file per router)
│   └── dependencies.py      # get_current_user, require_member, require_owner
└── alembic/                 # Migrations
```

### Environment variables
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carroquesi
FIREBASE_CREDENTIALS_PATH=firebase-credentials.json
ALLOWED_ORIGINS=["http://localhost:5173"]
```

## Infrastructure

- Firebase project config lives in `frontend/src/lib/firebase.ts` (Auth only — no Firestore, no Storage)
- Environment variables go in `.env` files — never committed
- Cloud Run service URL stored as an env var in the frontend for API calls

## Out of Scope

- Price tracking and receipt scanning (OCR)
- Purchase frequency auto-suggestions (beyond the basic DISTINCT query on item history)
