---
name: ship
description: Commit, push, and open a squash-merge PR
---
1. Run `just ci` (typecheck + lint + backend tests); fix any failures before continuing
2. Stage and commit with a clear message
3. Push and open a PR with `gh pr create` (squash-merge manually when ready — unless the PR merges `main` into a long-lived branch, which takes a real merge commit; see `AGENTS.md` → Git Workflow). Do **not** touch `CHANGELOG.md` — it is generated on `main` at release time, never on a branch
4. Report PR URL
