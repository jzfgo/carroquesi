#!/usr/bin/env python3
"""PreToolUse hook (matcher: Bash).

Denies any command that bypasses the lefthook gates via `--no-verify` or
the `LEFTHOOK=0` / `LEFTHOOK_EXCLUDE=` environment-variable escape hatches.
Adapted from the Claude Code hook pattern in Steve Kinney's "Git Hooks with
Lefthook" lesson — original examples are Node; this is the Python
equivalent so it doesn't depend on node being on $PATH when the hook fires.
"""

import json
import re
import sys

BLOCKED_PATTERNS = [
    r"(^|\s)--no-verify(\s|$)",
    r"\bgit\b.*\bcommit\b.*\s-n(\s|$)",  # -n is the short form of --no-verify
    r"(^|\s)LEFTHOOK=0(\s|$)",
    r"(^|\s)LEFTHOOK_EXCLUDE=",
]


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
    command = tool_input.get("command")
    if not isinstance(command, str):
        command = ""

    # Strip heredoc blocks so commit messages don't trigger false positives.
    # Surgically removes <<DELIM ... DELIM blocks rather than truncating at
    # the first "<<", which would also discard commands chained after the heredoc.
    command = re.sub(
        r"<<[-~]?['\"]?(\w+)['\"]?[^\n]*\n.*?\n[ \t]*\1[ \t]*(?=\n|$)",
        "",
        command,
        flags=re.DOTALL,
    )
    # Also strip -m "..." / -m '...' inline message arguments.
    command = re.sub(
        r"""(?:-\w*m|--message)\s*=?\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')""",
        "-m ''",
        command,
    )

    if not any(re.search(p, command) for p in BLOCKED_PATTERNS):
        sys.exit(0)

    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        "Never bypass git hooks with --no-verify, LEFTHOOK=0, or "
                        "LEFTHOOK_EXCLUDE. Fix the failing lefthook command instead "
                        "of skipping it."
                    ),
                }
            }
        )
    )
    sys.exit(0)


if __name__ == "__main__":
    main()
