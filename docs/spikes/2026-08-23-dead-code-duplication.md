# Spike: dead code and duplication (vulture + knip + jscpd)

**Date:** 2026-08-23
**Verdict:** split by tool. **knip: adopt into lint** — with ten lines of config its output is 100% signal today (1 unused devDependency, 3 dead exports, 15 needlessly-exported types) and it exits non-zero on findings, so it gates like a linter. **jscpd: audit only** — total duplication is 3.89%, but tests carry almost all of it; production code sits at 0.95%, and the house DRY doctrine deliberately tolerates duplicated *code*, so a numeric CI gate would fight the doctrine. **vulture: skip** — 106 findings on this codebase, 0 real dead code; FastAPI decorators, Pydantic fields, and SQLModel columns invert the signal-to-noise, and even its 100%-confidence tier is all false positives here.

Fourth memo of the test-quality saga ([CRAP](2026-08-23-crap-scoring.md), [mutation](2026-08-23-mutation-testing.md), [dependency fitness](2026-08-23-dependency-fitness.md)). The question this one answers: **what code is no longer earning its place?** Like dependency fitness it runs in seconds with no test suite, so the adoptable part fits inside `lint`.

## Method

Run 2026-08-23 against develop at `9ea160e`. Throwaway configs, reproduced verbatim below; nothing is wired into the repo yet.

- **vulture 2.x** (Python, static): `cd backend && uv run --with vulture vulture app` — nothing to install, like import-linter.
- **knip 5** (TS): `cd frontend && npx --yes knip@5 --no-progress`, with the project's own `node_modules` installed (knip resolves the vite/vitest/playwright plugins and `tsconfig` from the project).
- **jscpd 4** (token-based clone detection, language-agnostic): `npx --yes jscpd@4 --min-tokens 50 backend/app frontend/src` from the repo root.

## Findings

### vulture — 106 findings at default confidence, ~0 real

Breakdown: 63 in `app/routers`, 30 in `app/schemas`, 8 in `app/db`, 3 in `app/services`. Every category dissolves on inspection:

- **Route handlers** are "unused" because only decorators reference them. `--ignore-decorators` helps but the glob must cover every router variable name — `@router.*` misses `@users_router.get`; the honest pattern is `@*router.*` plus `@app.*`.
- **The 3 service functions** (`backfill_all_defaults`, `merge_receipt_name_mapping_keys`, `backfill_list_stores`) are called from Alembic migrations. Scanning `app alembic` together removes them — a scan rooted at `app` alone cannot see a caller that lives next door.
- **Schema fields and SQLModel columns** are written by constructors and read by serializers or SQL, never by name in Python. `parsed_lines`, `granted_by`, `scanned_by` and friends are audit surface, not dead weight.
- **Even the 100%-confidence tier (6 findings) is all false positives**: five `cls` parameters inside `@field_validator` validators that *do* carry `@classmethod` (vulture mis-reads the stacked decorators), and one FastAPI dependency-injection argument (`current_admin`) whose whole job is its side effect.

Making vulture CI-clean would mean a whitelist roughly the size of its real yield forever after — and its real yield today is zero. Not worth it on a FastAPI + Pydantic + SQLModel codebase; review and the coverage-based spikes cover the backend better.

### knip — noisy bare, 100% signal with ten lines of config

Bare, knip reports `src/sw.ts` and the two `pwa-assets` configs as unused files, the four `workbox-*` packages and five `@fontsource/*` packages as unused dependencies. All one cascade: knip's vite plugin does not know `injectManifest` makes `sw.ts` an entry point (so everything only it imports looks dead), and knip does not follow CSS `@import` (where the fonts are loaded). The config that fixes it:

```json
{
  "entry": ["src/sw.ts", "pwa-assets.config.ts", "pwa-assets.maskable.config.ts"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignoreBinaries": ["diff"],
  "ignoreDependencies": ["@fontsource/.+"],
  "ignore": ["src/apiSchema.generated.ts"]
}
```

(`diff` is the system binary the `openapi:check` script pipes through; the generated schema keeps its unused `paths`/`operations` exports by design.)

With that config, everything left is real:

