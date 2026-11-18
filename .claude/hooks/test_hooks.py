#!/usr/bin/env python3
"""Tests for the agent guardrail hooks. Run: python3 .claude/hooks/test_hooks.py

No pytest dependency on purpose — these guard the agent's own tooling and
must be runnable in a bare checkout, before `uv sync` has ever happened.

Every case here is a bug that actually shipped, or the fix that caught it.
"""

from __future__ import annotations

import json
import os
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


def verdict(hook: str, payload: dict, cwd: pathlib.Path | None = None) -> str:
    """Run a hook against a payload.

    `cwd` must be given for any case whose expected answer depends on it —
    block_main_edits falls back to the working directory when the payload
    carries no usable file_path. Leaving it implicit makes the test pass in
    a worktree and fail on main, which is exactly what happened.
    """
    proc = subprocess.run(
        [sys.executable, str(HOOKS / hook)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=cwd,
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

        # develop is long-lived like main; direct edits are blocked the same way.
        run("git", "checkout", "-q", "-b", "develop", cwd=repo)
        check("path in a checkout on develop", at(repo / "a.txt"), "deny")
        run("git", "checkout", "-q", "main", cwd=repo)

        check("nonexistent nested dir under main", at(repo / "x/y/z.txt"), "deny")
        check("nonexistent nested dir under worktree", at(tree / "x/y/z.txt"), "allow")
        check("path outside any repo", at(root / "loose.txt"), "allow")

        # With no usable file_path the check falls back to cwd rather than
        # allowing outright, so both directions are pinned explicitly. Without
        # an explicit cwd these pass in a worktree and fail on main.
        no_path = {"tool_input": {"file_path": None}}
        check("null file_path, cwd on main", verdict(h, no_path, cwd=repo), "deny")
        check("null file_path, cwd on a branch", verdict(h, no_path, cwd=tree), "allow")
        check("no file_path key, cwd on main", verdict(h, {}, cwd=repo), "deny")
        check("malformed JSON", _raw(h, "not json"), "allow")

        run("git", "worktree", "remove", "--force", str(tree), cwd=repo)


FAKE_TOOL = """#!{python}
# Stands in for a real tool: logs the call, and fails when FAIL names it.
import os, sys
argv = [os.path.basename(sys.argv[0]), *sys.argv[1:]]
call = os.path.basename(os.getcwd()) + " " + " ".join(argv)
with open(os.environ["LOG"], "a") as f:
    f.write(call + "\\n")
if any(word and word in call for word in os.environ.get("FAIL", "").split(",")):
    print(call + " broke")
    sys.exit(1)
"""


def test_stop_checks() -> None:
    print("\nstop_checks.py")

    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        repo = root / "repo"
        (repo / "backend").mkdir(parents=True)
        (repo / "frontend" / "node_modules" / ".bin").mkdir(parents=True)
        tool = FAKE_TOOL.format(python=sys.executable)
        for path in [bin_dir / "uv", bin_dir / "npm", repo / "frontend/node_modules/.bin/eslint"]:
            path.write_text(tool)
            path.chmod(0o755)

        def git(*args: str) -> None:
            subprocess.run(["git", *args], cwd=repo, capture_output=True, check=True)

        git("init", "-q", "-b", "feat/x", ".")
        (repo / "seed.txt").write_text("x")
        git("add", "seed.txt")
        git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init")

        log = root / "calls.log"

        def stop(
            changed: list[str], fail: str = "", looping: bool = False
        ) -> tuple[int, list[str]]:
            """Run the hook with `changed` as this turn's edits; return (exit, calls)."""
            for rel in changed:
                (repo / rel).write_text("x = 1\n")
            log.write_text("")
            env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
            env.update(LOG=str(log), FAIL=fail)
            proc = subprocess.run(
                [sys.executable, str(HOOKS / "stop_checks.py")],
                input=json.dumps({"stop_hook_active": looping}),
                capture_output=True,
                text=True,
                cwd=repo,
                env=env,
            )
            for rel in changed:
                (repo / rel).unlink()
            return proc.returncode, log.read_text().splitlines()

        def same(got: object, want: object) -> str:
            return "ok" if got == want else f"{got!r} != {want!r}"

        backend = ["backend uv run ruff check main.py", "backend uv run ty check"]
        frontend = ["frontend eslint App.tsx", "frontend npm run --silent typecheck"]

        check("nothing changed: no checks", same(stop([]), (0, [])), "ok")
        check(
            "backend .py changed: ruff + ty only",
            same(stop(["backend/main.py"]), (0, backend)),
            "ok",
        )
        check(
            "frontend .tsx changed: eslint + typecheck only",
            same(stop(["frontend/App.tsx"]), (0, frontend)),
            "ok",
        )
        check(
            "non-code file changed: no checks",
            same(stop(["backend/notes.md", "frontend/notes.md"]), (0, [])),
            "ok",
        )
        check("ty failure continues the turn", str(stop(["backend/main.py"], "ty check")[0]), "2")
        check(
            "frontend typecheck failure continues the turn",
            str(stop(["frontend/App.tsx"], "typecheck")[0]),
            "2",
        )
        check(
            "failure on a second pass lets the turn end",
            str(stop(["backend/main.py"], "ty check", looping=True)[0]),
            "0",
        )


if __name__ == "__main__":
    test_enforce_worktrunk()
    test_block_main_edits()
    test_stop_checks()
    print()
    if failures:
        print(f"{len(failures)} FAILURE(S):")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("all passed")
