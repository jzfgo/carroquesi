# CarroQueSí

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

A collaborative grocery shopping list web app. Multiple users share lists, mark items as purchased, and get smart product suggestions based on purchase history. Includes price logging with per-item history, barcode lookup, AI-powered receipt scanning, and running cost totals per shopping session.

## Architecture

```
carroquesi/
├── frontend/   # React + TypeScript (Vite) → Firebase Hosting
└── backend/    # Python + FastAPI + PostgreSQL → Cloud Run
```

- **Auth & AI:** Firebase handles Google Sign-In and AI-powered receipt parsing (Gemini via Firebase AI SDK). The frontend sends a Firebase ID token on every request; the backend validates it via the Firebase Admin SDK.
- **Data:** All CRUD goes through the FastAPI backend. No Firestore.
- **Real-time sync:** Short-polling — the frontend hits `GET /lists/{id}/updated-at` every 5s and re-fetches items when the timestamp changes.

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| [just](https://just.systems) | Task runner (replaces Make) | `brew install just` |
| [overmind](https://github.com/DarthSim/overmind) | Process manager (runs frontend + backend together) | `brew install overmind` |
| [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) | Node version manager — project pins Node via `.nvmrc` | `brew install fnm` |
| [uv](https://docs.astral.sh/uv/) | Python package manager | `brew install uv` |
| Python 3.13 | Backend | managed by `uv` automatically |
| [git-cliff](https://git-cliff.org) | Changelog generation (`just changelog`) | `brew install git-cliff` |
| Firebase project | Auth | see [Firebase console](https://console.firebase.google.com) |

## Setup

### 1. Environment files

**Backend** — copy and fill in `backend/.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carroquesi
FIREBASE_CREDENTIALS_PATH=firebase-credentials.json
ALLOWED_ORIGINS=["http://localhost:5173"]
# DEV_AUTH_BYPASS=true   # optional — skips Firebase token validation locally (see below)
```

**Frontend** — copy and fill in `frontend/.env.local`:
```
VITE_BACKEND_URL=http://localhost:8000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_RECAPTCHA_SITE_KEY=...   # Firebase App Check (reCAPTCHA v3) — required in production for AI receipt scanning
# VITE_DEV_USER_ID=seed-alice   # optional — pair with DEV_AUTH_BYPASS (see below)
```

### 2. Install dependencies

```bash
just frontend install
just backend install
```

### 3. Database

SQLite works for local development — no Docker required. Set `DATABASE_URL` in `backend/.env` to:

```
DATABASE_URL=sqlite:///./carroquesi.db
```

Use Postgres in production (or locally if you prefer):

```bash
docker run -d --name carroquesi-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=carroquesi \
  -p 5432:5432 postgres:16
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/carroquesi
```

### 4. Run migrations

```bash
just backend migrate
```

### 5. Seed test data (optional)

Populate the local database with realistic test data (3 users, 4 lists, 128 items with price history across 6 stores):

```bash
just seed
```

To log in as a seed user without a real Google account, set in `backend/.env`:
```
DEV_AUTH_BYPASS=true
```
And in `frontend/.env.local`:
```
VITE_DEV_USER_ID=seed-alice   # or seed-bob / seed-carol
```
The frontend skips Firebase and sends `X-Dev-User-Id` instead of a real token. **Never enable `DEV_AUTH_BYPASS` in production.**

### 6. Start dev servers

```bash
just dev
```

This runs both servers via overmind (each with a labeled, color-coded stream):

| Process | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

## Commands

Run `just` (no arguments) to list all available recipes.

### Root

| Command | Description |
|---------|-------------|
| `just setup` | Wire git hooks (run once after cloning) |
| `just dev` | Start frontend + backend via overmind |
| `just test` | Run all tests (frontend then backend) |
| `just ci` | Typecheck + lint (frontend), tests (backend) |
| `just changelog` | Prepend unreleased commits to `CHANGELOG.md` |
| `just ss` | Show processes listening on ports 5173 / 8000 |
| `just sk` | Kill processes on ports 5173 / 8000 |

### Frontend (`just frontend <recipe>`)

| Recipe | Description |
|--------|-------------|
| `install` | `npm install` |
| `dev` | Vite dev server |
| `build` | Production build |
| `preview` | Preview production build |
| `test` | Vitest unit tests |
| `test-watch` | Vitest in watch mode |
| `lint` | ESLint |
| `typecheck` | `tsc -p tsconfig.app.json` (the root tsconfig has `files: []` and always passes silently — use this instead) |

### Backend (`just backend <recipe>`)

| Recipe | Description |
|--------|-------------|
| `install` | `uv sync` |
| `dev` | FastAPI dev server (hot-reload) |
| `test` | `pytest` |
| `test-file <path>` | Run a single test file |
| `add <package>` | Add a dependency via uv |
| `migrate` | `alembic upgrade head` |
| `migration <name>` | Generate a new migration |
| `migration-status` | Show current migration revision |
| `migration-rollback` | Downgrade one revision |
| `seed` | Populate local DB with test data |

## Deployment

| Layer | Target |
|-------|--------|
| Frontend | Firebase Hosting |
| Backend | Google Cloud Run (Docker) |

The backend Docker image runs `alembic upgrade head` on startup before launching the server.
