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

| Prefix | Use for |
|--------|---------|
| `feat/` | New functionality |
| `fix/` | Bug fixes |
| `chore/` | Tooling, config, deps |
| `docs/` | Documentation only |
| `refactor/` | Code changes with no behavior change |

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org):

```
feat: add barcode lookup fallback
fix: prevent duplicate item on rapid submit
chore: bump vite to 6.x
```

Types `feat` and `fix` appear in the changelog. Types `chore`, `docs`, `test`, and `ci` are excluded.

### Before opening a PR

Run the full check:

```bash
just ci   # frontend typecheck + lint + backend tests
```

Make sure:

- [ ] Lint and tests pass
- [ ] `TODO.md` updated — remove any items your PR ships
- [ ] `CHANGELOG.md` updated — run `just changelog` and commit the result
- [ ] Only intentional files are changed (no `package-lock.json` platform churn)

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
