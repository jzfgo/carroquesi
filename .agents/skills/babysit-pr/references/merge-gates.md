# Reading what blocks a merge

Read at exit, to report the PR's real merge state instead of a bare status word.
Nothing here licenses merging; it tells you what to say.

## Two protection systems: read both

GitHub has two independent ways to protect a branch, and each endpoint sees only
its own:

```bash
gh api "repos/{owner}/{repo}/rules/branches/<BASE>"         # rulesets
gh api "repos/{owner}/{repo}/branches/<BASE>/protection"    # classic branch protection
```

- The classic endpoint returns **404 "Branch not protected"** for a branch
  protected only by rulesets. Concluding "unprotected" from that 404 is wrong.
- The rulesets endpoint returns **`[]`** for a branch protected only by classic
  protection. Concluding "unprotected" from that is just as wrong.

The branch is unprotected only when both come back empty. If both return rules,
all of them apply. Reading the classic endpoint needs admin access; a 403 there
means "unknown", so say that rather than guessing.

Classic protection reports the same ideas under other names:
`required_status_checks.contexts` (or `.checks`) and `.strict`,
`required_pull_request_reviews.required_approving_review_count`,
`required_linear_history.enabled`, and `enforce_admins.enabled`. When
`enforce_admins` is off, admins bypass it all.

Ruleset rule types to look for:

| Rule | What it means for the PR |
|---|---|
| `required_status_checks` | The named check contexts must pass. Only those gate: a check outside the list can be red or pending without blocking. With `strict_required_status_checks_policy: true`, the branch must also be up to date with `<BASE>`. |
| `pull_request` | `required_approving_review_count`, `required_review_thread_resolution` and friends. A count of 0 means no approval is needed. |
| `required_linear_history` | Squash or rebase merges only. Never fix `BEHIND` with a merge commit. |
| `update` | Only actors in the bypass list may update the branch, a merge included. Everyone else stays `BLOCKED` for good. |

Each rule carries its `ruleset_id`, but not who may bypass it. The ruleset itself
lists its `bypass_actors`, given admin access:
`gh api "repos/{owner}/{repo}/rulesets/<ruleset_id>" --jq .bypass_actors`.

## `mergeStateStatus`

- **`CLEAN`**: GitHub sees nothing blocking.
- **`BEHIND`**: the base moved and the strict status-check policy requires the
  branch to catch up. This is the one status the loop can fix, and Step 1
  fixes it before requesting a review. The *Exit* section of `SKILL.md` sends
  the loop back to Step 1 if it reads `BEHIND` there, so it should not reach
  this report; if it does, report it as the rule left to satisfy.
- **`BLOCKED`**: some rule is unsatisfied. Name it; never report "awaiting
  approval" unless an approval rule is actually the one failing. Common causes:
  - A required check that is failing, pending or **absent**. Absent is the trap:
    if GitHub drops a push event, the new HEAD has no checks reported at all,
    which is neither passing nor failing and blocks silently. Re-running an old
    run does not help, since it belongs to another commit. A new push brings
    them back; ask the user before pushing an empty commit for it.
  - An `update` rule. On a PR that meets every other rule, this is the `BLOCKED`
    that remains, and it is expected: only a bypass actor can merge.
  - An approval rule, when the count is above 0.
- **`UNKNOWN`**: GitHub has not computed it yet. Re-query in a minute. Do not
  try a merge to find out: a plain merge attempted while the status is `UNKNOWN`
  can go through on the user's bypass without asking. This was observed in
  practice, not taken from GitHub's docs, which is one more reason never to
  merge from inside the loop.
- **`UNSTABLE`**: mergeable, but a check outside the required list is failing.
  Exit condition 3 still waits for it.
- **`HAS_HOOKS`**: mergeable, with passing status and pre-receive hooks that run
  on merge (GitHub Enterprise Server). Nothing to fix; mention it.
- **`DRAFT`**: deprecated in the schema in favour of the PR's `isDraft` field,
  so read `isDraft` instead of relying on this value. Converting a draft is the
  user's call.
- **`DIRTY`**: conflicts with the base. Rebase and resolve, or report them if
  the resolution is not obvious from the code.

## Checks that look green but did not run

A job skipped by an `if:` condition reports **success**. A repo that gates jobs
on changed paths shows a green page for jobs that never ran. If it matters which
jobs executed, read the run's job list (`gh run view <run-id> --json jobs`) rather
than the check names.

## Seeing which rule a past push hit

`mergeStateStatus` never names the rule. The rule-suite log does, if the user's
own token has admin access (an Actions token gets 403):

```bash
gh api "repos/{owner}/{repo}/rulesets/rule-suites?ref=<BASE>&time_period=day" \
  --jq '.[] | "\(.id) \(.pushed_at) \(.result)"'
gh api "repos/{owner}/{repo}/rulesets/rule-suites/<id>" \
  --jq '.rule_evaluations[] | "\(.rule_type) \(.result) \(.details // "")"'
```

## What to hand the user

List each requirement you checked and its state. If all are met except a bypass-only
`update` rule, say that the PR is ready and that the merge needs their bypass. The
choice of merge method, and of using `--admin`, is theirs. Note that
`dismiss_stale_reviews_on_push` drops an existing approval on any later push, so
mention it if you pushed after a human approved.
