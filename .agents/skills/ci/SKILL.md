---
name: ci
description: "The CI contract for this repo. Read before changing .github/workflows/, the changed-areas classifier (scripts/ci-changed-areas.sh and its test), or Playwright config: the CI gate as the only required check, no paths: on ci.yml, a classifier that fails open, advisory Playwright, retries."
user-invocable: false
paths:
  - ".github/workflows/**"
  - "scripts/ci-changed-areas.sh"
  - "scripts/test-ci-changed-areas.py"
  - "frontend/playwright.config.ts"
---

# CI

All PR checks live in `.github/workflows/ci.yml` and run only for the areas a PR touches. `scripts/ci-changed-areas.sh` classifies the diff; each job gates on its output with `if:`.

Three things about this are load-bearing and easy to break by accident:

- **`CI gate` is the only required status check.** Every other job may be renamed, split, or skipped freely — the ruleset no longer names them. Do not re-add per-job contexts; that is what made renaming a job (to add mypy, say) deadlock every open PR.
- **Never add `paths:` to `ci.yml`.** A workflow skipped by a path filter never posts its checks, so a required context waits for a status that will never arrive and the PR becomes unmergeable. A _job_ skipped by `if:` posts success. That asymmetry is the whole design — gate jobs, never the trigger. Playwright may look like a counterexample; it used to carry its own `paths:` list, and was folded in precisely because two encodings of one rule drift apart.
- **The classifier must fail open.** Its output decides which jobs are skipped, and a skipped job reports **success** to a required check — so a crash there does not block a PR, it waves one through with a green checks page and nothing verified. Anything ambiguous resolves to "run everything". `CI gate` (`if: always()`) is the second line of defence.

When changing what a job covers, edit the classifier and add a case to `scripts/test-ci-changed-areas.py` — run both with `just test-tooling`. Both are dependency-free on purpose so they run on a bare checkout; if a test needs a dependency to reach the thing it tests, the thing is in the wrong place.

Playwright is currently **advisory** — it is not in `CI gate`'s `needs`, so a PR can merge with E2E red. Promote it deliberately, not as a side effect of another change.

CI runs the suite on two workers, and `retries: 2` means a first-attempt failure still reports as a pass. So judge any change to parallelism on a `--retries=0` run: the retries exist to absorb noise, and they absorb real defects just as well. `frontend/tests/README.md` records what the numbers were and which bug this hid.
