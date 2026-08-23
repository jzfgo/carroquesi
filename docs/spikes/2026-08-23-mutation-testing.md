# Spike: mutation testing for CarroQueSí

**Date:** 2026-08-23 · **Status:** done · **Verdict:** worth adopting as a periodic audit — wiring is ticketed (JAV-201), findings are ticketed (JAV-202), nothing runs in CI. See [Recommendation](#recommendation).

This memo distils a PoC run on 2026-08-22 (ephemeral branch
`poc/mutation-testing`, since deleted — commits `b5603e7` + `4979872`).
The numbers below are from that run, not re-measured; the full
reproduction recipe lives in [JAV-201](https://linear.app/jzfgo/issue/JAV-201).

## What mutation testing is

A mutation tool makes one small change to the code (a *mutant*: flip a
comparison, drop a `.trim()`, change a constant), runs the test suite,
and records whether any test fails. A failing test **kills** the mutant;
a green suite means it **survived** — the suite would not notice that
change in production. The score is the killed fraction.

Where coverage asks "did a test *run* this line?", mutation asks "would
a test *fail* if this line were wrong?". It is the natural complement to
the CRAP spike ([2026-08-23-crap-scoring.md](2026-08-23-crap-scoring.md)):
CRAP finds complex code no test executes; mutation finds executed code
no assertion actually pins down.

## Method

- **Frontend:** StrykerJS 10 with `@stryker-mutator/vitest-runner` over
  the vitest suite, mutating `src/lib/**` and `src/hooks/**` (tests and
  a few env/vendor modules excluded). `coverageAnalysis: "perTest"`.
- **Backend:** mutmut 3.7 over pytest, mutating `app/services/` and
  `app/routers/`.

Exact configs, install commands, and run flags are in JAV-201 — they
worked as written and belong with the integration work, not here.

### Gotchas that cost PoC time (summary; detail in JAV-201)

- Stryker under pnpm does not autodiscover plugins: `"plugins"` must be
  explicit or it fails with "no TestRunner plugins were loaded".
- mutmut copies `backend/` into `mutants/` and runs pytest there, so any
  test that reads files outside `backend/` via a `__file__`-relative
  path breaks. Today that is `test_store_key.py` (reads
  `storeKeyVectors.json`) and `test_e2e_contract.py` (reads the
  Playwright fixtures) — both must be `--ignore`d, and any new
  cross-tree test will break the run the same way. `alembic.ini`,
  `alembic/`, and `openapi.json` must ride along in `also_copy`.
- The `mutate` glob must exclude `*.test.ts`: mutating tests doubled the
  run in the PoC (7,168 → 3,057 mutants) and produces only noise.
- The artifact trees (`frontend/.stryker-tmp/`, `frontend/reports/`,
  `backend/mutants/`) must be git-ignored and excluded from
  eslint/ruff, or lint chokes on generated mutants.

## Findings

Run of 2026-08-22. Suites green before mutating.

| Side | Score | Mutants | Killed | Survived | No cover | Wall time |
|------|------:|--------:|-------:|---------:|---------:|----------:|
| Frontend (`lib/` + `hooks/`, 43 files) | **62.0 %** | 3,057 | 1,896 | 891 | 270 | 5 min 41 s |
| Backend (`services/` + `routers/`) | **78.7 %** | 1,492 | 1,174 | 313 | 5 | ~4 min |

### Backend — holds up well

The API tests kill 4 of every 5 mutants, and much of what survives is
deliberately best-effort code (push sending, token pruning). Half the
313 survivors concentrate in eight functions:

| Survivors | Function | Reading |
|----------:|----------|---------|
| 47 | `purchases._parse_search` | Search parser has almost no direct tests — the biggest backend gap |
| 21 | `push._send_and_prune` | Best-effort by design, but the typed-verdict pruning deserves a pinning test |
| 20 | `store_key.merge_receipt_name_mapping_keys` | Mapping-key migration, no tests of its own |
| 18 | `barcode._fetch_product` | OpenFoodFacts response parsing loosely pinned |
| 16 | `purchases._notify_safely` | try/except push wrapper — mostly expected noise |
| 15 | `receipt_matcher.match_lines` | Fuzzy thresholds and tie-breaks tolerate changes silently |
| 14 | `trips.close` | Conditional-close branches unexercised (some equivalent via the partial index) |
| 10 | `suggestions._parse_quantity_numeric` | Quantity normalisation gaps |

### Frontend — solid foundations, three weak zones

The invariants AGENTS.md leans on all score **100 %**:
`reconcileItems`, `connectivity`, `isTripOpen`, `listSubtitle`,
`priceNormalization`, `theme`, `boards`, `networkError` — with
`suggestions` at 97 % and `pushCopy` at 96 %. The weak modules:

| Score | Survivors | Module |
|------:|----------:|--------|
| 0 % | 6 + 7 | `usePageTitle.ts`, `avatarColors.ts` (trivial — candidates for exclusion, not tests) |
| 30.9 % | 282 | `priceChart.tsx` (SVG geometry — guarded by Playwright baselines, not vitest) |
| 32.4 % | 48 | `ownBrands.ts` |
| 45.3 % | 87 | `api.ts` (mostly no-cover: unit tests mock the module; only E2E runs it) |
| 55.3 % | 98 | `receiptAi.ts` — builds the Gemini prompt and validates its answer; a silent change here costs money. Also the source of the run's 7 timeouts |
| 56–59 % | 29–116 | `useStack.ts`, `receiptReview.ts`, `useSwipeToDismissRow.ts`, `useListItems.ts` (116 survivors) |

**Blind spot, same as the CRAP spike:** Stryker only runs vitest.
The 270 no-cover mutants sit in `api.ts` / `useListItems` branches that
only Playwright exercises, so the frontend score understates real
protection. Excluding no-cover mutants the composite rises to 68 %.

### Two survivors worth a test each (from JAV-202)

- `parseInput.ts` — the sigil-value `.trim()` is not pinned:
  `#"PULEVA "` would create a brand distinct from `#PULEVA`, splitting
  one product's price history in two.
- `storeKey.ts` / `store_key.py` — the whitespace-collapse mutant
  (`/\s+/g → ""`) survives in **both** implementations because the
  shared `storeKeyVectors.json` has no vector with internal multiple
  spaces. One new vector closes the hole in both languages at once.

## Cost

First full run ~10 min total on a laptop (5 min 41 s frontend + ~4 min
backend). Stryker supports `--incremental` and mutmut caches in
`mutants/`, so only the first run is expensive.

## Integration options

1. **Local recipes, no CI** (JAV-201 as written). Commit the two
   configs, the artifact-hygiene entries, and `just frontend mutation` /
   `just backend mutation`. Run weekly or pre-release, reading only
   *new survivors*, never the absolute score.
2. **CI job.** Rejected: ~10 min of extra suite time per PR for a score
   that is not actionable as a gate — an absolute threshold would nag
   about deliberate best-effort code and E2E-covered branches. If ever
   revisited, it would be advisory and classifier-gated (`if:`, never
   `paths:`), like Playwright.
3. **Nothing committed.** Rejected: the PoC already proved the tooling
   works, and without the recipes in-repo the knowledge rots in
   tickets.

## Recommendation

Adopt option 1 — it is exactly [JAV-201](https://linear.app/jzfgo/issue/JAV-201)
(install, config, hygiene, `just` recipes). Then work
[JAV-202](https://linear.app/jzfgo/issue/JAV-202): kill the priority
survivors (`_parse_search`, `receiptAi.ts`, the `storeKeyVectors.json`
vector, the `parseInput.ts` trim) and *exclude the declared noise*
(`priceChart.tsx`, `avatarColors`, `usePageTitle`, `_notify_safely`)
from the mutation scope, so the next run's score is a clean signal.

Read future runs the way this one was read: survivors per module, not
the headline percentage. The percentage mixes deliberate best-effort
code, E2E-only branches, and real gaps into one number; the survivor
list separates them.
