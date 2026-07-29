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

To repair one that was already squashed, record the ancestry with `git merge -s ours`, which keeps your tree exactly and only adds a parent. Derive the commit rather than typing one — all you need is the merged PR's number:

```bash
git switch <branch>                        # or `wt switch`, if it already has a worktree
git fetch --unshallow 2>/dev/null || true  # no-op unless the clone is shallow; see below
git fetch origin refs/pull/<n>/head        # the source branch is deleted on merge
git merge -s ours -m "record ancestry from #<n>" "$(git merge-base origin/main FETCH_HEAD)"
git push                                   # the merge base that matters is the one GitHub computes
```

Confirm it took, **against the remote**:

```bash
git fetch origin
git merge-base origin/main origin/<branch>   # must answer the sha you just merged
```

Both arguments have to be remote-tracking refs. `git push` updates neither `origin/main` nor your local branch, so a confirmation phrased against local refs returns the same answer whether or not you pushed — it passes in exactly the state this step exists to catch.

Never pass `origin/main` to `-s ours`. If `main` has moved on since the squash, `-s ours` against its tip marks the newer commits as merged while keeping your tree, so their content is dropped and a later `git merge main` answers `Already up to date` — silent, and shaped like success.

`git merge-base` is what makes that unreachable rather than merely guarded: it can only return a commit the PR head actually contained, so it names the newest `main` the branch really absorbed and never the tip. Anything past that point stays unmerged and is offered again by the next real merge, which is what you want.

Do not expect the branch to end up level with `main`. The derived commit is the newest `main` the squashed PR contained — `main`'s tip when that PR was opened — so if `main` moved since, a correct repair leaves the branch behind by exactly those newer commits. That is the intended outcome, not a failure, and the next real merge brings them. Reading "still behind" as a failed repair leads straight to `-s ours origin/main`, which is the one thing never to do here.

Notes on the commands:

- **The fetch** is needed because GitHub deletes the source branch on merge, leaving that head reachable only through `refs/pull/<n>/head`. It sets `FETCH_HEAD` to exactly that commit, so nothing else has to name it.
- **The push** is the step that does the work. The merge base deciding whether the next merge replays those files is computed on GitHub's copy, so an unpushed repair changes nothing at all.
- **The unshallow** covers CI checkouts and anything an agent runs in. Where the true base sits below a shallow boundary, `merge-base` exits 1 and the empty result makes `git merge -s ours` fail. It goes before the `refs/pull` fetch so the fetched head arrives into full history. Harmless on a normal clone, and the shallow case fails closed — nothing is at risk, it just will not work.
- **The `-m`** keeps this non-interactive, and gives the commit somewhere to say why it exists. That message is usually the only place this reasoning survives.

The whole operation exists to change a number computed on GitHub, so it is not finished until you have read that number back from where it lives. Every step before the last one is local and proves nothing on its own.

One collision to know about: `git merge -s ours <sha>` also prints `Already up to date` when `<sha>` is an ancestor already — re-running the repair, say. That is the benign case, and it is a different command from the `git merge main` above.

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
