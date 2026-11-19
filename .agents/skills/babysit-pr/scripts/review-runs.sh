#!/usr/bin/env bash
# List every review comment the bot left on a PR, paired with the workflow run
# that comment belongs to and that run's status.
#
# Usage:   review-runs.sh <pr-number> [bot-login]
# Example: review-runs.sh 42
#          GH_REPO=owner/repo review-runs.sh 42 'claude[bot]'
#
# Output (TSV, one row per bot comment, in comment order):
#   comment_id  run_id  status  conclusion  created_at  updated_at
#
# run_id is "-" when the comment carries no [View job] link (yet), and
# status/conclusion are "-" when there is no run to look up. status is
# "unreadable" when the run exists in the link but gh cannot read it.
# A review counts as finished only with status "completed", conclusion
# "success" AND updated_at later than created_at (the placeholder was edited).
#
# Why this exists: the action posts a placeholder comment within seconds and
# edits it in place when the review finishes, so neither the comment's presence,
# its wording nor its created_at says whether the review is done. The run status
# does. The run id is taken ONLY from the [View job] link: a finished review also
# links the CI run it reports on, and that one finishes minutes earlier.
#
# Needs gh (authenticated) and jq. Uses the current repo, or GH_REPO if set.

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || ! $1 =~ ^[0-9]+$ ]]; then
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
fi

pr=$1
bot=${2:-claude[bot]}

# REST reports the bot as "claude[bot]"; GraphQL (gh pr view --json comments)
# reports the same account as "claude". This script uses REST.
# Fetch first, filter second: on an error gh prints the error body to stdout,
# and piping that into jq would bury the real message under a jq type error.
if ! comments=$(gh api "repos/{owner}/{repo}/issues/$pr/comments" --paginate); then
  echo "could not read the comments of #$pr (does the PR exist in this repo?)" >&2
  exit 1
fi

rows=$(
  jq -r --arg bot "$bot" '
      .[]
      | select(.user.login == $bot)
      | [ (.id | tostring),
          (first(.body | capture("\\[View job[^\\]]*\\]\\([^)]*/runs/(?<r>[0-9]+)") | .r) // "-"),
          .created_at,
          .updated_at ]
      | @tsv' <<<"$comments"
)

if [[ -z $rows ]]; then
  echo "no comments by $bot on #$pr" >&2
  exit 0
fi

printf 'comment_id\trun_id\tstatus\tconclusion\tcreated_at\tupdated_at\n'
while IFS=$'\t' read -r comment run created updated; do
  status=- conclusion=-
  if [[ $run != - ]]; then
    # A run can be deleted, expired or unreadable with this token. Report that
    # in the row instead of letting set -e end the table without a word.
    if run_info=$(gh run view "$run" --json status,conclusion \
      --jq '"\(.status) \(if .conclusion == "" then "-" else .conclusion end)"' 2>/dev/null); then
      read -r status conclusion <<<"$run_info"
    else
      status=unreadable conclusion=-
    fi
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$comment" "$run" "$status" "$conclusion" "$created" "$updated"
done <<<"$rows"
