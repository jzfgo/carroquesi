---
name: babysit-pr
description: Autonomously wrangle a PR through review until it is approved and ready to merge. Analyzes every open reviewer comment, fixes real issues with commits, posts polite fact-based rebuttals for hallucinated or false-positive feedback, triggers `@claude` re-reviews, and loops until CI is green and the review pass comes back clean. Invoke as `/babysit-pr` to target the current branch's PR, or `/babysit-pr <number>` for a specific PR. Use this whenever you want Claude to fully own a PR until it merges — handling reviewer back-and-forth, CI failures, and re-review cycles without manual intervention.
---

# PR Babysitter

Your mission: take ownership of this PR and drive it to a merge-ready state — threads
addressed, re-review clean, CI green. Work autonomously — fix real issues, push back on bad
feedback, and loop until done (or until the iteration cap, then report back).

## Step 0: Identify the Target PR

If a PR number was passed as an argument, use it. Otherwise find the PR for the current branch:

```bash
gh pr view --json number,title,url,state,reviewDecision
```

Confirm it exists and is open.

---

## The Loop

Repeat this entire protocol until the exit condition is met.

### 1. Assess Current State

Pull a full snapshot of the PR:

```bash
gh pr view <number> --json number,title,reviewDecision,statusCheckRollup,reviews,comments
```

Then fetch all inline review comments (these are the per-line ones reviewers leave on the diff):

```bash
gh api repos/:owner/:repo/pulls/<number>/comments --paginate
```

Check three things:
- **Unresolved threads?** Look for comment threads that haven't been replied to and aren't marked resolved.
- **Latest re-review?** Did the most recent `claude` comment raise new actionable findings?
- **CI status?** Any failing checks in `statusCheckRollup`?

If all threads are addressed, the latest re-review is clean, and CI is green → **you're done**.
Report the final state and exit. Note `reviewDecision` will normally still read
`REVIEW_REQUIRED` at this point — that is expected and is *not* a reason to keep looping
(see *Exit Condition*).

### 2. Triage Each Open Comment

For every unresolved comment thread, make a judgment call: **real issue** or **false positive**.

**Real issue** — the reviewer correctly identified something wrong in your code: a bug, a logic error, a style violation against the project's conventions, or a legitimate architectural concern. Read the referenced file and lines yourself before accepting the claim. Don't trust the description alone.

**False positive / hallucination** — signs to watch for:
- Reviewer claims a function, method, or API exists or behaves a certain way → verify it yourself (`grep`, read the source, check docs) before writing code to accommodate it
- Referenced line doesn't match what's actually in the diff
- Suggested change would make the code incorrect or break existing behavior
- "Best practice" contradicts patterns already established elsewhere in this codebase
- Reviewer describes something that would've been true in an older version

When uncertain, verify. Run the code, read the file, check the docs. Fact-checking reviewers is part of this job.

### 3. Act on Each Comment

**For real issues:**

Make the fix. Be surgical — only change what the comment is about. Then:

```bash
git add <files>
git commit -m "fix: <what was fixed>"
git push
```

**For false positives / hallucinations:**

Draft a response that is:
- Polite and non-defensive
- Specific: cites the exact line, output, doc, or spec that proves the point
- Brief: one to three sentences is enough

Post it as a reply to the comment thread:

```bash
gh api repos/:owner/:repo/pulls/<number>/comments/<comment-id>/replies \
  -X POST -f body="<your response>"
```

### 4. Trigger Re-Review

Once you've addressed a batch of comments (fixes pushed, responses posted), trigger a
re-review by posting a comment that mentions `@claude` and asks for a review:

```bash
gh pr comment <number> --body "@claude please re-review this PR — I've pushed fixes and replies for the open threads."
```

The mention is what matters, not an exact phrase: `.github/workflows/claude.yml` fires
`anthropics/claude-code-action` on any issue or review comment *containing* `@claude`,
and the rest of the comment is the instruction Claude follows. Say what changed since
the last pass so the re-review is targeted.

### 5. Monitor for Re-Review Completion

Poll every 60–90 seconds. The re-review lands as a **comment**, not a review — look for a
new comment authored by `claude` posted after your `@claude` request:

```bash
gh pr view <number> --json comments,reviewDecision,statusCheckRollup \
  --jq '.comments[] | select(.author.login == "claude") | .body'
```

Give it up to 10 minutes. Read the body of that comment and decide whether it raises **new
actionable findings** — do not wait for `reviewDecision` to change (see *Exit Condition*).
If there are new findings, go back to **Step 1**. If there are none, the review pass is clean.

---

## Handling CI Failures

If `statusCheckRollup` has failing checks:

1. Find the failed run:
   ```bash
   gh run list --branch <branch> --limit 5
   gh run view <run-id> --log-failed
   ```
2. Read the error. Fix the root cause in the code.
3. Commit and push. Wait for CI to re-run before the next loop iteration.

Never skip or suppress CI checks — fix the underlying problem.

---

## Exit Condition

Stop looping when **all three** are true:
1. No open, unresolved comment threads
2. The most recent `@claude` re-review raised no new actionable findings
3. All `statusCheckRollup` entries are passing

**Short-circuit:** if `reviewDecision == "APPROVED"` (a human approved, or the repo later
gains a reviewer that submits real reviews), you are done early regardless of #2.

### Do not gate on `reviewDecision`

`APPROVED` is not a reachable state in this repo's current workflow, so requiring it would
loop forever. Review bots here post an **issue comment**, not a review: on every PR where a
bot actually ran — #111 (gemini), #115 and #116 (claude) — `reviews` was empty and
`reviewDecision` stayed `REVIEW_REQUIRED`, including on PRs that merged. `main` has no
branch protection and requires no approvals. Treat `APPROVED` as a bonus, never a gate.

### Iteration cap

Run at most **5** full loop iterations. If you hit the cap without meeting the exit
condition — most likely a rebut → re-review → same-finding-again cycle, or a judgment call
in #2 that keeps misfiring — **stop and report to the user**: what is still open, what you
tried, and where you think it is stuck. Do not keep looping silently.
