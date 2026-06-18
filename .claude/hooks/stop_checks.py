#!/usr/bin/env python3
"""Stop hook.

Re-checks whatever changed this turn before Claude Code ends its turn —
catching mistakes immediately instead of only at commit time. This is the
Evil Martians "agent hook + pre-commit manager" pattern (their version
wraps nano-staged for a single-language JS repo); this version is written
directly against this repo's backend/frontend split rather than going
through lefthook, because the Stop hook needs to see *all* working-tree
changes regardless of staging state, and lefthook's pre-commit hook is
keyed specifically to staged files.

Includes the same `stop_hook_active` loop guard the Evil Martians post
recommends: if we already forced one continuation this turn, don't force
another — let the agent stop, and rely on the pre-commit hook as the
backstop at actual commit time.
"""

import json
import os
import subprocess
import sys


def changed_files(prefix: str, exts: tuple[str, ...]) -> list[str]:
    files: set[str] = set()

    try:
        diff = subprocess.run(
            ["git", "diff", "--name-only", "HEAD", "--", prefix],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.splitlines()
        files.update(diff)
    except (subprocess.CalledProcessError, OSError):
        pass

    try:
        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard", prefix],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.splitlines()
        files.update(untracked)
    except (subprocess.CalledProcessError, OSError):
        pass

    return sorted(f for f in files if f.endswith(exts) and os.path.exists(f))


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        sys.exit(0)

    if not isinstance(data, dict):
        sys.exit(0)

    already_looping = bool(data.get("stop_hook_active"))
    failures: list[str] = []

    py_files = changed_files("backend/", (".py",))
    if py_files:
        rel = [f[len("backend/") :] for f in py_files]
        try:
            result = subprocess.run(
                ["uv", "run", "ruff", "check", *rel],
                cwd="backend",
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                failures.append("ruff check failed:\n" + result.stdout + result.stderr)
        except OSError:
            pass

    ts_files = changed_files("frontend/", (".ts", ".tsx"))
    if ts_files:
        rel = [f[len("frontend/") :] for f in ts_files]
        try:
            result = subprocess.run(
                ["pnpm", "exec", "eslint", *rel],
                cwd="frontend",
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                failures.append("eslint failed:\n" + result.stdout + result.stderr)
        except OSError:
            pass

    if not failures:
        sys.exit(0)

    if already_looping:
        sys.exit(0)

    # Exit code 2 on a Stop hook tells Claude Code to keep going instead of
    # ending the turn; stderr becomes the context for the next step.
    print("\n\n".join(failures), file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
