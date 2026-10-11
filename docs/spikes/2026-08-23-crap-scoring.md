# Spike: CRAP scoring for CarroQueSí

**Date:** 2026-08-23 · **Status:** done · **Verdict:** useful as an occasional audit; not worth CI wiring today. See [Recommendation](#recommendation).

## What CRAP is

CRAP (Change Risk Anti-Patterns) scores a function by combining its
cyclomatic complexity with its test coverage:

```
CRAP(m) = comp(m)² × (1 − cov(m))³ + comp(m)
```

The cubic coverage term means testing collapses the score fast: a
complexity-10 function scores 110 untested but ~10 fully tested. The
conventional threshold is **CRAP ≥ 30** ("crappy"). A high score means
*risky to change*: complex logic nobody's tests would catch you breaking.

Two distinct signals hide in one number, and they need different fixes:

- **High comp × low cov** → a testing gap. The real target of the metric.
- **High comp × high cov** → CRAP ≈ comp. A refactor-size signal, not a
  testing one; the tests already protect it.

## Method

No maintained off-the-shelf CRAP tool exists for either ecosystem (the
Python and npm attempts are all abandoned pre-2020), so the spike glued
each stack's coverage output to a complexity source with a ~150-line
throwaway script. SonarQube was considered and set aside: it computes
its own metrics (not CRAP), and a hosted service is out of proportion
for this project.

### Backend (Python)

```sh
cd backend
uv run --with pytest-cov --with radon pytest --cov=app --cov-report=json:cov.json
uv run --with radon radon cc -j app > radon.json
```

Join: radon gives each function/method a `lineno`–`endline` range and a
complexity; coverage.py gives per-file `executed_lines` / `missing_lines`.
Per-function coverage = executed executable lines inside the range ÷ all
executable lines inside it. Only `function`/`method` blocks are scored
(`class` blocks would double-count their methods).

### Frontend (TypeScript)

```sh
cd frontend
pnpm vitest run --coverage   # with 'json' added to coverage.reporter → coverage-final.json
npx eslint "src/**/*.{ts,tsx}" --rule '{"complexity": ["warn", 0]}' --format json
```

Join: the istanbul-format `coverage-final.json` lists every function
(`fnMap`) with its declaration line and span, plus per-statement hit
counts. ESLint's `complexity` rule at threshold 0 warns on every
function with its complexity, anchored at the declaration line. Matched
by file + declaration line (nearest-in-span fallback). Per-function
coverage = covered statements inside the function span ÷ all statements
in it. 6 of 1129 functions failed to match — negligible.

## Findings

Suites at the spike's commit: backend 634 passed, frontend 1078 passed.

### Backend — healthy

153 functions scored, **2 with CRAP ≥ 30**:

| CRAP | comp | cov | function |
|-----:|-----:|----:|----------|
| 48.7 | 7 | 5% | `app/routers/share.py` `invite_share_page` |
| 41.0 | 41 | 98% | `app/routers/receipt.py` `apply_receipt_prices` |

- **`invite_share_page` is the one real testing gap**: the OG
  share-preview endpoint has no test touching it at all (no test file
  references it or `/i/`). Moderate complexity, effectively untested.
- `apply_receipt_prices` scores on complexity alone (98% covered) — the
  receipt-apply transaction is simply the biggest function in the
  backend. A refactor candidate someday, not a testing problem.
- Everything else ≤ 20, and the next dozen are all >90% covered. The
  backend suite is doing its job.

### Frontend — the metric mostly re-finds the big components

1123 functions scored, **10 with CRAP ≥ 30**:

| CRAP | comp | cov | function |
|-----:|-----:|----:|----------|
| 161.3 | 43 | 60% | `ReceiptReviewBody.tsx` `ReceiptReviewBody` |
| 132.0 | 11 | 0% | `ListScreen.tsx:926` `handleOpenLogPrice` |
| 82.8 | 35 | 66% | `ListScreen.tsx` `ListScreen` |
| 63.2 | 48 | 81% | `TripCard.tsx` `TripCard` |
| 60.7 | 8 | 6% | `ListScreen.tsx:969` `handleDeletePrice` |
| 42.0 | 6 | 0% | `lib/api.ts` `getPurchases` |
| 39.3 | 39 | 94% | `SettingsSheet.tsx` `SettingsSheet` |
| 33.0 | 33 | 98% | `ItemList.tsx` `ItemList` |
| 31.9 | 25 | 78% | `CloseTripSheet.tsx` `CloseTripSheet` |
| 30.0 | 5 | 0% | `ListScreen.tsx:940` `handleSavePrice` |

Reading it honestly:

- **Real gaps:** the price-logging handlers inside `ListScreen`
  (`handleOpenLogPrice`, `handleSavePrice`, price delete) run zero times
  under vitest. That flow's unit coverage is genuinely missing.
- **Component-shaped noise:** for a React function component, ESLint
  counts every branch in the JSX and every inline handler toward one
  complexity number, so big components (`ReceiptReviewBody`, `TripCard`,
  `SettingsSheet`, `ItemList`) dominate the table even at 90%+ coverage.
  CRAP was designed for Java methods; it maps awkwardly onto components.
- **Blind spot:** vitest coverage is the only input. Playwright E2E runs
  the real `api.ts` and component flows against fixtures but contributes
  nothing to `coverage-final.json` — which is exactly why `getPurchases`
  shows 0%: unit tests mock the whole api module, and its only real
  executions happen in E2E. Frontend scores therefore *overstate* risk
  for anything E2E exercises.

## Caveats on the numbers

- The backend line-range coverage attribution counts nested `def`s and
  multi-line expressions inside the parent's range — fine at spike
  precision, not exact.
- v8-provider function entries name arrow functions `(anonymous_N)`;
  locating them needs the line number.
- The ESLint↔istanbul line join is heuristic (exact decl line, else
  nearest in span). Error observed: 6/1129 unmatched.

## Integration options

1. **`just crap` recipe** (small). Commit the glue script under
   `scripts/`, add `pytest-cov` + `radon` to the backend dev group, add
   `'json'` to the vitest coverage reporters. ESLint needs no config
   change (`--rule` flag). Runs both suites (~40 s each). Advisory,
   local, zero CI risk.
2. **CI advisory job** (medium). Same, wired like Playwright: its own
   job gated by the changed-areas classifier, *not* in `CI gate`'s
   `needs`. Re-runs both suites with coverage on every PR. Per the CI
   rules: gate with `if:`, never `paths:`; classifier stays fail-open.
3. **No integration.** Re-run the spike commands by hand when an audit
   feels due.

## Recommendation

**Don't wire anything yet.** The audit itself was the value, and it
yielded two actionable items and one insight:

- File a ticket: test `invite_share_page` (only real backend gap).
- File a ticket: unit-test the `ListScreen` price-logging handlers.
- Insight: backend CRAP is clean enough that a recurring check would
  mostly be silence; frontend CRAP is noisy for component-level scores
  and blind to E2E coverage, so a threshold gate would nag about the
  wrong things.

If a recurring check is wanted later, option 1 (`just crap`) is the
right size — and the actionable slice to read is **comp ≥ 8 with
cov < 80%**, not the raw CRAP ≥ 30 list, which the component noise
dominates. Revisit after the redesign settles, when component
boundaries stop moving.
