#!/usr/bin/env python3
"""Tests for scripts/ci-changed-areas.sh. Run: python3 scripts/test-ci-changed-areas.py

No pytest dependency on purpose — this runs in the same bare-checkout CI job as
the guardrail hook tests, before `uv sync` has ever happened.

The classifier decides which CI jobs are skipped, and a skipped job reports
SUCCESS to a required status check. So its failure mode is not a red build, it
is a green one with nothing verified. That asymmetry is why it has tests at all,
and why the fail-open cases below matter more than the happy path.
"""

from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

SCRIPT = pathlib.Path(__file__).parent / "ci-changed-areas.sh"

failures: list[str] = []


def classify(
    files: list[str],
    *,
    shell: list[str] | None = None,
    broken_grep: str | None = None,
) -> dict[str, str]:
    """Run the classifier over `files` and parse its key=value stdout.

    `shell` defaults to invoking the script directly via its shebang, which is
    how CI runs it. Override it to check behaviour under a different invocation.

    `broken_grep` puts a failing `grep` ahead of the real one on PATH, to check
    the classifier fails open when its own tooling breaks:

      "all"      — every invocation exits 2. Short-circuits via the SHARED
                   check, which is the first call site.
      "per_area" — SHARED reports a clean "no match" (exit 1) and only the
                   per-area patterns exit 2, so the failure is exercised at the
                   per-area call sites instead. Both paths are worth pinning:
                   they share one `match()` today, but a future split would
                   leave "all" passing while the per-area path regressed.
    """
    cmd = [*shell, str(SCRIPT)] if shell else [str(SCRIPT)]
    env = None
    stub_dir = None
    if broken_grep:
        stub_dir = tempfile.mkdtemp()
        stub = pathlib.Path(stub_dir) / "grep"
        if broken_grep == "per_area":
            # The SHARED pattern is the only one mentioning .github/workflows.
            stub.write_text(
                "#!/bin/sh\ncase \"$*\" in\n"
                "  *github/workflows*) exit 1 ;;\n"
                "  *) exit 2 ;;\n"
                "esac\n"
            )
        else:
            stub.write_text("#!/bin/sh\nexit 2\n")
        stub.chmod(0o755)
        env = {**os.environ, "PATH": f"{stub_dir}:{os.environ['PATH']}"}
    proc = subprocess.run(
        cmd,
        input="\n".join(files),
        capture_output=True,
        text=True,
        env=env,
    )
    if stub_dir:
        shutil.rmtree(stub_dir, ignore_errors=True)
    if proc.returncode != 0:
        failures.append(f"{files!r}: exited {proc.returncode}\n{proc.stderr}")
    out = {}
    for line in proc.stdout.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            out[k] = v
    return out


def check(label: str, files: list[str], want: tuple[bool, bool, bool]) -> None:
    got = classify(files)
    want_d = {
        "frontend": str(want[0]).lower(),
        "backend": str(want[1]).lower(),
        "tooling": str(want[2]).lower(),
    }
    ok = got == want_d
    if not ok:
        failures.append(f"{label}: got {got}, want {want_d}")
    print(f"  {'ok  ' if ok else 'FAIL'} {label}")


print("\nci-changed-areas.sh\n")

# ── Areas in isolation ───────────────────────────────────────────────────────
check("docs only", ["docs/decisions/011-foo.md", "README.md"], (False, False, False))
check("changelog only", ["CHANGELOG.md"], (False, False, False))
check("agents doc only", ["AGENTS.md"], (False, False, False))
check("frontend source", ["frontend/src/App.tsx"], (True, False, False))
check("frontend lockfile", ["frontend/pnpm-lock.yaml"], (True, False, False))
check("backend source", ["backend/app/main.py"], (False, True, False))
check("backend migration", ["backend/alembic/versions/abc.py"], (False, True, False))
check("both apps", ["frontend/src/App.tsx", "backend/app/main.py"], (True, True, False))
check("guardrail hooks", [".claude/hooks/block_main_edits.py"], (False, False, True))

