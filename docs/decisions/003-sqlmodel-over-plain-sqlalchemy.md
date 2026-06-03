# ADR-003: SQLModel as the ORM layer

**Status:** Accepted  
**Date:** 2024

## Context

The backend needs an ORM for PostgreSQL and a schema layer for FastAPI request/response validation. The two concerns are related — both describe the shape of the data — but are traditionally handled by separate libraries.

| Approach | Notes |
|---|---|
| **SQLAlchemy + Pydantic (separate)** | Industry standard; explicit boundary between ORM model and API schema |
| **SQLModel** | Tiangolo library built on top of SQLAlchemy + Pydantic; single class serves both roles |
| **Tortoise ORM** | Async-native ORM with Pydantic integration |
| **raw SQL + Pydantic** | Full control; no ORM abstraction |

## Decision

Use **SQLModel** as the single source of truth for both the database model and the API schema layer. Alembic handles migrations on top of SQLModel's table definitions.

## Rationale

**Eliminates the dual-model boilerplate.** With plain SQLAlchemy + Pydantic, every entity requires at least two classes: an ORM model and a Pydantic schema (often more: `Create`, `Update`, `Response` variants). SQLModel lets a single class participate in both roles, reducing the surface area for the models to drift apart.

**First-party FastAPI recommendation.** SQLModel is authored by the same developer as FastAPI and designed specifically for this use case. The integration is seamless and the patterns are documented alongside FastAPI docs.

**SQLAlchemy under the hood.** SQLModel is a thin wrapper; the full SQLAlchemy Core is accessible when needed. Alembic works unchanged against SQLModel table definitions.

**SQLite works out of the box for tests and local development.** Because SQLModel targets standard SQLAlchemy dialects, the test suite runs on SQLite in-memory (`StaticPool`) and developers can run the app locally against a SQLite file — no Postgres instance required. This keeps the feedback loop fast and local setup simple.

## Consequences

- **Accepted:** SQLModel lags behind SQLAlchemy releases. New SQLAlchemy features or bugfixes may not be available immediately.
- **Accepted:** Relationship loading (lazy vs. eager) requires explicit care — SQLModel's defaults can produce implicit N+1 queries if not watched.
- **Accepted:** The "one class, two roles" pattern has limits: complex response shapes that diverge significantly from the DB model still need separate Pydantic schemas.
- **Gained:** Significantly less boilerplate per entity; model and schema stay in sync by construction.
- **Watch:** If SQLModel maintenance stalls or a major SQLAlchemy version becomes incompatible, migrating to plain SQLAlchemy + Pydantic is mechanical but tedious.
