# ADR-008: Database backup and restore policy

**Status:** Accepted
**Date:** 2026-07-23

## Context

Production Postgres runs on **Neon** — project `carroquesi` /
`plain-dream-30513527`, org `org-tiny-meadow-05489456`, `aws-eu-central-1`,
PG 17, primary branch `production` (`br-little-salad-ag3wqaqs`). Note that
nothing in this repository names the provider; the backend only reads
`DATABASE_URL`.

Until 2026-07-23 there was no backup policy at all (JAV-23, open since
2026-07-01; flagged in the 2026-06-15 review as infra risk accumulating quietly
while the waitlist was live).

On 2026-07-23 the project moved to Neon's **Launch** plan. That upgrade by itself
changed nothing about recoverability, which is the trap worth recording: **plan
tiers govern the maximum allowed retention, not the configured value.** Measured
immediately after the upgrade, `history_retention_seconds` was still `21600` —
6 hours, the Free-plan value the project had been carrying since March. The
ceiling had moved from 6 hours to 7 days; the setting had not. Both mechanisms
below had to be turned on explicitly.

## Decision

Two layers, deliberately differing in both resolution and horizon.

**1. Instant restore (PITR) — continuous, 7 days.**
`history_retention_seconds = 604800`, the Launch maximum. Automatic, nothing to
schedule; Neon retains WAL over its copy-on-write storage so any point in the
window is reachable. Billed $0.20/GB-month of change history.

**2. Scheduled snapshots — daily at 04:00 UTC, each retained 30 days.**
On `production`: `{"frequency":"daily","hour":4,"retention_seconds":2592000}`.
Billed $0.09/GB-month. 04:00 UTC sits clear of the Friday 02:00–03:00
maintenance window.

**3. One manual snapshot as a permanent floor.**
`snap-square-grass-agf7yzd2` ("production at 2026-07-23 07:50:30 UTC"), no
expiry. Manual snapshots count against the 100-snapshot project limit;
scheduled ones do not.

Resulting objectives:

| Age of the data you need back | RPO | Mechanism |
| --- | --- | --- |
| 0–7 days | ~0 (any second) | Instant restore |
| 7–30 days | ≤ 24 hours | Nearest daily snapshot |
| > 30 days | no coverage | (manual pin only) |

**RTO is minutes.** Neon restores are copy-on-write branch operations, not data
copies, so restore time is near-constant rather than proportional to database
size — see the runbook below.

## Rationale

- **Two layers, because they cover different failure modes.** PITR answers "we
  know roughly when it broke" — restore to 14:32:07, just before the bad
  migration. Snapshots answer "we found out three weeks later" — a subtle bug, a
  slow data-quality regression, a deletion nobody noticed. The first needs fine
  granularity over a short window; the second needs coarse granularity over a
  long one. Neither substitutes for the other.
- **Snapshot retention (30d) deliberately exceeds the PITR window (7d).** A
  snapshot that expires inside the PITR window is pure cost for zero additional
  coverage — the continuous window already reaches every point it pins. The
  snapshot series exists precisely to extend the horizon past where continuous
  retention stops.
- **The PITR window is maxed rather than tuned.** The database is ~33 MB and
  Neon bills change history per GB-month, so the difference between 1 day and
  7 days is rounding error. There is no reason to pick a middle value at this
  scale.

## Alternatives considered

- **Snapshot retention matched to the 7-day window** — rejected: adds cost and
  no coverage, per the rationale above.
- **PITR alone, no snapshots** — rejected: caps total recoverability at 7 days,
  which is short for corruption discovered late. Most of what a backup policy
  protects against is *slow* discovery.
- **Neon Scale plan for a 30-day PITR window** — rejected: buys continuous
  granularity across the whole 30 days, which is far more than needed for a
  grocery app, at a materially higher plan cost. Daily granularity in the 7–30
  day range is sufficient.
- **`pg_dump` to object storage on a schedule** — deferred rather than rejected;
  see below. It is the natural answer to the one risk this policy does not
  cover, but it introduces a second system to own, monitor, and test.

## Deferred: off-provider copies

Every artifact above lives inside the same Neon account. This policy therefore
covers **data damage** (bad migration, bad deploy, accidental deletion, slow
corruption) and does **not** cover **account loss or compromise** — a billing
lapse, a credential compromise, or provider-side account action would take the
backups with the database.

