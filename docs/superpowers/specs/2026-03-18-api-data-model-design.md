# CarroQueSí — API & Data Model Design

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

CarroQueSí is a collaborative grocery shopping list web app. Multiple users share lists, add and mark items, and get smart product suggestions based on purchase history.

This document defines the data model and REST API for the FastAPI backend.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Data layer | FastAPI + PostgreSQL | User wants to learn Python backend development; Firebase kept for auth only |
| ORM | SQLModel + Alembic | Canonical FastAPI approach; migrations as a learning exercise |
| Real-time sync | Short polling | Cloud Run is stateless; polling is simple and sufficient for a shopping list |
| Auth | Firebase Auth (Google Sign-In) | Delegates OAuth complexity; backend validates Firebase JWT tokens |
| Data model | Flat items (no products table) | Simpler schema; product suggestions via DISTINCT query on item history |
| Scope | MVP only | No price tracking, OCR, or barcode scanning; schema migrations as the path for future additions |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript (Vite) → Firebase Hosting |
| Auth | Firebase Auth (Google Sign-In) |
| Backend | FastAPI + SQLModel → Cloud Run |
| Database | PostgreSQL (Cloud SQL or Supabase) |
| Migrations | Alembic |

---

## Data Model

### `users`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| firebase_uid | VARCHAR UNIQUE NOT NULL | From Firebase Auth token |
| display_name | VARCHAR | |
| email | VARCHAR UNIQUE NOT NULL | |
| photo_url | VARCHAR | Nullable |
| created_at | TIMESTAMP | |

### `lists`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR NOT NULL | |
| owner_id | UUID FK → users | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP NOT NULL | Default NOW(). Bumped on any item, member, or rename change |

### `list_members` *(junction table)*

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| list_id | UUID FK → lists | |
| user_id | UUID FK → users | |
| created_at | TIMESTAMP | |
| UNIQUE(list_id, user_id) | | Prevents duplicate membership |

### `list_invites`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| list_id | UUID FK → lists | |
| invited_email | VARCHAR | Nullable. Email of the invitee (optional — invite can also be link-only) |
| invited_by | UUID FK → users | Owner who sent the invite |
| created_at | TIMESTAMP | |
| UNIQUE(list_id, invited_email) | | Prevents duplicate pending invites for the same email (nullable emails are exempt) |

Each invite has a shareable link using its UUID: `https://carroquesi.app/invite/{invite_id}`. The UUID is random and unguessable — no separate token field is needed. `invited_email` is optional: the owner can invite by email, by sharing the link, or both.

When `POST /auth/sync` is called for a new user, the backend checks `list_invites` for any pending invites matching their email so the frontend can surface them immediately after sign-up. Invites are only converted to membership when the user explicitly accepts.

### `list_items`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| list_id | UUID FK → lists | |
| name | VARCHAR NOT NULL | |
| quantity | VARCHAR | Free text (e.g. "2", "500g", "half a pack") |
| brand | VARCHAR | Nullable |
| variety | VARCHAR | Nullable |
| store | VARCHAR | Nullable |
| purchased | BOOLEAN | Default false |
| added_by | UUID FK → users | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Notes:**
- The owner is automatically added as a member of their own list on creation (application logic).
- `quantity` is free text to avoid a rigid number+unit schema that doesn't match how people actually shop.
- No `password_hash` — authentication is fully delegated to Firebase Auth.

---

## API

All endpoints require `Authorization: Bearer <firebase_id_token>`. A FastAPI dependency (`get_current_user`) validates the token via the Firebase Admin SDK and resolves the internal `User` record.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/sync` | Called after Firebase login. Upserts the user in Postgres. Returns the internal user record. |

### Lists

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/lists` | Any member | All lists where the caller is owner or member. |
| `POST` | `/lists` | Authenticated | Create a new list. Caller becomes owner and first member. |
| `GET` | `/lists/{list_id}` | Member | List details. |
| `PATCH` | `/lists/{list_id}` | Owner | Rename the list. Bumps `lists.updated_at`. |
| `DELETE` | `/lists/{list_id}` | Owner | Delete list and all its items. |

