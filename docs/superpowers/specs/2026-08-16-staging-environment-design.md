# Staging environment tied to a `develop` branch

**Date:** 2026-08-16
**Status:** Approved design, pending implementation plan

## Problem

All final testing happens in production today. That is tolerable while the
maintainer is nearly the only user, and it stops being tolerable the moment
real users join: a broken deploy or a destructive test then lands on their
data and their screens. Several redesign features also cannot be tested
locally at all — push notifications, App Check, signed GCS URLs, and the
`/i/**` invite rewrite only exist in a remote deployment.

Goal: every feature is testable in a remote, production-shaped environment
before it reaches production.

## Decisions (settled with the maintainer, do not reopen without cause)

1. **Promotion model: `develop` → staging, release PR → production.**
   Feature PRs squash into `develop`; `develop` auto-deploys staging.
   A release PR squashes `develop` into `main`; `main` auto-deploys
   production. `main` holds one commit per release.
2. **Firebase: same project, second Hosting site.** No parallel Firebase
   project. Auth pool, FCM sender, VAPID key, reCAPTCHA/App Check key,
   Gemini setup, and the Admin SDK credential are shared.
3. **Database: a Neon branch of production**, reset on demand. Revisit
   (scrub or seed instead) when the first real external users join.
4. **Access: waitlist wall on staging** (`WAITLIST_ENABLED=true`, nobody
   granted). Existing users from the prod-copied DB get in; strangers hit
   the wall.
5. **Staging domain: short site ID `cqs-stg`** → `cqs-stg.web.app`.
   Site IDs are globally unique across Firebase; if `cqs-stg` is taken,
   fall back to the nearest available (`cqs-staging`, `carroquesi-stg`).
   The final spelling has no code impact — it appears only in env vars,
   Firebase console settings, and the `.firebaserc` target map.

## Topology

|            | Production (unchanged)      | Staging (new)                          |
| ---------- | --------------------------- | -------------------------------------- |
| Frontend   | current Hosting site        | Hosting site `cqs-stg` (same project)  |
| Backend    | Cloud Run `carroquesi-backend` | Cloud Run `carroquesi-backend-staging`, same GCP project and region |
| Database   | Neon production branch      | Neon branch `staging`, forked from production |
| Receipts   | prod GCS bucket             | dedicated staging bucket               |
| Deploy env | GitHub Environment `Production` | GitHub Environment `Staging`       |

The staging Cloud Run service must live in the same GCP project as the
Hosting site: the `/i/**` rewrite can only target Cloud Run in the Hosting
site's own project. This constraint is what ruled out a parallel Firebase
project cheaply.

A dedicated staging bucket is mandatory, not a nicety: deleting a list
purges its `receipts/{list_id}/` prefix, so a shared bucket would let a
staging test delete production files.

## Git and promotion workflow

- Create `develop` from `main`. It becomes the default PR target.
  Feature PRs squash-merge into it, exactly as PRs squash into `main`
  today.
- Branch protection: the `CI gate` required check applies to `develop`
  (and stays on `main` for release PRs).
- Releases: a release PR from `develop` into `main`, squashed. Tag on
  `main` after merge, as today.
- **Mandatory post-release step: reset `develop` to `main`**
  (`git branch -f develop main` + force push). At release time the two
  trees are identical, so the reset is lossless. It exists to keep the
  merge-base fresh: without it, release-PR diffs grow to show all history
  and any hotfix on `main` starts producing phantom conflicts. Skipping
  it once is how the model breaks.
- Hotfix path: fix lands on `develop`, then an immediate release. Direct
  `main` fixes are the emergency exception and must be followed by the
  same reset.

### `/release` skill changes

- The release branch is cut from `develop`, not `main`.
- The changelog is generated on that branch. The squashed `feat:`/`fix:`
  PR titles now live in `develop`'s history, and after each post-release
  reset `develop` sits exactly on the last tag — so `git cliff` sees
  precisely the commits since the last release. The "never generate on a
  feature branch" rule still holds.
- Post-merge instructions gain the `develop` reset step.

### `/ship` skill and PR tooling

- Set the GitHub repository **default branch to `develop`**. This is the
  single move that redirects `gh pr create`, Dependabot PRs, and new
  clones to the right base. Release PRs pass `--base main` explicitly.
- `/ship` step 3: pass `--base develop` explicitly anyway (cheap
  insurance against tooling that guesses), and fix the CHANGELOG note —
  it is generated on a release branch cut from `develop`, no longer "on
  `main`".
- Worktree creation must base new branches on `develop`. Today `wt
  switch --create` branches from `main`; once `main` is releases-only it
  will lag `develop`, so a main-based worktree starts every feature from
  a stale tree. Update the worktrunk config (and the harness
  `worktree.baseRef` if set) so new worktrees branch from `develop`.

### `/babysit-pr` skill

The skill hardcodes `main` as the merge target and must become
base-branch-aware:

- Ruleset lookups (`gh api repos/:owner/:repo/rules/branches/main`), the
  "up to date with `main`" requirement, and the `BEHIND` rebase
  instruction all switch to **the PR's base branch** — `develop` for
  feature PRs, `main` for release PRs.
- Its `issue_comment` commentary says review runs attribute to and
  execute "`main`'s copy" of `claude.yml`. The mechanic is really "the
  default branch": after the flip, runs report `headBranch: develop` and
  execute `develop`'s workflow copy. Reword to say "the default branch
  (`develop`)" — this skill's stale-claim history shows wrong prose here
  causes real stalls.

