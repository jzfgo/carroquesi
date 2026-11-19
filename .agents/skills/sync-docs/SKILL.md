---
name: sync-docs
description: >-
  Audit a repo's documentation against its current code, report every claim
  that drifted with the evidence, and fix it once the report is out: agent
  guidance files (AGENTS.md, CLAUDE.md and nested ones), path-scoped context
  skills, README and docs/. Verifies each checkable claim at its source of
  truth instead of refreshing docs from memory. Use after a feature ships,
  before a release, or when the user says "sync the docs", "are the docs up
  to date" or "audit the docs". /sync-docs <doc-path|git-ref> narrows the
  audit. Not for writing new documentation from scratch, not for release
  notes, not for editing generated files such as CHANGELOG.md, not for
  copying, publishing or deploying docs, and not for prose polishing of docs
  that are already accurate.
argument-hint: "[doc-path | git-ref]"
---

# Sync Docs

Audit → report → fix, in that order. Verify every claim against the code before
editing anything. Never refresh a doc from your memory of what the app does: a
doc rewritten from belief just moves the drift somewhere less visible.

## 0. Scope

- No argument: audit every doc surface below.
- A path to a doc: audit only that file, but still check its claims against the
  whole codebase.
- A git ref (tag, branch, SHA): audit only claims touched by what changed since
  that ref.

If an argument names both an existing file or directory and a ref (a branch
called `docs` beside a `docs/` directory), treat it as a path.

Without a ref, find the baseline: walk `git log --oneline` back to the last
commit that synced docs (a `docs:` commit touching the agent files, or the
`last_sync` recorded in the sources file below), else the last release tag. List
what shipped since then; that list tells you where drift is likely, but audit
every surface in scope, not just the ones the log touches.

## 1. Find the doc surfaces

Discover them; do not assume a layout.

- **Agent guidance**: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` and their nested
  copies in subdirectories. When one file is a symlink to, or a one-line import
  of, another, audit the target once.
- **Context skills**: any `SKILL.md` with `paths:` frontmatter (often
  `user-invocable: false`) under `.agents/skills/`, `.claude/skills/` or
  `skills/`, and whatever the repo uses to inject them (for example symlinks in
  `.claude/rules/`). For each, keep three things consistent: the pointer in the
  root guidance file, the skill's `description`, and its body. Check that its
  `paths:` globs still match files.
- **Human docs**: `README.md`, `CONTRIBUTING.md`, `docs/**/*.md`.
- **Not synced from code**: generated files (`CHANGELOG.md`, API references
  built by a tool), and intent documents whose source is a person or a design
  handoff rather than the code (product briefs, design summaries, ADRs as
  records of a past decision). Report a contradiction involving one of them, but
  do not edit it in this flow. If unsure which category a file is in, ask once.

## 2. Load the sources map

If `.agents/sync-docs/sources.md` exists, read it first. It is the repo's own
list of domain claims and where each one is true, plus any surfaces excluded on
purpose. Its format:

```markdown
last_sync: <commit SHA of the last completed sync>

| Claim in docs | Source of truth |
| --- | --- |
| Data model tables and columns | `backend/app/db/models.py` |
| Feature flags | the registry in `backend/app/services/feature_flags.py` |

## Not synced
- `DESIGN.md`: summary of `docs/design/handoff/`, which is canonical
```

If it does not exist, build the same table during the audit from the claims you
actually find. At the end, offer to save it there so the next run starts from it.

## 3. Audit

Run the generic checks on every surface in scope, then the rows of the sources
map.

| Claim in docs | Source of truth |
| --- | --- |
| Every backtick path, file, component, function, hook | the file or symbol itself: it must exist under that name |
| Commands and recipes (`just x`, `npm run x`, `make x`) | `justfile`, `package.json` `scripts`, `Makefile`: the recipe must exist, and any behavior the doc attributes to it must match its body |
| Env vars and config keys in setup sections | `.env.example` files and the config loader |
| Required tool versions | `.tool-versions`, `.nvmrc`, `engines`, `requires-python`, CI setup steps |
| ADR or decision references | `docs/decisions/` or equivalent: number and title must match |
| Relative links and anchors | the target file and heading |
| CI and branch rules quoted in docs | the workflow files; for rulesets, `gh api` if available, else flag as unverified |

Behavioral invariants ("a closed trip is never re-priced", "the classifier
fails open") cannot be table-checked. Confirm that the functions, endpoints and
files they name still exist, read enough of the code to see whether the sentence
still holds, and when you cannot tell, flag it as unverified rather than guess.

Also look for the opposite drift: something that shipped since the baseline and
changes a rule an agent must follow, with no doc mentioning it. Report it as a
gap; do not document every new file.

## 4. Report

Before editing, list the findings, grouped by file. For each: the stale claim
(quoted), the evidence (path, line, or command output), and the proposed fix.
Mark unverified items separately.

When two docs contradict each other, resolve by this order: code > canonical
design or spec source > agent guidance files > README and other human docs.

If nothing drifted, say so, update `last_sync` if the sources file exists, and
stop. Leave that one-line change uncommitted, on whatever branch is checked
out, and say so in the report: it is not worth a branch, and committing it to
the default branch would break the rule in step 5.

If step 5 will finish through the repo's shipping skill or ship guide,
say so under the fix list, so that approving the list also approves the push
and the PR.

When running interactively, wait for the user to approve the fix list or trim
it. When the user already said to fix everything, go on; if step 5 will finish
through a shipping skill or ship guide, that also covers the push and the PR.

## 5. Fix

- Edit on a branch, or in a worktree if the repo uses them. If the current
  branch is the default or a protected one, create a branch first.
- Apply only the approved fixes. Change the claim, not the surrounding prose.
- Respect derivability when adding content: do not add what `ls`, a manifest
  or `--help` already shows (no directory trees, no endpoint inventories, no
  dependency lists). Document gotchas, invariants and rationale, the things an
  agent would get wrong without being told.
- Deep feature detail that only matters to sessions touching certain files
  belongs in a path-scoped context skill, with a one-paragraph pointer in the
  root guidance file. If the repo does not use context skills yet, propose one
  rather than creating it unasked.
- Update `last_sync` in the sources file, and save the table there if the user
  accepted the offer.
- Commit following the repo's convention, e.g.
  `docs: sync docs with <what shipped>`.
- If the repo has its own shipping skill (such as `ship`), or a guide that
  tells agents to push and open the PR themselves (a ship guide), finish
  through it: that is how its changes land. Follow its steps up to opening
  the PR and skip any that merge, enable auto-merge, release or deploy: those
  are the user's call, not this one's. If the user said not to push, report
  the branch and the commit instead.
- Without a shipping skill or ship guide, push and open a PR only if the user
  asked; else report the branch and the commit.
