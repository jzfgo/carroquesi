# ADR-002: Firebase for auth only; all data in PostgreSQL via FastAPI

**Status:** Accepted  
**Date:** 2024

## Context

CarroQueSí uses Google Sign-In for authentication. Firebase is the natural host for that. However, Firebase also offers Firestore (document database) and Realtime Database for storing and syncing app data — which would make a "full Firebase" stack viable without a separate backend.

The main candidates were:

| Approach | Notes |
|---|---|
| **Firebase Auth + Firestore** | All-Firebase stack; no separate backend needed |
| **Firebase Auth + FastAPI + PostgreSQL** | Firebase only for identity; all data through a REST API |
| **Firebase Auth + FastAPI + Firestore** | Hybrid: custom API but document storage |

## Decision

Use Firebase exclusively for authentication (Google Sign-In + JWT issuance). All application data lives in PostgreSQL, accessed through a FastAPI backend. The frontend sends `Authorization: Bearer <token>`; the backend validates it with the Firebase Admin SDK and resolves the user from the DB.

## Rationale

**Relational data fits a relational model.** Lists, members, items, invites, price history, and receipt scans have clear foreign-key relationships and benefit from joins, transactions, and constraints. Modeling this in Firestore requires denormalization and either duplicated data or costly client-side joins.

**Business logic belongs in one place.** Rules like "bump `updated_at` on item writes", "enforce same-day guard on price deletion", and "require explicit invite acceptance before granting access" are easy to enforce in FastAPI route handlers and are testable in isolation. In a Firestore-only stack, these would live in Security Rules or Cloud Functions — harder to test, harder to reason about.

**SQL migrations are a first-class workflow.** Alembic gives us versioned, reviewable schema changes. Firestore schema evolution is implicit and harder to audit.

**Firebase Auth is genuinely excellent for Google Sign-In** and has good SDKs. There's no reason to replace it. The JWT it issues is a standard bearer token the backend can validate without a network call (after the first public-key fetch).

**Avoiding Firestore keeps the data model single-source.** A hybrid approach (FastAPI + Firestore) would split state across two stores, complicating consistency guarantees and local dev setup.

## Consequences

- **Accepted:** Backend infrastructure to manage (Docker, Cloud Run, database).
- **Accepted:** `is_admin` cannot be stored in the DB — it's a Firebase custom claim read from the JWT, making it a transient attribute on the `User` model.
- **Gained:** Full SQL expressiveness, transactional writes, standard migration tooling, and a single authoritative data store.
- **Gained:** Backend is independently testable with SQLite in-memory — no Firebase emulator needed for the test suite.
- **Watch:** If offline-first or conflict-free sync ever becomes a requirement, revisit whether Firestore's client SDKs are worth the tradeoffs.
