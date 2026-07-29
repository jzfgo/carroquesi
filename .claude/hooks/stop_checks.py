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
asks whether the `main` checkout is carrying uncommitted work. That lives
here because a Stop hook runs once per turn and sees effects rather than
commands, which is the only way to catch a write that never passed through
Edit or Write. It shares the one-continuation floor with the lint checks but
is reported more loudly; the reasoning is at the call site.
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

    Returns None when this repo simply has no checkout on main — normal in a
    worktree-only setup, and it disables the whole check, which is correct:
    nothing is on main, so there is nothing there to protect. Raises when
    git itself failed, which is a different answer and must not be confused
    with this one.
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
    uncommitted work.** That holds however the file got there, so no way of
    phrasing a write evades it. Ignored files are excluded by `git status`
    itself, which is why the Edit|Write guard can exempt them without this
    side agreeing explicitly — including the machine-local sources,
    `.git/info/exclude` and `core.excludesFile`, which both layers honour.

    What it does not catch is a write that leaves the checkout clean:
    `git commit` on main, or `git stash`. Those are unguarded anywhere —
    tracked separately, and named in AGENTS.md rather than implied.

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

    # Says what it knows. This reads the checkout's current state, not a
    # delta, so it cannot tell dirt this turn caused from dirt that was
    # already there — and claiming the former sends the reader hunting for a
    # write nobody made.
    #
    # The remedy is deliberately non-destructive. `git clean` cannot be
    # undone, and suggesting it for files this session may not have written,
    # in a message whose whole purpose is to apply pressure, is the one way
    # this guard could cost more than the thing it guards against. `stash
    # push -u` satisfies the same invariant and keeps the work.
    return (
        f"The main checkout at {path} has uncommitted changes:\n\n"
        f"{dirty}\n\n"
        "Per AGENTS.md nothing may be written to main. This is the "
        "checkout's current state, not a record of what this turn did — the "
        "changes may predate this session, and the Edit|Write guard never "
        "saw whatever route produced them.\n\n"
        "Read the files before touching them. If the work is wanted, "
        f"`git -C {path} stash push -u` preserves it and leaves main clean; "
        "then continue in a worktree (`wt switch --create <branch> --no-cd "
        "--format=json`)."
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

    # Reported first because it outranks a lint error, but still subject to
    # the same one-continuation floor.
    #
    # JAV-66 offered two ways to stop the loop guard swallowing this:
    # exempt the check, or escalate its wording. Exempting it turns out to
    # be the dangerous choice. `stop_hook_active` is the only cap Claude
    # Code offers against a Stop-hook continuation loop, and this check
    # cannot tell dirt this turn caused from dirt that was already there —
    # so a maintainer with unrelated work in the main checkout would start
    # every session in a turn that cannot end, with the only available
    # pressure being toward discarding files the session never wrote. That
    # is worse than the dirt.
    #
    # So: escalate the wording instead. One forced continuation makes the
    # violation impossible to miss, the floored pass still reaches the user
    # through `systemMessage` (where lint stays quiet), and a main that is
    # still dirty re-fires on the very next turn. The nag survives; the trap
    # does not.
    #
    # No snapshot of the previous dirty set, deliberately — and not for the
    # reason it first looks like. Two sessions sharing a state file is a real
    # hazard, but it is a solved one: hooks receive `session_id`, so keying to
    # that settles concurrency completely. Do not re-propose the snapshot on
    # the strength of noticing that.
    #
    # It is rejected for a different reason. It puts a fail-open surface
    # inside the one check whose premise is that failing quiet is
    # unacceptable: a missing or half-written state file has to mean
    # either "fire" (re-arming the loop) or "stay quiet" (`return None` means
    # clean, rebuilt elsewhere). Holding no state is what lets silence here
    # provably mean "asked, and found clean". The cost is that a new write
    # during the continuation is reported one turn later instead of at once —
    # latency, not coverage, because main stays dirty until it is dealt with.
    dirty = main_checkout_dirty()
    if dirty is not None:
        failures.insert(0, dirty)

    if not failures:
        sys.exit(0)

    if already_looping:
        # `systemMessage` is the only channel that reaches anyone on the way
        # out. stderr is fed back on exit 2 and shown (first line only) on
        # other non-zero codes, but on exit 0 Claude Code reads stdout for
        # JSON and discards stderr — so printing there would satisfy a test
        # and tell nobody.
        #
        # Only `dirty` goes in it. The lint entries have lefthook waiting for
        # them at commit time; this does not, and a warning that arrives on
        # the way out should say the one thing that has no other route.
        #
        # That last property is the one thing here with no test behind it:
        # the temp repos in test_hooks.py contain no `backend/` or
        # `frontend/`, so `failures` is always just `[dirty]` there and
        # swapping this for the joined list changes nothing. Covering it
        # would mean running ruff from the test suite, which costs the file
        # its dependency-free premise — a worse trade. Verified by hand.
        #
        # `suppressOutput` keeps the raw JSON out of the transcript, so the
        # user sees the rendered warning rather than the blob as well. A
        # no-op if Stop-event stdout is not displayed anyway.
        #
        # Note this shares lint's single continuation. A chronically dirty
        # main therefore spends the budget lint would have used: the dirty
        # report takes Stop #1, and a ruff error introduced during that
        # continuation is not reported at Stop #2. Lefthook still blocks the
        # commit, so the cost is a later notice rather than a missed one.
        if dirty is not None:
            print(
                json.dumps(
                    {
                        # `systemMessage` reaches the user, not Claude, so
                        # this path has a different reader from the exit-2
                        # one — hence the lead-in. The body below is written
                        # for whoever is going to act on it either way.
                        #
                        # "unresolved", not "dirty": `dirty` is also non-None
                        # when git could not answer, and a lead-in asserting
                        # dirtiness above a body saying nothing was
                        # established would undo the honesty that reporting
                        # the git failure bought. Untested for the same
                        # reason as the joined-list property above — reaching
                        # it needs two consecutive Stops with git broken.
                        "systemMessage": (
                            "Heads up: this turn is ending with the main "
                            "checkout unresolved.\n\n" + dirty
                        ),
                        "suppressOutput": True,
                    }
                )
            )
        sys.exit(0)

    # Exit code 2 on a Stop hook tells Claude Code to keep going instead of
    # ending the turn; stderr becomes the context for the next step.
    print("\n\n".join(failures), file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
