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

It also carries one check that is not about lint at all: `main_checkout_dirty`
asks whether anything reached the `main` checkout this turn. That lives here
because a Stop hook runs once per turn and sees effects rather than
commands, which is the only way to catch a write that never passed through
Edit or Write. It is exempt from the loop guard; the reason is at the call
site.
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


class _GitUnavailable(Exception):
    """git could not answer the question.

    Distinct from "nothing to report", and kept distinct on purpose: a check
    that stays quiet when it failed to run reports success while verifying
    nothing, which is the defect this whole hook exists to remove. Silence
    here has to mean "asked and found clean", never "could not ask".
    """


def _main_checkout() -> str | None:
    """Path of this repository's checkout that sits on `main`, if any.

    Found rather than assumed: the main checkout is usually the repo root,
    but a session can be rooted anywhere, and `main` can be checked out in a
    worktree like any other branch. Scoped to this repository's worktree
    list on purpose — other checkouts on main (dotfiles, another project)
    are not this hook's business.

    Returns None when this repo simply has no checkout on main, which is the
    normal case in a worktree-only setup. Raises when git itself failed.
    """
    try:
        out = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (subprocess.CalledProcessError, OSError) as exc:
        raise _GitUnavailable(f"git worktree list failed: {exc}") from exc

    # Porcelain emits one blank-line-separated block per checkout, each
    # starting with `worktree <path>`. A detached HEAD has no `branch` line.
    path: str | None = None
    for line in out.splitlines():
        if line.startswith("worktree "):
            path = line[len("worktree ") :]
        elif line == "branch refs/heads/main" and path is not None:
            return path
    return None


def main_checkout_dirty() -> str | None:
    """Uncommitted changes sitting in the checkout on `main`, as a report.

    The PreToolUse guard matches Edit|Write, so a shell redirect, `sed -i`,
    an interpreter one-liner, a subagent or an MCP tool all reach main
    unguarded. Enumerating those routes is a denylist over how the write is
    phrased and loses by construction.

    The invariant that actually matters has no spelling: **main carries no
    uncommitted work.** That holds however the file got there, so nothing
    evades it. Ignored files are excluded by `git status` itself, which is
    why the Edit|Write guard can exempt them without this side agreeing
    explicitly.

    Detection, not prevention — the write has already landed by the time
    this runs. That is why the PreToolUse layer stays.

    A git failure is reported rather than swallowed, so "no message" always
    means main was checked and found clean.
    """
    try:
        path = _main_checkout()
    except _GitUnavailable as exc:
        return f"Could not check whether main is clean — {exc}"

    if path is None:
        return None

    try:
        dirty = subprocess.run(
            ["git", "-C", path, "status", "--porcelain"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, OSError) as exc:
        return (
            f"Could not check whether the main checkout at {path} is clean — "
            f"git status failed: {exc}"
        )

    if not dirty:
        return None

    return (
        f"The main checkout at {path} has uncommitted changes:\n\n"
        f"{dirty}\n\n"
        "Per AGENTS.md nothing may be written to main. Something this turn "
        "wrote there by a route the Edit|Write guard does not see. Move the "
        "work into a worktree (`wt switch --create <branch> --no-cd "
        "--format=json`) and restore main with `git -C "
        f"{path} restore` / `git -C {path} clean`, checking what the files "
        "are before discarding anything."
    )


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
    if ts_files and os.path.exists("frontend/node_modules"):
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

    # Deliberately ahead of the loop guard, and deliberately not subject to
    # it. A second lint failure can wait for lefthook at commit time; an
    # unguarded write to main cannot, because nothing downstream is looking
    # for it. Letting the loop guard swallow this would reproduce the exact
    # silence the check exists to break.
    dirty = main_checkout_dirty()
    if dirty is not None:
        print("\n\n".join([dirty, *failures]), file=sys.stderr)
        sys.exit(2)

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
