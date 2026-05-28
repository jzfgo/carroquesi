---
name: sync-docs
description: Use when a feature ships or before a release to verify CLAUDE.md and README.md reflect the current codebase
---

# Sync Docs

Keep CLAUDE.md and README.md accurate after features land. Run after any non-trivial implementation.

## Process

1. `git log --oneline` since the last doc-update commit to identify what shipped
2. Read changed files to understand scope
3. Work through the checklists below, editing inline
4. Commit: `chore: sync CLAUDE.md and README.md`

## CLAUDE.md Checklist

- **Project Overview** — does it name all core user-facing feature areas?
- **Architecture** — are all external services/SDKs listed (Firebase Auth, Firebase AI, etc.)?
- **Core Data Model** — does it list every table in `backend/app/db/models.py`?
- **Key conventions** — does it cover every major component/pattern in `frontend/src/components/` and `frontend/src/lib/`?
- **SmartInputBar sigil system** — are all active sigils (`+`, `#`, `@`, `$`/`€`, `|`) still accurate?
- **Backend project layout** — does it list all routers in `backend/app/routers/` and services in `backend/app/services/`?
- **Environment variables** — are backend and frontend env vars complete? Cross-check `frontend/.env.example` and `backend/app/core/config.py`.

## README.md Checklist

- **Intro** — does it mention all major user-facing features?
- **Architecture** — are all external service claims accurate?
- **Frontend env block** — does it match `frontend/.env.example` exactly (var names and presence)?
- **Backend env block** — does it match `backend/app/core/config.py` settings?
