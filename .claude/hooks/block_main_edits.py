#!/usr/bin/env python3
"""PreToolUse hook (matcher: Edit|Write).

Promotes the AGENTS.md "HARD STOP — confirm a worktree is active (not main)"
rule from advisory text to an enforced boundary. The rule already said "no
exceptions"; a rule the agent can skim and reinterpret isn't actually that,
per the Skills/Rules/Hooks taxonomy — 100%-compliance requirements belong
in a hook, not a markdown bullet the agent re-reads each session.

The branch is resolved from the *target file's* directory, not the hook's
cwd. Both are the repo root in the common case, but they diverge when a
session rooted on `main` writes into a worktree by absolute path — the only
route available here, since `EnterWorktree` is denied in
`.claude/settings.json` and nothing else can re-root a session. Keying on
cwd made that route indistinguishable from editing `main` directly, so it
blocked legitimate worktree writes; it also missed the mirror case, a
worktree-rooted session reaching back into the main checkout by absolute
path. Resolving per-path fixes both.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys


def _git_dir_for(path: str) -> str | None:
    """Nearest existing ancestor directory of `path`, for use as `git -C`.

    The file itself needn't exist yet (Write creates it), and neither need
    its parent — so walk up until something does. Returns None when nothing
    usable is found.
    """
    candidate = os.path.dirname(os.path.abspath(path))
    while True:
        if os.path.isdir(candidate):
            return candidate
        parent = os.path.dirname(candidate)
        if parent == candidate:
            return None
        candidate = parent


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        sys.exit(0)

    if not isinstance(data, dict):
        sys.exit(0)

    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        tool_input = {}
    file_path = tool_input.get("file_path")

    git_dir = None
    if isinstance(file_path, str) and file_path:
        git_dir = _git_dir_for(file_path)

    # No usable target path — fall back to cwd rather than waving the edit
    # through, so a malformed payload can't become an escape hatch.
    cmd = ["git", "branch", "--show-current"]
    if git_dir is not None:
        cmd[1:1] = ["-C", git_dir]

    try:
        branch = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        # Not a git repo, git not installed, or some other failure — don't
        # block on a tooling problem unrelated to this check.
        sys.exit(0)

    if branch != "main":
        sys.exit(0)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        "That path is on main. Per AGENTS.md: run /worktrunk before "
                        "touching any file — no exceptions for quick fixes, docs, or "
                        "config. Create one with `wt switch --create <branch> --no-cd "
                        "--format=json`, then write to the path it reports."
                    ),
                }
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
