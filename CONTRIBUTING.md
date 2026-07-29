# Contributing to CarroQueSí

Thanks for your interest in contributing. This document covers everything you need to get started.

## Licensing

CarroQueSí is licensed under AGPL v3. By submitting a contribution you agree that your code will be distributed under the same license, and you grant the project maintainer the right to relicense your contribution under future license terms (including commercial licenses). This is required to preserve the maintainer's ability to offer dual licensing.

## Ways to Contribute

- **Bug reports** — open an issue using the bug report template
- **Feature requests** — open an issue using the feature request template
- **Code** — fork, branch, implement, open a PR
- **Documentation** — fix typos, clarify setup steps, improve examples

## Development Setup

Follow the [README](README.md) for prerequisites and local setup. The short version:

```bash
just frontend install
just backend install
just backend migrate
just seed        # optional: realistic test data
just dev         # starts frontend + backend
```

For auth, use the dev bypass to avoid needing a real Google account locally:

```
# backend/.env
DEV_AUTH_BYPASS=true

# frontend/.env.local
VITE_DEV_USER_ID=seed-alice   # or seed-bob / seed-carol
```

## Workflow

### Before touching any file

Create a worktree or branch — never commit directly to `main`:

```bash
wt switch --create feat/my-feature   # if using worktrunk
# or
git checkout -b feat/my-feature
```

### Branch naming

Branches must use a type prefix:

| Prefix      | Use for                              |
| ----------- | ------------------------------------ |
| `feat/`     | New functionality                    |
| `fix/`      | Bug fixes                            |
| `chore/`    | Tooling, config, deps                |
| `docs/`     | Documentation only                   |
| `refactor/` | Code changes with no behavior change |

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat: add barcode lookup fallback
fix: prevent duplicate item on rapid submit
chore: bump vite to 6.x
```

Types `feat` and `fix` appear in the changelog. Types `chore`, `docs`, `test`, and `ci` are excluded.

`CHANGELOG.md` is generated on `main` at release time, not on your branch — leave it alone in a PR. Because PRs are squash-merged, entries generated before the squash describe commits that will not exist afterwards, and regenerating from the collapsed history deletes entries already shipped. The release PR is the one exception: it is based on `main` and adds no `feat`/`fix` commits of its own, so it sees the same history `main` will.

### Before opening a PR

Run the full check:

```bash
just ci   # frontend typecheck + lint + backend tests
```

Make sure:

- [ ] Lint and tests pass
- [ ] Only intentional files are changed (no `pnpm-lock.yaml` platform churn)
- [ ] `CHANGELOG.md` untouched (release PRs excepted)

### Merging a PR that brings `main` into a long-lived branch

Squash-merge is the default here, and into `main` a merge commit is not allowed at all — the ruleset requires linear history, so squash or rebase are the only ways in.

A PR that merges `main` into a long-lived branch is the exception, and must be merged with a real merge commit (`gh pr merge --merge`). Its only product is the ancestry link. A squash keeps the files and drops the link, which leaves the merge base where it was — so the next merge replays commits already applied and re-conflicts every file that was resolved by hand. This is measured, not hypothetical: the first four `main` → `feat/redesign-spec-v6` merges were squashed, and the fourth resolved seven files by hand that the next merge would have presented again.

To repair one that was already squashed, record the ancestry with `git merge -s ours`, which keeps your tree exactly and only adds a parent. Derive the commit rather than typing one — from the merged PR's number:

```bash
git fetch origin refs/pull/<n>/head                                  # the source branch is deleted on merge
head=$(gh pr view <n> --json headRefOid -q .headRefOid)
git merge -s ours "$(git merge-base origin/main "$head")"
```

Never pass `origin/main` here. If `main` has moved on since the squash, `-s ours` against its tip marks the newer commits as merged while keeping your tree, so their content is dropped and a later `git merge main` answers `Already up to date` — silent, and shaped like success.

`git merge-base` is what makes that unreachable rather than merely guarded: it can only return a commit the PR head actually contained, so it names the newest `main` the branch really absorbed and never the tip. Anything past that point stays unmerged and is offered again by the next real merge, which is what you want. The fetch is needed because GitHub deletes the source branch on merge, leaving that head reachable only through `refs/pull/<n>/head`.

### Architecture Decision Records

Significant architectural decisions are documented in `docs/decisions/`. Before making a choice that overlaps with an existing ADR, read it — it explains what was considered and why the current approach was chosen.

When your PR introduces a new significant tradeoff, add or update an ADR. Edit in place; git history is the audit trail.

### Alembic migrations

If your change requires a database migration, create it **last** — after rebasing on `main` and just before opening the PR. Two branches with migrations in parallel cause version conflicts that require manual resolution.

```bash
just backend migration "describe your change"
```

## Project Structure

```
carroquesi/
├── frontend/          # React + TypeScript (Vite)
│   ├── src/
│   │   ├── components/
│   │   ├── lib/       # API client, auth, feature flags
│   │   └── ...
└── backend/
    ├── app/
    │   ├── routers/   # one file per resource
    │   ├── schemas/   # Pydantic request/response models
    │   ├── services/  # business logic
    │   └── db/        # SQLModel models, session
    └── alembic/       # migrations
```

## Questions

Open a [GitHub Discussion](../../discussions) or file an issue — happy to help.
