#!/usr/bin/env python3
"""Tests for the agent guardrail hooks. Run: python3 .claude/hooks/test_hooks.py

No pytest dependency on purpose — these guard the agent's own tooling and
must be runnable in a bare checkout, before `uv sync` has ever happened.

Every case here is a bug that actually shipped, or the fix that caught it.
"""

from __future__ import annotations

import json
import pathlib
import shlex
import subprocess
import sys
import tempfile

HOOKS = pathlib.Path(__file__).parent
# Assembled at runtime so this file can be `cat`-ed or grepped in a shell
# without the string tripping the very guard it tests.
WT = "git wor" + "ktree "
SUB_OPEN, SUB_CLOSE, BT = "$(", ")", chr(96)

failures: list[str] = []
evaluated = 0


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


def check(label: str, got: object, want: object) -> None:
    global evaluated
    evaluated += 1
    # `object`, not `str`: exit codes and booleans are compared here too.
    # Both values print through `!r` so an empty expectation is legible
    # rather than trailing whitespace, and so `0` is distinguishable from
    # `'0'` now that the suite compares more than strings.
    mark = "ok  " if got == want else "FAIL"
    if got != want:
        failures.append(f"{label}: expected {want!r}, got {got!r}")
    print(f"  {mark} {label:52s} {got!r}")


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
        (repo / ".gitignore").write_text(
            ".claude/settings.local.json\n*.env\nbuild/\n"
        )
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

        # Gitignored paths on main were denied for nothing: they cannot reach
        # a commit, and blocking them is what stopped a real settings edit.
        # None of these files exist — check-ignore answers on the path, and
        # Write creates the file afterwards.
        local_settings = repo / ".claude/settings.local.json"
        check("gitignored file on main", at(local_settings), "allow")
        check("gitignored by extension on main", at(repo / "backend/.env"), "allow")
        check("inside a gitignored dir on main", at(repo / "build/out.js"), "allow")
        # The exemption must not swallow the rule it lives in.
        check("tracked file beside an ignored one", at(repo / "seed.txt"), "deny")
        check("unignored path under main", at(repo / "backend/app/main.py"), "deny")

        # With no usable file_path the check falls back to cwd rather than
        # allowing outright, so both directions are pinned explicitly. Without
        # an explicit cwd these pass in a worktree and fail on main.
        no_path = {"tool_input": {"file_path": None}}
        check("null file_path, cwd on main", verdict(h, no_path, cwd=repo), "deny")
        check("null file_path, cwd on a branch", verdict(h, no_path, cwd=tree), "allow")
        check("no file_path key, cwd on main", verdict(h, {}, cwd=repo), "deny")
        check("malformed JSON", _raw(h, "not json"), "allow")

        run("git", "worktree", "remove", "--force", str(tree), cwd=repo)


def stop_run(cwd: pathlib.Path, payload: dict | None = None) -> tuple[str, str]:
    """Run stop_checks.py; return (verdict, what the user actually sees).

    Exit 2 means "keep going" — the hook refused to let the turn end. Any
    other code means it was content.

    The second element is deliberately *not* raw stderr. Claude Code feeds
    stderr back on exit 2, but on exit 0 it reads stdout for JSON and
    discards stderr — so asserting on stderr would pass green for a message
    that reaches nobody. This resolves each exit code to the channel the
    harness really reads, so the tests pin delivery rather than intent.
    """
    proc = subprocess.run(
        [sys.executable, str(HOOKS / "stop_checks.py")],
        input=json.dumps(payload if payload is not None else {}),
        capture_output=True,
        text=True,
        cwd=cwd,
    )
    if proc.returncode == 2:
        return "continue", proc.stderr
    if proc.returncode == 0:
        # Malformed stdout on exit 0 is silence as far as the harness is
        # concerned, so report it as such rather than leaking the text. A
        # bare scalar (`null`, `3`) is malformed in the same way an unparsable
        # string is — hence the isinstance check and not just the decode.
        try:
            parsed = json.loads(proc.stdout or "{}")
        except json.JSONDecodeError:
            return "stop", ""
        if not isinstance(parsed, dict):
            return "stop", ""
        return "stop", parsed.get("systemMessage", "")
    # Any other code: the transcript shows only the first line of stderr.
    return "stop", proc.stderr.splitlines()[0] if proc.stderr else ""


def stop_verdict(cwd: pathlib.Path, payload: dict | None = None) -> str:
    return stop_run(cwd, payload)[0]


