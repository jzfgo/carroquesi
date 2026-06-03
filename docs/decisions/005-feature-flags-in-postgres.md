# ADR-005: Per-user feature flags stored in PostgreSQL

**Status:** Accepted  
**Date:** 2024

## Context

We needed a way to gate new features for specific users during rollout — initially for AI receipt scanning. Options ranged from a managed third-party service to a simple in-house solution.

| Approach | Notes |
|---|---|
| **LaunchDarkly / Unleash / Flagsmith** | Managed service; UI dashboard, percentage rollouts, targeting rules |
| **Environment variable flags** | Simple; affects all users equally; requires redeploy to change |
| **Feature flags in PostgreSQL** | Per-user overrides stored in DB; managed via CLI |
| **Firebase Remote Config** | Client-side config; already in the Firebase stack |

## Decision

Store per-user feature flag overrides in a `user_features` table in PostgreSQL. A registry in `backend/app/services/feature_flags.py` defines all known flags and their defaults. Flags are granted or revoked via `just backend feature <uid> <flag> on|off|reset`.

## Rationale

**Per-user granularity without a third-party dependency.** The primary use case is "enable this feature for user X during beta." A simple DB table + registry handles this with zero new infrastructure.

**Third-party services are overkill for this scale.** LaunchDarkly and similar tools add real value at scale (percentage rollouts, A/B testing, analytics). At CarroQueSí's current scale, the operational overhead (account management, SDK integration, cost) outweighs the benefits.

**Environment variables can't target individual users.** They apply globally and require a redeploy to change — too coarse-grained for a beta rollout to specific testers.

**Firebase Remote Config is client-side.** It would require the frontend to gate features, which means the backend can't enforce the gate independently. We want the backend to be authoritative on what a user can access.

**The registry pattern keeps flags auditable.** All known flags and their defaults live in one place (`REGISTRY` in `feature_flags.py`). Adding a flag is one `FlagDef` entry. Unknown flag names in `user_features` are inert — they don't cause errors, they just have no effect.

## Consequences

- **Accepted:** No UI dashboard — flag management is CLI-only (`just backend feature`).
- **Accepted:** No percentage rollouts or targeting rules — flags are binary per user.
- **Accepted:** `user_features.feature` values must match registry keys; orphaned rows are silently ignored rather than erroring.
- **Gained:** Zero new dependencies; works entirely within the existing Postgres + FastAPI stack.
- **Gained:** Flags are testable in the standard test suite (SQLite in-memory).
- **Watch:** If gradual percentage rollouts or a non-technical admin UI become a requirement, migrating to a managed service (or adding a simple admin API endpoint) is the natural next step.