This is an accepted, deliberate gap at current scale, not an oversight. Revisit
when any of these becomes true:

- the app carries data that would be materially painful to lose (real user
  purchase history at a scale where re-entry isn't feasible), or
- the waitlist converts to a user base outside the author's immediate circle, or
- anything in the project acquires a compliance or contractual obligation.

The likely answer at that point is a periodic `pg_dump` to storage under a
different provider and different credentials — the "different credentials" part
being the whole point.

## Verification

**A backup that has never been restored is not a backup.** Verified end to end
on 2026-07-23: snapshot `snap-square-grass-agf7yzd2` restored into a throwaway
branch, then compared against production by direct SQL against each branch.

| | restored branch | production |
| --- | --- | --- |
| `alembic_version` | `40e24ab12eed` | `40e24ab12eed` |
| users / lists / list_members | 4 / 5 / 6 | 4 / 5 / 6 |
| `list_items` | 434 | 434 |
| `receipt_scans` | 54 | 54 |

The FastAPI backend was additionally booted with `DATABASE_URL` pointed at the
restored branch and served `/health` and a DB-backed route successfully. That
check corroborates the app's connection path but is *not* the proof of restore
integrity — it cannot distinguish the restored branch from production, since
both carry the same data. The SQL comparison above is the load-bearing evidence.

**Re-verify** on any major Postgres version upgrade, any change to the ORM or
migration tooling, and otherwise at least annually. Verifying once proves it
worked once, on that day, against that schema.

## Runbook

Requires the `neonctl` CLI, authenticated (`neonctl auth`). `PROJECT` below is
`plain-dream-30513527`.

```bash
# What exists right now
neonctl snapshots list --project-id $PROJECT
neonctl snapshots schedule get --project-id $PROJECT --branch production
neonctl api /projects/$PROJECT | grep history_retention

# Take an ad-hoc snapshot before something risky (a migration, a bulk update)
neonctl snapshots create --project-id $PROJECT --branch production

# Pin a PAST point as a permanent snapshot, before the 7-day window expires.
# This is the move when you discover a problem on day 6: it converts a
# perishable PITR point into a durable one and stops the clock.
neonctl snapshots create --project-id $PROJECT --branch production \
  --timestamp 2026-07-20T09:15:00Z

# Restore to inspect — creates a NEW branch, production is untouched
neonctl snapshots restore <snapshot-id> --project-id $PROJECT --name restore-test

# Verify before trusting it: compare against production
#   psql "$(neonctl connection-string restore-test --project-id $PROJECT)"

# Only if the restore is meant to replace production:
neonctl snapshots restore <snapshot-id> --project-id $PROJECT \
  --target-branch production --finalize

# Clean up
neonctl branches delete <branch-id> --project-id $PROJECT
```

Two notes that matter under pressure:

- **`restore` without `--finalize` is non-destructive.** It creates a separate
  branch and leaves it un-finalized so you can inspect it first. Nothing touches
  production until `--finalize` (or a later `neonctl snapshots finalize`).
  Always inspect before finalizing.
- **Settings are not on `neonctl projects update`.** The history window is
  reachable only through the raw API passthrough:
  `neonctl api /projects/$PROJECT -X PATCH -d '{"project":{"history_retention_seconds":604800}}'`.
  The Neon MCP plugin cannot change it either — its write surface is
  projects/branches/SQL only.

## Consequences

- Recoverability is now a configured, measured property rather than an
  assumption. The settings are readable at any time via the runbook's first
  block — do that rather than inferring from the plan tier, which is what made
  this ADR necessary.
- Backup cost scales with database size and rate of change, both currently
  negligible (~33 MB). If either grows by orders of magnitude, revisit the
  7-day window and the 30-day snapshot retention as cost levers.
- The `production` branch is currently unprotected (`protected: false`). Neon
  branch protection guards against accidental delete/reset and gates
  `allowed_ips.protected_branches_only`. Out of scope for this ADR but tracked
  as adjacent hardening.
- This policy assumes a single production branch. Introducing a second
  long-lived branch (a staging environment on the same project) would need its
  own schedule decision — schedules are per-branch.