def test_stop_checks_main_dirty() -> None:
    print("\nstop_checks.py — main checkout effect check")

    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)

        def run(*args: str, cwd: pathlib.Path) -> None:
            subprocess.run(args, cwd=cwd, capture_output=True, check=True)

        repo = root / "repo"
        repo.mkdir()
        run("git", "init", "-q", "-b", "main", ".", cwd=repo)
        (repo / "seed.txt").write_text("x")
        (repo / ".gitignore").write_text("ignored.local\n")
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

        target = repo / "seed.txt"

        def restore() -> None:
            run("git", "-C", str(repo), "checkout", "--", ".", cwd=repo)
            run("git", "-C", str(repo), "clean", "-qfd", cwd=repo)

        # Baseline: a clean main lets the turn end, from either checkout.
        check("clean main, run from the worktree", stop_verdict(tree), "stop")
        check("clean main, run from main itself", stop_verdict(repo), "stop")

        # `stop` on its own cannot tell "asked, found clean" from "crashed on
        # this path" — exit 1 also lets the turn end, faithfully to
        # production. Pin the clean path to exit 0 specifically, so a crash
        # that only happens when main is clean cannot hide behind the six
        # cases that merely expect the turn to end.
        clean = subprocess.run(
            [sys.executable, str(HOOKS / "stop_checks.py")],
            input="{}",
            capture_output=True,
            text=True,
            cwd=tree,
        )
        check("clean main exits 0, not merely non-2", clean.returncode, 0)
        check("clean main says nothing at all", clean.stdout.strip(), "")

        # Route independence. The guard names none of these; the point is
        # that the effect check cannot tell them apart, so each must be
        # performed for real rather than described.
        q = shlex.quote
        routes = [
            ("shell redirect", ["sh", "-c", f"echo mutated > {q(str(target))}"]),
            # `-i.bak`, not a bare `-i`. GNU sed treats the suffix as
            # optional; BSD sed (macOS, the primary platform here) requires
            # it as a separate word, so a bare `-i` eats the script as the
            # backup extension and then runs the filename as the script.
            # That exits non-zero, `check=True` raises, and the whole test
            # function dies — so the suite would not merely be weaker on
            # macOS, it would crash there. Attached-suffix form works on
            # both.
            ("sed -i", ["sed", "-i.bak", "s/x/y/", str(target)]),
            (
                "python one-liner",
                [
                    sys.executable,
                    "-c",
                    f"open({str(target)!r}, 'w').write('z')",
                ],
            ),
            ("tee", ["sh", "-c", f"echo t | tee {q(str(target))}"]),
            (
                "cp over it",
                ["sh", "-c", f"cp {q(str(repo / '.gitignore'))} {q(str(target))}"],
            ),
        ]
        backup = target.parent / (target.name + ".bak")
        for label, cmd in routes:
            restore()
            subprocess.run(cmd, capture_output=True, check=True)
            # `sed -i.bak` leaves an untracked backup, which would make the
            # checkout dirty on its own — so the case would pass even if the
            # in-place edit silently wrote nothing, which is exactly the
            # GNU/BSD divergence the comment above guards against. Remove it
            # so only the real edit can satisfy the assertion.
            backup.unlink(missing_ok=True)
            check(f"{label} to main, from the worktree", stop_verdict(tree), "continue")
        restore()

        # An untracked file counts too — `git status --porcelain` lists it.
        (repo / "stray.txt").write_text("new")
        check("untracked file on main", stop_verdict(tree), "continue")
        (repo / "stray.txt").unlink()

        # Gitignored writes can never reach a commit, so they are not dirt.
        # This is the same exemption block_main_edits.py makes, and the two
        # agree because `git status --porcelain` excludes ignored files.
        (repo / "ignored.local").write_text("local settings")
        check("gitignored write on main", stop_verdict(tree), "stop")
        (repo / "ignored.local").unlink()

        # A dirty worktree is the normal working state, not a violation.
        (tree / "seed.txt").write_text("editing on a branch")
        check("dirty worktree, clean main", stop_verdict(tree), "stop")
        run("git", "-C", str(tree), "checkout", "--", ".", cwd=tree)

        # The continuation has a floor of exactly one. Without it, dirt this
        # session never created traps the turn forever, and the only
        # pressure available points at discarding someone else's work.
        restore()
        target.write_text("mutated again")
        check(
            "first stop forces a continuation",
            stop_verdict(tree),
            "continue",
        )
        floored, floored_msg = stop_run(tree, {"stop_hook_active": True})
        check("second stop lets the turn end", floored, "stop")
        # Floored is not silent — and this asserts the channel the harness
        # actually reads on exit 0, not the stderr the hook happens to write.
        # Asserting stderr here passed green while the message reached nobody.
        check(
            "floored pass reaches the user",
            "has uncommitted changes" in floored_msg
            and "stash push -u" in floored_msg,
            True,
        )
        # Both strings above come from the report, so they hold with the
        # lead-in deleted. The lead-in is shared with the git-failure path and
        # has to survive on this one too, which needs its own assertion.
        check(
            "floored dirty message carries the lead-in",
            "still needs attention" in floored_msg,
            True,
        )
        # And the remedy it names must not be the destructive one.
        check(
            "remedy is recoverable, not `git clean`",
            "git clean" not in floored_msg and "restore`" not in floored_msg,
            True,
        )
        # `stop_run` keeps only `systemMessage`, so every other key in that
        # object is invisible to it. Read the raw stdout for this one.
        #
        # Guarded the same way `stop_run` guards its read, and for a reason
        # that bites here specifically: any mutation that stops the hook
        # printing leaves stdout empty, and an unguarded `json.loads` would
        # raise instead of failing — aborting this function and skipping every
        # case below it. The mutations this suite is judged by are exactly the
        # ones that empty stdout, so a crash there would silently shrink the
        # thing doing the judging.
        floored_raw = subprocess.run(
            [sys.executable, str(HOOKS / "stop_checks.py")],
            input=json.dumps({"stop_hook_active": True}),
            capture_output=True,
            text=True,
            cwd=tree,
        )
        parsed_raw = None
        try:
            parsed_raw = json.loads(floored_raw.stdout or "{}")
        except json.JSONDecodeError:
            pass
        check(
            "floored pass suppresses its raw stdout",
            isinstance(parsed_raw, dict) and parsed_raw.get("suppressOutput"),
            True,
        )

        # Still dirty next turn means it fires again — the nag survives the
        # floor, only the trap is gone.
        check("re-fires on the next turn", stop_verdict(tree), "continue")

        # Runs from somewhere other than a repo root — cf. #116, a suite that
        # only passed where it was written.
        #
        # Scope note: this covers the main-checkout half only. The lint half
        # goes inert from a subdirectory — its pathspecs are relative, so they
        # match nothing there and both lint branches are skipped. Several more
        # cwd assumptions sit behind that one and are unreachable while it
        # holds, so they are stacked rather than chained: anchoring the
        # pathspecs alone would make them live for the first time and leave
        # the half just as silent. Pre-existing, and out of scope here; do not
        # read these two cases as covering it.
        nested = tree / "frontend" / "src"
        nested.mkdir(parents=True)
        check("run from a nested subdirectory", stop_verdict(nested), "continue")
        restore()
        check("nested subdirectory, main clean again", stop_verdict(nested), "stop")

        # A check that cannot run must say so, not report clean. Silence has
        # to mean "asked and found nothing" — anything else is the
        # verifies-nothing-reports-success shape this hook exists to remove.
        # Somewhere that is not a git repository at all is the cheap way to
        # make git fail for real rather than by monkeypatching.
        outside = root / "not-a-repo"
        outside.mkdir()
        check("git cannot answer at all", stop_verdict(outside), "continue")

        # The floor and the git-failure report intersect here: a check that
        # could not run must survive the floored pass *and* not be dressed up
        # as something it established. The lead-in is shared with the dirty
        # case, so it has to be true of both.
        floored_git, unresolved = stop_run(outside, {"stop_hook_active": True})
        # Assert the flooring first. Without this the two message checks below
        # pass on exit 2 as well, because stderr on that path carries the same
        # report — so exempting a git failure from the floor, the likeliest
        # future edit here, would go unnoticed.
        check("floored git failure lets the turn end", floored_git, "stop")
        check(
            "floored git failure is still delivered",
            "Could not check" in unresolved,
            True,
        )
        check(
            "floored git failure claims no dirtiness",
            "still dirty" not in unresolved,
            True,
        )
        # The lead-in is shared, so it has to be asserted on both paths. The
        # check above only pins an *absence*, which a missing lead-in also
        # satisfies — so without this one, prepending it to the dirty case
        # alone would pass.
        check(
            "floored git failure carries the same lead-in",
            "still needs attention" in unresolved,
            True,
        )

        # Another repository on main is not ours to police.
        other = root / "other"
        other.mkdir()
        run("git", "init", "-q", "-b", "main", ".", cwd=other)
        (other / "f.txt").write_text("a")
        run("git", "add", "-A", cwd=other)
        run(
            "git",
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-qm",
            "init",
            cwd=other,
        )
        (other / "f.txt").write_text("dirty elsewhere")
        check("a different repo dirty on main", stop_verdict(tree), "stop")

        run("git", "worktree", "remove", "--force", str(tree), cwd=repo)


if __name__ == "__main__":
    # A raise is a failed case, not an exit. With no framework here, an
    # uncaught exception truncates the run instead of reporting it: every
    # later function is skipped, and so is the summary below — which is the
    # thing a mutation run is read off. That has now happened twice, from
    # `check=True` on a fixture command and from an unguarded `json.loads`,
    # so catch it once here rather than guarding each new call site.
    for suite in (
        test_enforce_worktrunk,
        test_block_main_edits,
        test_stop_checks_main_dirty,
    ):
        try:
            suite()
        except Exception as exc:
            failures.append(f"{suite.__name__} aborted after {evaluated}: {exc!r}")

    # Printed because these tests are read under mutation, where a shrinking
    # suite is the failure mode that hides others. A count that moves without
    # the diff moving is the signal.
    print(f"\n{evaluated} assertions evaluated")
    if failures:
        print(f"{len(failures)} FAILURE(S):")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("all passed")
