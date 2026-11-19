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
- Production ships via a deploy PR `develop` → `main`, merged with a merge
  commit. `develop` stays an ancestor of `main`, so the merge-base is always
  the last release and the next deploy PR shows only what is new. The release's
  version bump and changelog land first, in a squashed PR into `develop`, and
  the tag goes on that commit, which both branches contain.
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
- **Squashed release PR plus a reset of `develop`** — the first version of
  this ADR. `main` held one commit per release, and after each release
  `develop` was force-reset onto it. The reset needed a force push through the
  owner's bypass, and any commit that reached `main` without `develop` (a PR
  opened straight into `main`) made the next release conflict.
- **Seeded staging DB** — deterministic and private, but forfeits the
  migration rehearsal and costs seed maintenance. Revisit when the first real
  external users join; that is also the trigger to scrub personal data on
  reset.

## Consequences

- The repo default branch is `develop`; `gh`, Dependabot, and worktree
  creation follow it. The deploy PR passes `--base main` explicitly.
- One ruleset per branch, both requiring `CI gate`. `develop`: squash only,
  linear history, up to date with its base. `main`: merge commit only, without
  linear history (a merge commit is not linear) and without the up-to-date rule
  (`develop` never contains `main`'s merge commits, so it would always read
  behind).
- `CHANGELOG.md` generation reads `develop` history. Tags sit on `develop`
  commits, which `main` also contains, so a tag never sits on a commit the
  next release branch cannot see.
- Both deploy workflows select their GitHub Environment by ref; the
  `Production` and `Staging` environments hold identical variable names.
