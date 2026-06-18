#!/usr/bin/env python3
"""PreToolUse hook (matcher: Edit|Write).

Promotes the AGENTS.md "HARD STOP — confirm a worktree is active (not main)"
rule from advisory text to an enforced boundary. The rule already said "no
exceptions"; a rule the agent can skim and reinterpret isn't actually that,
per the Skills/Rules/Hooks taxonomy — 100%-compliance requirements belong
in a hook, not a markdown bullet the agent re-reads each session.
"""

import json
import subprocess
import sys


def main() -> None:
    try:
        json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        sys.exit(0)

    try:
        branch = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except subprocess.CalledProcessError:
        # Not a git repo, or some other git failure — don't block on a
        # tooling problem unrelated to this check.
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
                        "You're on main. Per AGENTS.md: run /worktrunk before "
                        "touching any file — no exceptions for quick fixes, docs, "
                        "or config."
                    ),
                }
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