### Branch protection must be re-verified at cutover

If the active `default` ruleset targets `~DEFAULT_BRANCH` rather than
`main` by name, flipping the repository default branch to `develop`
silently moves the protection with it and leaves `main` unprotected —
release PRs could then merge without `CI gate`. Provisioning must check
the ruleset's target and end with **both** branches enforcing `CI gate`
and linear history.

### Rule updates in AGENTS.md

- Git Workflow: PRs target `develop`; release PRs target `main`;
  document the reset step.
- Alembic rule becomes "migrations last, rebased on **develop**".
- Validation checklist and changelog sections updated to match.

## CI/CD changes

- `deploy-backend.yml` / `deploy-frontend.yml`: add `develop` to
  `branches:`; select the environment by ref:
  `environment: ${{ github.ref_name == 'main' && 'Production' || 'Staging' }}`.
  Nothing else changes — both workflows already read every
  environment-specific value from the GitHub Environment.
- New GitHub Environment `Staging` with the same variable and secret
  names as `Production`, holding staging values: `DATABASE_URL` (Neon
  staging branch), `CLOUDRUN_SERVICE=carroquesi-backend-staging`,
  `FRONTEND_URL` / `ALLOWED_ORIGINS` / `VITE_BACKEND_URL` (staging URLs),
  `RECEIPT_STORAGE_BUCKET` (staging bucket), `WAITLIST_ENABLED=true` and
  `VITE_WAITLIST_ENABLED=true`. The Firebase `VITE_*` secrets are copied
  unchanged (shared project).
- `ci.yml` is untouched, except confirming at implementation time that
  its `pull_request` trigger covers PRs into `develop`. Per the CI rules
  in AGENTS.md, no `paths:` filter is added to `ci.yml`; the deploy
  workflows keep theirs (they post no required checks).
- `firebase.json` hosting becomes a two-entry array with deploy targets
  (`production`, `staging`), each entry carrying its own `/i/**` rewrite
  to its own Cloud Run `serviceId`. This removes the hardcoded
  `carroquesi-backend` service ID. `.firebaserc` maps targets to sites;
  the frontend deploy script takes a target argument and each workflow
  passes its own.

## One-time provisioning (manual)

1. Create Hosting site `cqs-stg` in the Firebase project.
2. Create the Neon `staging` branch; record its connection string in the
   `Staging` GitHub Environment.
3. Create the staging receipts bucket; grant the backend service account
   the same signed-URL permissions it holds on the prod bucket.
4. Add `cqs-stg.web.app` to Firebase Auth authorized domains **and** to
   the reCAPTCHA key's domain list. Without the second one, App Check
   fails and receipt scanning breaks on staging only.
5. First push to `develop` creates the Cloud Run service via the deploy
   workflow. The existing deployer SA and the `firebase-credentials`
   Secret Manager entry are reused as-is.

## Staging DB reset

A justfile recipe wrapping `neonctl`: reset the `staging` branch from
production, then **delete all rows in `push_tokens` on staging**. The
copy holds real FCM device tokens and staging shares the prod sender, so
an unscrubbed staging could push real notifications to real users'
phones. Today those phones belong to the maintainer (which is even useful
for testing); the scrub is in the runbook now so it exists before it
matters.

The next staging deploy runs `alembic upgrade head` against the freshly
reset branch — a rehearsal of exactly what production will run at the
next release.

## Telling the two apps apart

Both PWAs would otherwise install with the same name and icon, and
testing happens from a phone. One small frontend change: an optional
`VITE_ENVIRONMENT_LABEL` env var. When set (staging sets it, production
does not), the manifest name gets a suffix ("CarroQueSí (staging)") and a
slim always-on banner renders, following the `OfflineBand` fixed-overlay
pattern. No behavior differences beyond the label.

## Documentation

- New ADR: staging environment and branch/promotion model (it changes
  the git workflow, which clears the "significant tradeoff" bar).
- AGENTS.md updates listed above; README touched where it describes the
  deploy flow.

## Non-goals (recorded so they are not reinvented)

- E2E/smoke tests running against staging.
- Preview-per-PR deploys.
- Seeded or scrubbed staging data — trigger for revisiting: first real
  external users.
- Any production approval gate beyond the release PR itself.

## Open items to verify during implementation

- `ci.yml` `pull_request` trigger covers PRs into `develop`.
- Waitlist semantics: confirm the wall admits users that already exist in
  the DB and blocks only new sign-ups; the staging gate relies on this.
- Site ID `cqs-stg` availability.
- Where the worktree base branch is configured (worktrunk project config
  vs. harness `worktree.baseRef`), and whether other repo tooling keys
  off the GitHub default branch (Dependabot targets it automatically;
  check `claude.yml` and branch-name assumptions in hooks — a grep shows
  `main` mentioned in `block_main_edits.py`, `block_no_verify.py`,
  `stop_checks.py`, `test_hooks.py`, and `enforce_worktrunk.py`; each
  needs a read to decide whether `develop` should be treated the same).
- What the active `default` ruleset targets (`~DEFAULT_BRANCH` vs.
  `main` by name) — decides whether the default-branch flip needs a
  second ruleset to keep `main` protected.
