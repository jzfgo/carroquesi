---
name: ship
description: Commit, push, and open a squash-merge PR
---
1. Run `just ci` (typecheck + lint + backend tests); fix any failures before continuing
2. Stage and commit with a clear message
3. Push and open a PR with `gh pr create --base develop` (squash-merge manually when ready). The explicit base is insurance against tooling that guesses. Do **not** touch `CHANGELOG.md` — it is generated on a release branch cut from `develop` at release time, never on a feature branch
4. Report PR URL
