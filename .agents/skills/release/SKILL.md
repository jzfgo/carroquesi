---
name: release
description: >
  Prepare and open a release PR for CarroQueSí. Use this whenever the user says
  "prepare a release", "cut a release", "do a release", "make a new release",
  or mentions a specific version like "release 0.19.1". Handles the full workflow:
  determine the next version, create a worktree, regenerate the changelog, bump
  versions in package.json and pyproject.toml, commit, tag locally, push, and
  open a PR with post-merge tagging instructions. Always use this skill — do not
  try to do the release workflow manually without it.
---

# Release Workflow

This skill prepares a CarroQueSí release PR. Run every step in order — skipping
any step is likely to cause the pre-push hook to fail or the PR to be incomplete.

## 0. Determine the next version

Read the `## [Unreleased]` section at the top of `CHANGELOG.md`.

- Any `feat:` entry → **minor** bump (0.X.0)
- Only `fix:` entries → **patch** bump (0.Y.Z)
- Breaking changes (rare) → **major** bump (X.0.0)

If the user explicitly named a version (e.g. "release 0.20.0"), use that instead.

Get the current version from `frontend/package.json`:
```bash
grep '"version"' frontend/package.json | head -1
```

## 1. Create a worktree

Edits on `main` are blocked. Always start by creating a worktree:

```bash
wt switch --create chore/release-X.Y.Z --no-cd --format=json --yes
```

Then call `EnterWorktree` with the `path` from the JSON output.

## 2. Regenerate the changelog

```bash
just changelog
```

This runs `scripts/strip-unreleased.py` (strips the old `[Unreleased]` block) then
`git cliff --unreleased --prepend CHANGELOG.md`. The result is a fresh `[Unreleased]`
section containing only commits that `cliff.toml` includes (feat, fix, refactor/perf —
chore/docs/test/ci are excluded).

## 3. Rename [Unreleased] → versioned header

Edit `CHANGELOG.md`: replace the first occurrence of:
```
## [Unreleased]
```
with:
```
## [X.Y.Z] — YYYY-MM-DD
```
Use today's date in `YYYY-MM-DD` format.

## 4. Bump version in both manifests

- `frontend/package.json`: change `"version": "OLD"` → `"version": "X.Y.Z"`
- `backend/pyproject.toml`: change `version = "OLD"` → `version = "X.Y.Z"`

## 5. Commit

```bash
git add CHANGELOG.md frontend/package.json backend/pyproject.toml
git commit -m "chore: release X.Y.Z

Co-Authored-By: <your session's co-author trailer>"
```

Use the `Co-Authored-By:` trailer for the model you are actually running as — do
not copy a model name from this file. Hardcoding one here just goes stale on the
next model release.

## 6. Create a local tag

The `pre-push` changelog hook runs `git cliff --unreleased` and aborts if it finds
fix/feat commits not yet captured in a tag. Tagging locally before pushing satisfies
the hook without pushing the tag yet (the branch push doesn't carry tags by default).

```bash
git tag vX.Y.Z
```

## 7. Push the branch

```bash
git push -u origin chore/release-X.Y.Z
```

The pre-push hook should pass. If it still fails with a changelog error, run
`just changelog` once more, re-stage `CHANGELOG.md`, amend the commit, and re-push.

## 8. Open the PR

```bash
gh pr create \
  --title "chore: release X.Y.Z" \
  --base main \
  --head chore/release-X.Y.Z \
  --body "..."
```

PR body template:

```
## Summary

- Bump version to X.Y.Z in `frontend/package.json` and `backend/pyproject.toml`
- Update `CHANGELOG.md` with changes since vOLD

## Changes

### Fixed   ← (or Added, Changed — match the CHANGELOG sections present)
- <entry from the regenerated changelog>
- <entry from the regenerated changelog>

## Post-merge

After squash merging, move the `vX.Y.Z` tag to the merge commit on `main`:

\`\`\`bash
git tag -d vX.Y.Z
git fetch origin main
git tag vX.Y.Z origin/main
git push origin vX.Y.Z
\`\`\`
```

Fill in the changelog entries from what `just changelog` produced in step 2 — copy
them directly from the `CHANGELOG.md` diff so the PR body matches exactly.

## Troubleshooting

**pre-push hook fails with "Unreleased commits not in CHANGELOG"**
The hook saw fix/feat commits since the last tag. This usually means `just changelog`
picked up a commit that appeared after the tag was created. Run `just changelog` again,
check the diff, amend the commit with the updated file, then re-push.

**`wt switch` prompts for approval in non-interactive mode**
Add `--yes` to auto-approve post-start hooks (already included in step 1 above).

**Tag already exists locally**
A previous aborted release may have left a stale tag. Delete it with
`git tag -d vX.Y.Z` before re-tagging.
