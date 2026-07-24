#!/usr/bin/env bash
#
# Classify a list of changed files into the CI areas that need checking.
#
# Reads newline-separated repo-relative paths on STDIN.
# Writes `key=value` lines on STDOUT, one per area:
#
#     frontend=true|false
#     backend=true|false
#     tooling=true|false
#
# Diagnostics go to STDERR, so STDOUT can be appended straight to
# $GITHUB_OUTPUT without polluting it.
#
# Usage (CI):
#     files=$(gh pr diff "$PR" --repo "$REPO" --name-only)
#     printf '%s\n' "$files" | scripts/ci-changed-areas.sh >> "$GITHUB_OUTPUT"
#
# Usage (local):
#     git diff --name-only origin/main... | scripts/ci-changed-areas.sh
#
# This lives in a script rather than inline in .github/workflows/ci.yml so it
# can be run and tested directly. Logic embedded in a `run:` block is only
# executable inside a GitHub runner, so testing it means simulating that
# environment — and a simulation that is subtly wrong fails silently. See
# scripts/test-ci-changed-areas.py.

# `set +e` is deliberate and load-bearing: this script must FAIL OPEN.
#
# Its output decides whether CI jobs are skipped, and a skipped job reports
# SUCCESS to a required status check. So a crash here would not block a PR —
# it would wave it through with nothing verified and a green checks page.
# Every uncertain path below resolves to "run everything" instead.
#
# (`CI gate` in ci.yml catches that case as well; this is belt and braces.)
set +e
set -u

# Shared tooling can break either app, so it forces every check to run.
#
# Keep this list BROAD. A filter that is too narrow silently skips the one
# check that would have caught the change, and reports green while doing it —
# an invisible failure, which is the worst kind. Over-running costs minutes;
# under-running costs a production bug.
SHARED='^(\.github/workflows/|justfile|lefthook\.yml|scripts/|\.config/|\.envrc)'

FRONTEND='^frontend/'
BACKEND='^backend/'
TOOLING='^(\.claude/hooks/|scripts/)'

emit() {
  printf 'frontend=%s\nbackend=%s\ntooling=%s\n' "$1" "$2" "$3"
}

files=$(cat)

# No input means we could not determine what changed — run everything.
#
# The whitespace strip uses `tr` rather than `${files//[[:space:]]/}` on
# purpose: pattern substitution is a bashism, and this script should not care
# which shell invokes it. That distinction is invisible on macOS, where
# /bin/sh IS bash — the dash-only failure appeared on the CI runner, caught by
# the "fail-open under sh" case in test-ci-changed-areas.py. Keep that case.
if [ -z "$(printf '%s' "$files" | tr -d '[:space:]')" ]; then
  echo "No changed files could be determined — running all checks." >&2
  emit true true true
  exit 0
fi

echo "Changed files:" >&2
printf '%s\n' "$files" >&2

match() { printf '%s\n' "$files" | grep -qE "$1"; }

if match "$SHARED"; then
  echo "Shared tooling touched — running all checks." >&2
  emit true true true
  exit 0
fi

if match "$FRONTEND"; then frontend=true; else frontend=false; fi
if match "$BACKEND"; then backend=true; else backend=false; fi
if match "$TOOLING"; then tooling=true; else tooling=false; fi

emit "$frontend" "$backend" "$tooling"
