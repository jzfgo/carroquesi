---
name: ship
description: Commit, push, and open a squash-merge PR
---
1. Run `just ci` (typecheck + lint + backend tests); fix any failures before continuing
2. Stage and commit with a clear message
3. Push and open a PR with `gh pr create` (squash-merge manually when ready) — the `pre-push` hook runs `just changelog` automatically and will abort if `CHANGELOG.md` needs a commit
4. Report PR URL
