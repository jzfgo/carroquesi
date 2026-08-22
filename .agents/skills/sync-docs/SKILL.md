---
name: sync-docs
description: >
  Audit every doc surface against the current codebase, report what drifted,
  and fix it. Use after a feature ships, before a release, or whenever the user
  says "sync the docs", "are the docs up to date", or "audit the docs".
---

# Sync Docs

Full audit → report → fix, in that order. Verify claims against code before
editing anything; never "refresh" a doc from memory of what the app does.

## Doc surfaces

- `AGENTS.md` — the canonical file; `CLAUDE.md` and the other agent files are
  symlinks to it. Edit `AGENTS.md` directly, never a symlink target name.
- `frontend/AGENTS.md`, `backend/AGENTS.md` — nested guidance.
- `.claude/rules/*.md` — path-scoped deep detail (loads only when matching
  files are touched). Content moved out of the root file lives here; keep the
  root pointer and the rule file consistent with each other.
- `README.md` — human setup and overview.
- **Not synced from code**: `DESIGN.md` is a summary derived from the approved
  handoff (`docs/design/handoff/`, canonical); `PRODUCT.md` is product intent;
  `CHANGELOG.md` is generated at release time. Flag contradictions involving
  these, but do not edit them in this flow.

## 1. Audit

Establish what shipped since docs were last touched (`git log --oneline` back
to the last docs-sync or release commit), then verify each checkable claim at
its source of truth:

| Claim in docs | Source of truth |
| --- | --- |
| Core Data Model tables and columns | `backend/app/db/models.py` |
| SmartInputBar sigils | `frontend/src/lib/parseInput.ts` (`SINGLE_SIGIL_MAP` plus the `@` and `\|` branches) |
| Feature flags | registry in `backend/app/services/feature_flags.py` |
| Env vars in README setup | `frontend/.env.example` and `backend/app/core/config.py` |
| Cited file paths, components, hooks | the files themselves — every backtick path in a doc must exist |
| ADR references | `docs/decisions/` — number and title must match |
| Frame ids (13a, 25b, …) | `docs/design/handoff/` |
| Commands and recipes | `justfile` — quoted recipe behavior must match the recipe body |

Behavioral invariants (push rules, trip-open rule, reconcile/markWritten, …)
can't be table-checked: verify the named functions/endpoints still exist and
spot-check that the code still matches the sentence; flag, don't guess, when
unsure.

## 2. Report

Before editing, list findings: each stale claim, the evidence, and the
proposed fix. Contradictions between docs win by this order: code > handoff >
AGENTS.md > README. If nothing drifted, say so and stop.

## 3. Fix

- Work in a worktree (edits on `main`/`develop` are blocked).
- Apply the fixes. When adding new content, respect the derivability rule:
  don't add what `ls`, a manifest, or `--help` already shows (no router
  inventories, no directory trees) — document gotchas, invariants, and
  rationale.
- Deep feature detail belongs in a `.claude/rules/` file with `paths`
  frontmatter, with a one-paragraph pointer in the root file, when it is only
  relevant to sessions touching those files.
- Ship via the `ship` skill; commit as `docs: sync docs with <what shipped>`.
