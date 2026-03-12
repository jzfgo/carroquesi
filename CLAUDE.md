# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CarroQueSí** — a collaborative, real-time grocery shopping list web app. Multiple users share lists, mark items as purchased, and get smart product suggestions. Nice-to-have features: receipt scanning (OCR) and purchase frequency analysis.

## Architecture

```
carroquesi/
├── frontend/   # React + TypeScript (Vite)
└── backend/    # Python + FastAPI (Dockerized → Cloud Run)
```

**Firebase** handles the real-time layer:
- **Firestore** — primary database + real-time sync between clients
- **Firebase Auth** — Google Social Login
- **Firebase Storage** — image uploads (receipt scanning)

The **FastAPI backend** handles heavy computation only: OCR processing and purchase frequency algorithms. It is not the primary data path — Firestore real-time listeners handle live updates directly in the frontend.

**Deployment:** Frontend → Firebase Hosting, Backend → Google Cloud Run (Docker).

## Core Data Model

| Entity | Key fields |
|--------|-----------|
| `users` | uid, displayName, email, photoURL |
| `lists` | id, name, ownerId, memberIds[], createdAt |
| `products` | id, name, brand, variety, store, imageUrl |
| `listItems` | id, listId, productId, quantity, unit, purchased, addedBy |

## Frontend

### Commands
```bash
cd frontend
npm install          # install dependencies
npm run dev          # dev server (Vite)
npm run build        # production build
npm run preview      # preview production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

### Key conventions
- Mobile-first, card-based layout
- Sticky "Smart Input" bar fixed at the bottom of the screen
- Firestore real-time listeners (`onSnapshot`) drive UI state — avoid redundant REST calls for data already in Firestore
- Firebase SDK used directly in the frontend for Auth, Firestore, and Storage

## Backend

### Commands
```bash
cd backend
uv sync                              # install / sync dependencies
uv run uvicorn app.main:app --reload # dev server
uv run pytest                        # run all tests
uv run pytest tests/path/to/test.py  # run single test file
uv add <package>                     # add a dependency
```

### Key conventions
- FastAPI app entrypoint: `backend/app/main.py`
- Only handles compute-heavy tasks (OCR, frequency analysis) — not general CRUD
- Communicates with Firestore via the Firebase Admin SDK (`firebase-admin` Python package)
- Dockerized: `backend/Dockerfile` → deployed to Cloud Run

## Firebase / Infrastructure

- Firebase project config lives in `frontend/src/lib/firebase.ts` (initialized once, exported as `db`, `auth`, `storage`)
- Environment variables (API keys, project IDs) go in `.env` files — never committed
- Cloud Run service URL stored as an env var in the frontend for backend API calls