### Members

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/lists/{list_id}/members` | Member | All members of the list. |
| `POST` | `/lists/{list_id}/members` | Owner | Invite a user by email. Creates a pending `list_invites` row (whether or not the email exists in `users` yet). Membership is only created once the invitee accepts. Bumps `lists.updated_at`. |
| `DELETE` | `/lists/{list_id}/members/{user_id}` | Owner or self | Remove a member. Owner can remove anyone; members can remove themselves. Bumps `lists.updated_at`. |

### Invites

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/invites` | Authenticated | All pending invites for the caller (matched by email). |
| `GET` | `/invites/{invite_id}` | Public | Preview an invite (list name, inviter name). No auth required — used to show invite details before the user logs in. |
| `POST` | `/invites/{invite_id}/accept` | Authenticated | Accept an invite. Creates the `list_members` row and deletes the invite. If `invited_email` is set, the caller's email must match — returns 403 otherwise. If `invited_email` is null (link invite), any authenticated user may accept. |
| `DELETE` | `/invites/{invite_id}` | Invitee or list owner | Decline or cancel an invite. Deletes the invite row. Same email-match rule applies for invitees: if `invited_email` is set, only the matching user or the list owner can delete it. |

### Items

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/lists/{list_id}/items` | Member | All items. Supports `?sort=name\|store\|brand`. Sort is ascending only for MVP. |
| `POST` | `/lists/{list_id}/items` | Member | Add an item. |
| `PATCH` | `/lists/{list_id}/items/{item_id}` | Member | Update any field (name, quantity, brand, variety, store, purchased). |
| `DELETE` | `/lists/{list_id}/items/{item_id}` | Member | Delete an item. |

### Suggestions

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/suggestions?q={query}` | Authenticated | Up to 10 distinct item names matching the query prefix, from all lists the caller is **currently a member of**. Response includes last-used brand/variety/store as hints. Suggestions are scoped to current membership — items from lists the user was removed from are excluded. |

### Polling

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/lists/{list_id}/updated-at` | Member | Returns `{updated_at: <timestamp>}`. Frontend polls this every 5 seconds and re-fetches items only when the value changes. |

---

## Auth Flow

1. User clicks "Sign in with Google" — Firebase Auth handles OAuth.
2. Frontend receives a Firebase ID token.
3. Frontend calls `POST /auth/sync` with the token — backend validates via Firebase Admin SDK, upserts the user in Postgres, returns the internal user record.
4. Every subsequent API call sends `Authorization: Bearer <firebase_id_token>`.
5. A FastAPI dependency (`get_current_user`) validates the token and injects the resolved `User` db record into route handlers.

---

## Polling Flow

1. When viewing a list, the frontend polls `GET /lists/{list_id}/updated-at` every 5 seconds.
2. If `updated_at` changed since the last fetch, it re-fetches `GET /lists/{list_id}/items`.
3. Any write operation (add/update/delete item, add/remove member) bumps `lists.updated_at` in the same database transaction.

---

## Backend Project Layout

```
backend/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py        # Settings via pydantic-settings
│   │   └── firebase.py      # Firebase Admin SDK init
│   ├── db/
│   │   ├── session.py       # SQLModel engine + get_session dependency
│   │   └── models.py        # SQLModel table models
│   ├── routers/
│   │   ├── auth.py
│   │   ├── lists.py
│   │   ├── members.py
│   │   ├── items.py
│   │   ├── invites.py
│   │   └── suggestions.py
│   ├── schemas/             # Pydantic request/response models
│   └── dependencies.py      # get_current_user, get_list_member, etc.
└── alembic/                 # Migrations
```

---

## Out of Scope (MVP)

- Price tracking and price history
- Receipt scanning (OCR)
- Barcode scanning
- Purchase frequency auto-suggestions (beyond the basic DISTINCT query)

These features will be added via Alembic migrations as the project evolves.
