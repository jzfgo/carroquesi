#!/usr/bin/env python3
"""Tests for the agent guardrail hooks. Run: python3 .claude/hooks/test_hooks.py

No pytest dependency on purpose — these guard the agent's own tooling and
must be runnable in a bare checkout, before `uv sync` has ever happened.

Every case here is a bug that actually shipped, or the fix that caught it.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile

HOOKS = pathlib.Path(__file__).parent
# Assembled at runtime so this file can be `cat`-ed or grepped in a shell
# without the string tripping the very guard it tests.
WT = "git wor" + "ktree "
SUB_OPEN, SUB_CLOSE, BT = "$(", ")", chr(96)

failures: list[str] = []


def verdict(hook: str, payload: dict) -> str:
    proc = subprocess.run(
        [sys.executable, str(HOOKS / hook)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
    )
    return "deny" if proc.stdout.strip() else "allow"


def check(label: str, got: str, want: str) -> None:
    mark = "ok  " if got == want else "FAIL"
    if got != want:
        failures.append(f"{label}: expected {want}, got {got}")
    print(f"  {mark} {label:52s} {got}")


def bash(command: str) -> dict:
    return {"tool_name": "Bash", "tool_input": {"command": command}}


def test_enforce_worktrunk() -> None:
    print("enforce_worktrunk.py")
    h = "enforce_worktrunk.py"

    # Tool-level split: lifecycle is gated, navigation is not.
    for label, ti, want in [
        ("EnterWorktree(name=...) creates", {"name": "x"}, "deny"),
        ("EnterWorktree() random name, creates", {}, "deny"),
        ("EnterWorktree(path=...) navigates", {"path": "/a/b"}, "allow"),
        ("EnterWorktree(path='') creates", {"path": ""}, "deny"),
    ]:
        check(label, verdict(h, {"tool_name": "EnterWorktree", "tool_input": ti}), want)

    for label, ti, want in [
        ("ExitWorktree(remove)", {"action": "remove"}, "deny"),
        ("ExitWorktree(keep)", {"action": "keep"}, "allow"),
    ]:
        check(label, verdict(h, {"tool_name": "ExitWorktree", "tool_input": ti}), want)

    # Real invocations must be caught regardless of surrounding syntax.
    for label, cmd in [
        ("bare mutating subcommand", WT + "prune"),
        ("add with args", WT + "add ../x -b y"),
        (
            "chained after a prose-carrying flag",
            "gh pr edit --title 'x' && " + WT + "remove z",
        ),
        ("on the line after a heredoc", "cat <<'E'\nhello\nE\n" + WT + "prune"),
        ("behind a -C global flag", "git -C /r " + WT.replace("git ", "") + "add ../q"),
    ]:
        check(label, verdict(h, bash(cmd)), "deny")

    # Prose describing the guard is not running it (PR #115).
    for label, cmd in [
        (
            "heredoc body mentions it",
            'gh pr create --body "'
            + SUB_OPEN
            + "cat <<'E'\nrun "
            + WT
            + "prune\nE\n"
            + SUB_CLOSE
            + '"',
        ),
        ("--body flag mentions it", "gh pr create --body 'we block " + WT + "add'"),
        (
            "-m commit message mentions it",
            "git commit -m 'note: " + WT + "remove is gated'",
        ),
        ("heredoc written with a space: << E", "cat << 'E'\nmentions " + WT + "add\nE"),
        (
            "single quotes, no shell expansion",
            "gh pr create --body '" + SUB_OPEN + WT + "add /tmp/x" + SUB_CLOSE + "'",
        ),
        (
            "quoted heredoc delim suppresses expansion",
            "cat <<'E'\n" + SUB_OPEN + WT + "add x" + SUB_CLOSE + "\nE",
        ),
        (
            "double-quoted heredoc delim also suppresses",
            'cat <<"E"\n' + SUB_OPEN + WT + "add x" + SUB_CLOSE + "\nE",
        ),
        (
            "single-quoted -m with a backtick",
            "git commit -m '" + BT + WT + "add x" + BT + "'",
        ),
        ("read-only listing", WT + "list"),
        ("wt itself", "wt switch --create feat/x"),
        ("unrelated git", "git add -A && git commit"),
    ]:
        check(label, verdict(h, bash(cmd)), "allow")

    # Stripping may only justify allowing — never hide a live call. Bash runs
    # command substitution during argument expansion, before `gh` is invoked.
    for label, cmd in [
        (
            "$(...) inside a double-quoted --body",
            'gh pr create --body "' + SUB_OPEN + WT + "add /tmp/evil" + SUB_CLOSE + '"',
        ),
        (
            "backticks inside a double-quoted --body",
            'gh pr create --body "' + BT + WT + "add /tmp/evil" + BT + '"',
        ),
        (
            "$(...) in an unquoted heredoc body",
            "cat <<E\n" + SUB_OPEN + WT + "add /tmp/evil" + SUB_CLOSE + "\nE",
        ),
    ]:
        check(label, verdict(h, bash(cmd)), "deny")

    # Malformed payloads must not become an escape hatch for the tool cases,
    # but a Bash command we cannot parse is allowed, matching block_no_verify.
    check("malformed JSON", _raw(h, "not json"), "allow")
    check(
        "null tool_input",
        verdict(h, {"tool_name": "Bash", "tool_input": None}),
        "allow",
    )


def _raw(hook: str, text: str) -> str:
    proc = subprocess.run(
        [sys.executable, str(HOOKS / hook)], input=text, capture_output=True, text=True
    )
    return "deny" if proc.stdout.strip() else "allow"


def test_block_main_edits() -> None:
    print("\nblock_main_edits.py")
    h = "block_main_edits.py"

    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)

        def run(*args: str, cwd: pathlib.Path) -> None:
            subprocess.run(args, cwd=cwd, capture_output=True, check=True)

        repo = root / "repo"
        repo.mkdir()
        run("git", "init", "-q", "-b", "main", ".", cwd=repo)
        (repo / "seed.txt").write_text("x")
        run("git", "add", "-A", cwd=repo)
        run(
            "git",
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-qm",
            "init",
            cwd=repo,
        )

        tree = root / "wt"
        run("git", "worktree", "add", "-q", "-b", "feat/x", str(tree), cwd=repo)

        def at(path: pathlib.Path) -> str:
            return verdict(h, {"tool_input": {"file_path": str(path)}})

        # The branch of the *target path* decides — not the process's cwd.
        check("path in a checkout on main", at(repo / "a.txt"), "deny")
        check("path in a worktree on a branch", at(tree / "a.txt"), "allow")
        check("nonexistent nested dir under main", at(repo / "x/y/z.txt"), "deny")
        check("nonexistent nested dir under worktree", at(tree / "x/y/z.txt"), "allow")
        check("path outside any repo", at(root / "loose.txt"), "allow")

        # A malformed payload falls back to cwd rather than allowing outright.
        check(
            "null file_path", verdict(h, {"tool_input": {"file_path": None}}), "allow"
        )
        check("malformed JSON", _raw(h, "not json"), "allow")

        run("git", "worktree", "remove", "--force", str(tree), cwd=repo)


if __name__ == "__main__":
    test_enforce_worktrunk()
    test_block_main_edits()
    print()
    if failures:
        print(f"{len(failures)} FAILURE(S):")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("all passed")
