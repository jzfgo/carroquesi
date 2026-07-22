#!/usr/bin/env python3
"""PreToolUse hook (matcher: EnterWorktree|ExitWorktree|Bash).

Worktree *lifecycle* belongs to worktrunk; worktree *navigation* does not.

`wt switch --create` runs this project's hooks — direnv, dependency install,
alembic migrate, seed. A worktree created any other way is missing `.env`,
`node_modules`, and a migrated database, so it looks fine and fails on the
first command. That is the whole reason lifecycle is pinned to `wt`.

Re-rooting a session into a worktree that already exists has no such
consequence: it touches no git state at all. Denying it (as an outright
`permissions.deny` on EnterWorktree did) blocked the harmless half while
leaving `git worktree add` reachable through Bash — the guard was inverted
relative to its own goal. So the split here is by *operation*, not by tool:

  denied                             allowed
  ------                             -------
  EnterWorktree(name=...)            EnterWorktree(path=...)
  EnterWorktree()  -> random name    ExitWorktree(action="keep")
  ExitWorktree(action="remove")
  Bash: git worktree add|remove|prune|move
"""

from __future__ import annotations

import json
import re
import sys

# `git worktree list` is deliberately absent — it is read-only and used
# constantly. Only the mutating subcommands are gated. The optional group
# absorbs global flags, so `git -C /path worktree add` is caught too.
GIT_WORKTREE_MUTATION = re.compile(
    r"\bgit\b(?:\s+-\S+(?:\s+\S+)?)*\s+worktree\s+(?:add|remove|prune|move)\b"
)

# Prose that *mentions* these commands is not running them. Without this,
# `gh pr create` with a body describing the guard trips the guard — which is
# exactly how this was found. Same treatment as block_no_verify.py.
HEREDOC = re.compile(
    r"<<[-~]?['\"]?(\w+)['\"]?[^\n]*\n.*?\n[ \t]*\1[ \t]*(?=\n|$)", re.DOTALL
)
INLINE_MESSAGE = re.compile(
    r"""(?:-\w*m|--message|--body|--title)\s*=?\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')"""
)


def _strip_prose(command: str) -> str:
    """Remove heredoc bodies and quoted message/body args before matching."""
    return INLINE_MESSAGE.sub("''", HEREDOC.sub("", command))


def _deny(reason: str) -> None:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    sys.exit(0)


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        sys.exit(0)

    if not isinstance(data, dict):
        sys.exit(0)

    tool_name = data.get("tool_name")
    tool_input = data.get("tool_input")
    if not isinstance(tool_input, dict):
        tool_input = {}

    if tool_name == "EnterWorktree":
        # `path` enters an existing worktree — navigation, no git side effects.
        # Anything else creates one, including the no-argument form, which
        # generates a random name. Absence of `path` is the tell.
        if not tool_input.get("path"):
            _deny(
                "Creating worktrees natively skips this project's wt hooks "
                "(direnv, deps, migrate, seed) and yields a worktree that "
                "breaks on first use. Run `wt switch --create <branch> "
                "--no-cd --format=json`, then EnterWorktree with the `path` "
                "it reports."
            )
        sys.exit(0)

    if tool_name == "ExitWorktree":
        if tool_input.get("action") == "remove":
            _deny(
                "Removing worktrees goes through worktrunk so branch cleanup "
                'stays consistent. Use ExitWorktree with action "keep" to '
                "leave the session, then `wt remove <branch>`."
            )
        sys.exit(0)

    if tool_name == "Bash":
        command = tool_input.get("command")
        if isinstance(command, str) and GIT_WORKTREE_MUTATION.search(
            _strip_prose(command)
        ):
            _deny(
                "Manage worktrees with the `wt` CLI, not raw git — `wt switch "
                "--create` runs the project's setup hooks and `wt remove` "
                "cleans up the branch. `git worktree list` is fine."
            )

    sys.exit(0)


if __name__ == "__main__":
    main()
