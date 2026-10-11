---
name: ship
description: Commit, push, and open a squash-merge PR
---
1. Run `just ci` (format-check + typecheck + lint + frontend and backend tests + tooling tests); fix any failures before continuing
2. Stage and commit with a clear message
3. Push and open a PR with `gh pr create --base develop` (squash-merge manually when ready). The explicit base is insurance against tooling that guesses. Do **not** touch `CHANGELOG.md` — it is generated on a release branch cut from `develop` at release time, never on a feature branch
4. Report PR URL. When asked to merge: plain `gh pr merge --squash` can report BLOCKED even with green CI — the `develop` ruleset requires extra approval for Claude-co-authored commits — so report the block and let the user choose: they approve and merge in the GitHub UI, or tell you explicitly to use `--admin` (owner bypass). Never add `--admin` on your own; that approval rule is the human review on agent-written commits
