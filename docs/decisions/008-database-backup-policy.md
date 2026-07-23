# ADR-008: Database backups

**Status:** Accepted
**Date:** 2026-07-23

## Context

The app is Postgres-host-agnostic — `DATABASE_URL` is the backend's entire
contract with the database, and no code path assumes a provider. The canonical
deployment happens to run on Neon. Nothing here is a requirement for running the
app; self-hosters should arrange their own backups.

## Decision

Backups are enabled on the canonical deployment:

- **Instant restore (PITR):** 7 days — `history_retention_seconds = 604800`
- **Daily snapshots:** 04:00 UTC, retained 30 days

Daily snapshots are retained longer than the PITR window on purpose. A snapshot
that expires inside the continuous window adds no coverage, since PITR already
reaches every point it pins.

One gotcha worth recording, because it cost time: **upgrading the Neon plan
raises the maximum allowed retention, not the configured value.** After the
upgrade the window was still sitting at the old plan's default and had to be set
explicitly.

## Restore

`neonctl snapshots restore <snapshot-id> --project-id <project>` restores into a
**new branch** — production is untouched until you pass `--finalize` (or run
`neonctl snapshots finalize` later). Inspect first, then cut over.

Verified end to end on 2026-07-23: a snapshot was restored to a scratch branch,
its row counts and `alembic_version` matched production exactly, and the backend
ran against it.

See `neonctl snapshots --help` for the full command surface.
