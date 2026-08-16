# ADR-016: Staging environment and the develop branch

**Status:** Accepted
**Date:** 2026-08-16

## Context

Final testing happened in production, which stops being acceptable as real
users join. Several features (push, App Check, signed GCS URLs, the `/i/**`
invite rewrite) only exist in a remote deployment, so a local-only check can
never cover them.

## Decision

A staging deployment fed by a `develop` branch:

- Feature PRs squash into `develop`; every push deploys staging.
- Production ships via a release PR `develop` → `main`, also squashed; `main`
  holds one commit per release. After the merge, `develop` is force-reset onto
  `main` — lossless (identical trees at that moment) and mandatory: it keeps
  the merge-base fresh so release diffs stay accurate and hotfixes on `main`
  do not produce phantom conflicts.
- Same Firebase project, second Hosting site (`cqs-stg`). The `/i/**` rewrite
  can only target Cloud Run in the Hosting site's own project, which rules out
  a parallel Firebase project cheaply; auth pool, FCM sender, VAPID key,
  App Check key, and Admin credentials are shared. Isolation lives where it
  matters: separate Cloud Run service, separate Neon branch, separate receipts
  bucket (list deletion purges bucket prefixes — sharing one would let staging
  delete production files).
- The staging DB is a Neon branch of production, reset on demand
  (`just staging-db-reset`). The reset scrubs `push_tokens`: the copy holds
  real FCM tokens and staging shares the prod sender. Each post-reset deploy
  re-runs `alembic upgrade head` — a rehearsal of the next production release.
- Access gate: `WAITLIST_ENABLED=true` with nobody granted. The waitlist
  gates new-user creation only, so users copied from production sign in
  normally; strangers hit the wall.

## Considered and rejected

- **Parallel Firebase project** — full isolation, but duplicates auth, App
  Check, VAPID, credentials, and AI billing, and drags the Cloud Run service
  into the second project because of the rewrite constraint.
- **`main` → staging, tag → production** — fewer moving parts, but the
  maintainer prefers an explicit develop/main split with releases as PRs.
- **Seeded staging DB** — deterministic and private, but forfeits the
  migration rehearsal and costs seed maintenance. Revisit when the first real
  external users join; that is also the trigger to scrub personal data on
  reset.

## Consequences

- The repo default branch is `develop`; `gh`, Dependabot, and worktree
  creation follow it. Release PRs pass `--base main` explicitly.
- Rulesets protect both branches (`CI gate` + linear history). The
  post-release reset needs a force push to `develop`; the owner's bypass
  covers it.
- `CHANGELOG.md` generation reads `develop` history; `main` no longer carries
  per-PR commits.
- Both deploy workflows select their GitHub Environment by ref; the
  `Production` and `Staging` environments hold identical variable names.
