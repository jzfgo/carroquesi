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

1. **Comment triggers.** `issue_comment` (top-level PR comments) and
   `pull_request_review_comment` (inline replies), each gated on the body
   containing `@claude`. Without `issue_comment`, Step 4's request never fires.

2. **A trusted-author gate on every comment trigger.** Comment-triggered runs
   execute in the base repo's context *with its secrets*, whoever wrote the
   comment. GitHub withholds secrets from `pull_request` runs from forks (and
   from Dependabot-triggered runs), not from comment events.
   On a public repo, gating on `@claude` alone lets any stranger drive the agent
   with whatever tools `claude_args` grants. Require
   `author_association` in `OWNER`, `MEMBER` or `COLLABORATOR`.
   Gate the PR's author too, and set `include_comments_by_actor` to the trusted
   accounts plus `claude[bot]`: the agent can read the action's write-scoped app
   token, so a stranger's PR or comment must not reach the prompt either.

3. **A quoted `run-name` carrying the PR number.** Comment-triggered runs are
   attributed to the default branch, so `gh run list --branch <feature>` never
   finds them. A run name restores a PR-scoped handle:

   ```yaml
   run-name: "Claude — #${{ github.event.issue.number || github.event.pull_request.number }}"
   ```

   It must stay quoted. Unquoted, YAML reads the ` #` as the start of a comment
   and the name truncates to `Claude —`, losing the number it exists to carry.

4. **If it also reviews on `pull_request`, set `track_progress` for that event.**
   Giving the action a `prompt` makes it run in agent mode, which creates no
   comment and gives the agent no tool to post one: the run succeeds and nobody
   can read the review. `track_progress: true` forces the comment-posting mode
   while keeping the prompt. Comment triggers are already in that mode.

5. **Optional: fail loudly when a PR edits the workflow.** The action refuses a
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

jobs:
  claude:
    if: |
      contains(github.event.comment.body, '@claude') &&
      contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association) &&
      contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.issue.author_association || github.event.pull_request.author_association)
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
      actions: read # lets the reviewer read CI results
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
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
  to the latest release, with the tag as a trailing comment, as the repo does:

  ```bash
  tag=$(gh release view --repo anthropics/claude-code-action --json tagName --jq .tagName)
  gh api "repos/anthropics/claude-code-action/commits/$tag" --jq .sha
  ```

  ```yaml
  - uses: anthropics/claude-code-action@<sha> # <tag>
  ```

  Do the same for `actions/checkout`. If the repo uses tags, keep the
  example's major tags.
- Leave everything else as it is. The checklist items it meets (the `@claude`
  gate, both `author_association` gates, the quoted `run-name`) are the reason
  the example exists; do not trim them to make the file shorter.

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