- **1 unused devDependency:** `@axe-core/playwright` — nothing imports it. Either the a11y test it was installed for gets written, or it goes.
- **3 dead exports:** `IS_PROD` (`lib/environment.ts`), `purchasedDateLabel` (`lib/itemCost.ts` — its only remaining reference is a comment), `recordAmountLabel` (`lib/priceChart.tsx`).
- **15 unused exported types** — mostly types used inside their own module but exported anyway (`UseStack`, `PriceStats`, `SubtitleSource`, …) plus three hand-written aliases in `types.ts` nothing imports (`UserMe`, `PriceType`, `PurchaseNewItem`). Fix is unexport or delete, a mechanical sweep.
- Two unnecessary Playwright fixture exports (`SEED_RECEIPT_SCANS`, `installApiMocks`) — both used inside `fixtures.ts` itself, so the fix is to unexport, not delete.

knip has no threshold knob and needs none: fix the findings once, commit the config, and it gates like the dependency contracts — binary, kept or broken.

### jscpd — 3.89% duplicated lines, and the split matters more than the number

105 exact clones, 1937 duplicated lines across `backend/app` + `frontend/src` at `--min-tokens 50`. Where they live:

- **Python: 2 clones, 16 lines (0.29%).** The backend is effectively clone-free; both hits are deliberate structural rhyme (`require_*` dependencies, router preambles).
- **Frontend tests carry the bulk.** Every top pair is a `*.test.tsx` file — sheet test suites repeating the same mount/dismiss choreography (`ListMembersSheet` ↔ `Sheet` share a 241-line block). Excluding `*.test.*` drops the total to **22 clones, 310 lines, 0.95%**.
- **Production findings worth a look:** `CloseTripSheet` ↔ `SaveTicketSheet` share 77 lines (the two trip-closing sheets grew in parallel), `SignInScreen` ↔ `WaitlistScreen` 28, and ~157 lines of CSS clones (mostly theme blocks, where repetition is the format).
- 79 of the 105 clones are same-file — repeated blocks inside one test suite, the cheapest kind to leave alone.

The house doctrine (AGENTS.md: "DRY is about rules, not lines") tolerates exactly the duplication jscpd counts. The test-suite clones are arguably *good* — flat, readable arrange-act-assert — and the third-occurrence rule already governs when to abstract. So the honest use of jscpd here is a periodic look at the production-only number, not a gate. If a gate is ever wanted, `jscpd --threshold 2` over production paths passes today with headroom; a threshold over tests would only invite clever test abstraction.

## Gotchas

- **jscpd's per-format percentages are unusable.** Its detector classifies some `.tsx` blocks as "javascript" (11.95%!) and others as "tsx" — the same files appear under both. Only the total, and your own file-level aggregation of the JSON report, mean anything.
- **knip bare is the same trap as dependency-cruiser via npx** ([dependency fitness](2026-08-23-dependency-fitness.md)): plausible output that is wrong for structural reasons — here inverted, loud-wrong instead of silently-green. Triage before trusting either direction.
- **vulture's confidence score does not mean what it suggests.** 100% confidence marks *certainly-unreferenced within the scanned tree*, not *certainly dead* — an alembic caller outside the tree, a decorator, or a serializer all sit invisible at any confidence.

## Cost

Seconds per tool. vulture needs nothing installed (`uv run --with`); knip needs the project's `node_modules`; jscpd is standalone. Like the fitness contracts — and unlike CRAP and mutation — the adoptable part fits inside `lint`.

## Integration options

1. **knip into `pnpm lint` (recommended).** Add `knip` as a devDependency, commit the config above as `frontend/knip.json`, ride the existing frontend lint job — no new CI job, no `paths:`. Land it in one PR together with the cleanup that makes it green: remove or use `@axe-core/playwright`, delete the 3 dead exports (and the comment that cites `purchasedDateLabel`), unexport the 15 types, prune the 2 fixture exports.
2. **jscpd as an occasional audit.** Re-run the spike command when it feels warranted; look only at the production-only number and the top pairs. Revisit `CloseTripSheet` ↔ `SaveTicketSheet` the next time either changes — third occurrence rule, not a cleanup crusade. No CI wiring.
3. **vulture: don't adopt.** Recorded here so the next person reaches for knip on the frontend and skips the whitelist rabbit hole on the backend.