# ── Shared tooling must force everything ─────────────────────────────────────
# Each of these can break either app. Under-running here is invisible: the
# skipped job reports success and the PR goes green.
check("justfile", ["justfile"], (True, True, True))
check("lefthook config", ["lefthook.yml"], (True, True, True))
check("scripts/", ["scripts/check-changelog.sh"], (True, True, True))
check("this classifier", ["scripts/ci-changed-areas.sh"], (True, True, True))
check("a workflow", [".github/workflows/claude.yml"], (True, True, True))
check("worktree config", [".config/wt.toml"], (True, True, True))
check("envrc", [".envrc"], (True, True, True))
check("shared alongside docs", ["justfile", "README.md"], (True, True, True))

# ── Anchoring: these merely CONTAIN an area name and must not match ──────────
check("docs about the frontend", ["docs/frontend-guide.md"], (False, False, False))
check("docs about the backend", ["docs/backend/notes.md"], (False, False, False))
check("a nested justfile", ["frontend/justfile"], (True, False, False))

# ── Fail-open: an unclassifiable diff must run EVERYTHING, never nothing ─────
# If `gh pr diff` fails in CI it produces no output, which arrives here as empty
# stdin. Returning all-false there would skip every job, and skipped required
# checks report success — a PR merged with a green page and no verification.
check("empty input", [], (True, True, True))
check("blank lines only", ["", "  ", ""], (True, True, True))

# The classifier's own tooling breaking must also fail open. grep exits 1 for
# "no match" and 2+ for "I failed"; collapsing those made a frontend-only diff
# resolve to all-false — every job skipped, every skip reported as success, a
# green PR with nothing verified. Caught in review on PR #133.
#
# Both call sites are covered on purpose. A stub that fails unconditionally
# short-circuits at the SHARED check and never reaches the per-area branch —
# right answer, wrong path — so "per_area" makes SHARED miss cleanly and pins
# the branch the original report actually named.
for mode in ("all", "per_area"):
    for label, shell in [("via shebang", None), ("under sh", ["sh"])]:
        got = classify(["frontend/src/App.tsx"], shell=shell, broken_grep=mode)
        ok = got == {"frontend": "true", "backend": "true", "tooling": "true"}
        if not ok:
            failures.append(f"broken grep [{mode}] {label}: got {got}, want all true")
        print(f"  {'ok  ' if ok else 'FAIL'} fail-open when grep fails [{mode}] ({label})")

# ── Invocation environment ──────────────────────────────────────────────────
# Two distinct failures live here, both of which have actually shipped.
#
# 1. GitHub runs `run:` steps as `bash -e`, and `set -u` does not clear an
#    inherited `-e`. An earlier version of this logic lived inline in the
#    workflow and was silently running fail-CLOSED for exactly that reason,
#    while a local harness using plain `bash -c` reported it healthy.
#
# 2. `sh` is not one shell. On macOS /bin/sh IS bash, so bashisms pass locally
#    and fail on the CI runner where /bin/sh is dash. `${var//pat/}` shipped
#    once and died there with "Bad substitution".
#
# So `sh` alone is not enough of a check on a Mac — run dash explicitly when it
# is installed (`brew install dash`), which is what gives case 2 teeth locally.
shells = [("bash -e", ["bash", "-e"]), ("sh", ["sh"])]
if shutil.which("dash"):
    shells.append(("dash", ["dash"]))
else:
    print("  note dash not installed — `brew install dash` to catch bashisms locally")

for label, shell in shells:
    got = classify([], shell=shell)
    ok = got == {"frontend": "true", "backend": "true", "tooling": "true"}
    if not ok:
        failures.append(f"fail-open under {label}: got {got}")
    print(f"  {'ok  ' if ok else 'FAIL'} fail-open under {label}")

print()
if failures:
    print(f"{len(failures)} failure(s):\n")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("all passed")
