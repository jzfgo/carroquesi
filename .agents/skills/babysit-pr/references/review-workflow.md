# The review workflow this skill drives

The loop asks for re-reviews by commenting `@claude` on the PR, so the repo needs a
workflow running `anthropics/claude-code-action` on comment events. Read this when
Step 0 finds no such workflow, or to check the one it found. Show the user the
gaps; do not edit the workflow from inside the loop, since a PR that edits it
cannot be reviewed by it.

When the workflow is missing, the *Minimal example* below is the template for
the separate PR that SKILL.md's *No review workflow* offers, filled in as
*Filling in the example* says. That PR goes against the default branch and
only with the user's yes.

## Checklist

1. **Comment triggers.** `issue_comment` (top-level PR comments),
   `pull_request_review_comment` (inline replies) and `pull_request_review` of
   type `submitted` (the summary of a review), each gated on its body
   containing `@claude`. Without `issue_comment`, Step 4's request never fires.
   Without `pull_request_review`, an `@claude` in a review's summary does
   nothing.

2. **A trusted-author gate on every comment trigger.** `issue_comment` runs
   execute in the base repo's context *with its secrets*, whoever wrote the
   comment. GitHub withholds secrets from fork PRs only on the pull-request
   events (`pull_request`, `pull_request_review`, `pull_request_review_comment`)
   and on Dependabot-triggered runs; on a same-repo PR those review events get
   secrets too, whoever wrote the review.
   On a public repo, gating on `@claude` alone lets any stranger drive the agent
   with whatever tools `claude_args` grants. Require
   `author_association` in `OWNER`, `MEMBER` or `COLLABORATOR`.
   Gate the PR's author too, and set `include_comments_by_actor` to the trusted
   accounts plus `claude[bot]`: the agent can read the action's write-scoped app
   token, so a stranger's PR or comment must not reach the prompt either.

   The PR-author gate means `@claude` does nothing on PRs opened by bots such as
   Dependabot. That is on purpose, not a bug to fix: their bodies carry upstream
   release notes, written by whoever maintains the dependency. Do not suggest a
   `dependabot[bot]` exception. Review those PRs with Claude locally instead.
   The workflow says so in a comment, so a later review does not flag it.

   `include_comments_by_actor` is narrower than the `author_association` gate on
   purpose: it lists accounts, not roles. A collaborator added to the repo can
   trigger a run but their comments stay out of the prompt until they are added
   to the list. The workflow says so in a comment next to the list.

3. **One run per PR at a time, with a time limit.** A job-level `concurrency`
   group keyed on the PR number makes a second `@claude` wait for the first
   instead of racing it with overlapping reviews or pushes, and
   `timeout-minutes` stops a hung run from billing for the six-hour default.
   Keep the group on the job, not the workflow: at workflow level every
   comment, `@claude` or not, joins the group, and GitHub keeps only one
   pending run per group, so an ordinary comment would cancel a queued review.
   That same rule still applies among `@claude` requests: a third one sent
   while the second is queued replaces it, so only the latest pending request runs.

