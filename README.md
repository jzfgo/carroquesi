<p align="center">
  <img src="frontend/src/assets/mascot.png" alt="CarroQueSí mascot" width="160">
</p>

<h1 align="center">CarroQueSí</h1>

<p align="center"><em>Together we shop better</em></p>

<p align="center">
  <a href="https://github.com/jzfgo/carroquesi/releases"><img src="https://img.shields.io/github/v/tag/jzfgo/carroquesi?sort=semver&label=version&color=blue" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL_v3-blue.svg" alt="License: AGPL v3"></a>
  <a href="https://github.com/jzfgo/carroquesi/actions"><img src="https://github.com/jzfgo/carroquesi/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/python-3.13-blue" alt="Python">
  <img src="https://img.shields.io/badge/node-24-green" alt="Node">
</p>

A collaborative grocery shopping list. Multiple users share lists, mark items as purchased, and get smart product suggestions based on purchase history. Includes price logging with per-item history, barcode lookup, AI-powered receipt scanning, and running cost totals per shopping session.

## Architecture

```
carroquesi/
├── frontend/   # React + TypeScript (Vite) → Firebase Hosting
└── backend/    # Python + FastAPI + PostgreSQL → Cloud Run
```

- **Auth & AI:** Firebase handles Google Sign-In and AI-powered receipt parsing (Gemini via Firebase AI SDK). The frontend sends a Firebase ID token on every request; the backend validates it via the Firebase Admin SDK.
- **Data:** All CRUD goes through the FastAPI backend. No Firestore.
- **Real-time sync:** Short-polling — the frontend hits `GET /lists/{id}/updated-at` every 5s and re-fetches items when the timestamp changes.

## Architecture Decisions

Significant tradeoffs are documented in [`docs/decisions/`](docs/decisions/) (e.g. sync strategy, auth model, ORM choice, AI integration, feature flags, etc.).

## Prerequisites

| Tool                                                                         | Purpose                                                              | Install                                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| [direnv](https://direnv.net/)                                                | Environment variable auto-loader for shells                          | `brew install direnv`                                       |
| [just](https://just.systems)                                                 | Task runner (replaces Make)                                          | `brew install just`                                         |
| [lefthook](https://lefthook.dev/)                                            | Git hooks (lint, format, secrets on commit; changelog check on push) | `brew install lefthook`                                     |
| [gitleaks](https://github.com/gitleaks/gitleaks)                             | Secret scanning in the pre-commit hook                               | `brew install gitleaks`                                     |
| [overmind](https://github.com/DarthSim/overmind)                             | Process manager (runs frontend + backend together)                   | `brew install overmind`                                     |
| [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) | Node version manager — project pins Node via `.nvmrc`                | `brew install fnm`                                          |
| [uv](https://docs.astral.sh/uv/)                                             | Python package manager                                               | `brew install uv`                                           |
| Python 3.13                                                                  | Backend                                                              | managed by `uv` automatically                               |
| [git-cliff](https://git-cliff.org)                                           | Changelog generation (`just changelog`)                              | `brew install git-cliff`                                    |
| Firebase project                                                             | Auth                                                                 | see [Firebase console](https://console.firebase.google.com) |

## Setup

### 1. Environment files

**Global** — customize local servers (protocol, hostname, and port)
**Backend** — copy and fill in `backend/.env` (check `backend/.env.example` for reference):
**Frontend** — copy and fill in `frontend/.env` (check `frontend/.env.example` for reference):

### 2. Install dependencies

```bash
just install
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

And in `frontend/.env`:

```
VITE_DEV_USER_ID=seed-alice   # or seed-bob / seed-carol
```

The frontend skips Firebase and sends `X-Dev-User-Id` instead of a real token. **Never enable `DEV_AUTH_BYPASS` in production.**

### 6. Start dev servers

```bash
just dev
```

This runs both servers via overmind (URLs are customizable in `.envrc`):

| Process  | URL                        |
| -------- | -------------------------- |
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8000      |
| API docs | http://localhost:8000/docs |

## Commands

Run `just` (no arguments) to list all available recipes.

## Deployment

| Layer    | Target                    |
| -------- | ------------------------- |
| Frontend | Firebase Hosting          |
| Backend  | Google Cloud Run (Docker) |