4. **A quoted `run-name` carrying the PR number.** `issue_comment` runs, the
   ones an `@claude` on the PR's conversation starts, are attributed to the
   default branch, so `gh run list --branch <feature>` never finds them (review
   events are attributed to the PR's head branch). A run name restores a
   PR-scoped handle:

   ```yaml
   run-name: "Claude — #${{ github.event.issue.number || github.event.pull_request.number }}"
   ```

   It must stay quoted. Unquoted, YAML reads the ` #` as the start of a comment
   and the name truncates to `Claude —`, losing the number it exists to carry.

5. **If it also reviews on `pull_request`, set `track_progress` for that event.**
   Giving the action a `prompt` makes it run in agent mode, which creates no
   comment and gives the agent no tool to post one: the run succeeds and nobody
   can read the review. `track_progress: true` forces the comment-posting mode
   while keeping the prompt. Comment triggers are already in that mode.

6. **Optional: fail loudly when a PR edits the workflow.** The action refuses a
   workflow file that differs from the default branch's copy, and that refusal
   can exit green having reviewed nothing. A guard step before the action, on
   `pull_request` only, turns the silence into a red check:

   ```yaml
   - name: Refuse to no-op when this PR edits the review workflow
     if: github.event_name == 'pull_request'
     run: |
       git fetch --quiet --depth=1 origin "$GITHUB_BASE_REF"
       if ! git diff --quiet FETCH_HEAD -- .github/workflows/claude.yml; then
         echo "::error::This PR edits the review workflow, so the action would not review it. Review it by hand."
         exit 1
       fi
   ```

   Replace `.github/workflows/claude.yml` with the workflow's own path if it
   lives elsewhere.

## Minimal example

```yaml
name: Claude Code
run-name: "Claude — #${{ github.event.issue.number || github.event.pull_request.number }}"

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    # Every trigger needs a trusted commenter AND a trusted PR author: the agent
    # can read the action's write-scoped token, so nothing an outsider wrote may
    # reach the prompt. As a result, `@claude` does nothing on PRs opened by bots
    # such as Dependabot. That is on purpose: their bodies carry upstream release
    # notes, written by whoever maintains the dependency. Review those locally.
    if: |
      (github.event_name == 'issue_comment' &&
        contains(github.event.comment.body, '@claude') &&
        contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association) &&
        contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.issue.author_association)) ||
      (github.event_name == 'pull_request_review_comment' &&
        contains(github.event.comment.body, '@claude') &&
        contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association) &&
        contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association)) ||
      (github.event_name == 'pull_request_review' &&
        contains(github.event.review.body, '@claude') &&
        contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.review.author_association) &&
        contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.pull_request.author_association))
    runs-on: ubuntu-latest
    timeout-minutes: 30
    # One run per PR at a time: a second @claude waits for the first. On the
    # job, not the workflow, so comments without @claude never join the group
    # (GitHub keeps one pending run per group and would cancel the queued one).
    concurrency:
      group: claude-${{ github.event.issue.number || github.event.pull_request.number }}
      cancel-in-progress: false
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
      actions: read # lets the reviewer read CI results
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          # Only these accounts' comments reach the prompt. When you add a
          # collaborator, add them here too, or Claude will not see their comments.
          include_comments_by_actor: "<your-login>,claude[bot]"
          additional_permissions: |
            actions: read
```

The action posts with its own OIDC-minted token (hence `id-token: write`), so the
read-only scopes above do not stop it commenting.

## Filling in the example

Fill each placeholder from what the repo has, as SKILL.md's *No review workflow*
reads it; never from a guess:

- **`include_comments_by_actor`:** replace `<your-login>` with the trusted logins,
  comma-separated, and keep `claude[bot]` last.
- **The secret:** keep `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`
  for an OAuth token. For an API key, replace that line with
  `anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}`. Use one, never both.
- **Pinning:** if the repo pins actions to commit SHAs, pin both `uses:` lines
  to the latest release **of the example's major version**, with the tag as a
  trailing comment, as the repo does. The latest release overall may be a new
  major whose inputs differ from the example's; check its inputs before taking
  it. The `v1` tag itself moves, so match full versions only:

  ```bash
  tag=$(gh api 'repos/anthropics/claude-code-action/releases?per_page=100' \
    --jq '[.[] | select((.prerelease | not) and (.tag_name | test("^v1\\.[0-9]")))][0].tag_name // empty')
  [ -n "$tag" ] || echo "no v1 release found: stop and check the major" >&2
  [ -n "$tag" ] && gh api "repos/anthropics/claude-code-action/commits/$tag" --jq .sha
  ```

  ```yaml
  - uses: anthropics/claude-code-action@<sha> # <tag>
  ```

  Do the same for `actions/checkout`, within its `v7` major: change the regex to `^v7\\.[0-9]`. If the repo uses tags, keep the
  example's major tags.
- **The runner:** if the repo's other workflows pin `runs-on` to a fixed image
  (`ubuntu-24.04`), use the same one, so a later revert of the pin covers this
  file too. Otherwise keep `ubuntu-latest`.
- Leave everything else as it is, comments included. The checklist items it
  meets (the three `@claude` triggers, the `author_association` gates on
  commenter and PR author, the job-level `concurrency` and `timeout-minutes`,
  the quoted `run-name`) are the reason the example exists, and the comments
  stop a later review from flagging the Dependabot gap and the narrow
  `include_comments_by_actor` as bugs. Do not trim them to make the file
  shorter.

Two optional additions make reviews more trustworthy. Both go in `claude_args`,
which is a single string:

- `--model <id>` picks the reviewer model.
- `--allowedTools "WebSearch,Bash(gh api:*)"` lets the reviewer check
  claims against sources and repo settings instead of recalling them.
  `--allowedTools` is an auto-approval list: a tool left off it still exists, but
  its call hits a permission prompt that nothing in CI can answer, so it comes
  back denied. Note that `gh api` also accepts `-X POST` and `-X DELETE`; only
  grant it behind the author gate of item 2.
- Do not add `WebFetch`. The action writes its write-scoped app token into
  origin's URL in `.git/config`, Claude can read that file (read-only shell
  commands are auto-approved, and a glob such as `cat .g?t/c*` gets past
  `Read(./.git/**)` deny rules), and WebFetch would let injected text send the
  token to any server.
