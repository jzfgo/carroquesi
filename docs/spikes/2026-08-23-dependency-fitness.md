# Spike: dependency fitness functions (import-linter + dependency-cruiser)

**Date:** 2026-08-23
**Verdict:** worth adopting, and — unlike [CRAP scoring](2026-08-23-crap-scoring.md) and [mutation testing](2026-08-23-mutation-testing.md) — cheap enough to run on every lint: both tools finish in seconds, need no test suite, and give a binary answer (contracts kept or broken). The backend passes its layer contract today with zero violations; the frontend has two findings, both small.

Third and last spike of the test-quality saga. The three answer different questions:

| Spike | Question | Nature |
| --- | --- | --- |
| CRAP | Where is complex code nobody executes? | Diagnostic |
| Mutation | Where is executed code no assertion pins? | Diagnostic |
| Dependency fitness | Is the module graph still shaped the way we decided? | **Preventive** |

The graph is clean today, so this one finds almost nothing — that is the point. A fitness function is worth least the day you add it and most the day a refactor quietly points an import the wrong way.

## What a dependency fitness function is

An executable assertion about the shape of the codebase: "services never import routers", "`lib/` never imports UI". The rules already exist in this repo as prose (AGENTS.md conventions, ADRs, `tsconfig.worker.json`'s include list); the tools turn the prose into a failing exit code.

- **import-linter 2.13** (Python, static analysis via grimp): contracts declared in an INI/TOML file — `layers`, `independence`, `forbidden`.
- **dependency-cruiser 17.4.3** (TS/JS): forbidden-rules over the resolved import graph, TypeScript-aware (`import type` edges are tagged `type-only`).

## Method

Run 2026-08-23 against develop at `9ea160e`. Throwaway configs, reproduced verbatim below; nothing is wired into the repo yet.

### Backend

```ini
[importlinter]
root_package = app

[importlinter:contract:layers]
name = Layered architecture
type = layers
layers =
    app.main
    app.routers
    app.dependencies
    app.services
    app.schemas
    app.db
    app.core

[importlinter:contract:routers-independent]
name = Routers do not import each other
type = independence
modules =
    app.routers.admin
    ; ... one line per module in app/routers (17 today)
```

Run: `cd backend && uv run --with import-linter lint-imports --config <file>`. No project changes needed — grimp analyses statically, so the app's dependencies don't have to be importable.

The layer order was read off the actual graph first (grep of `from app.` imports, aggregated by package): every edge already points downward through `main → routers → dependencies → services → schemas → db → core`, nothing imports `main`, and no router imports another. The contract codifies the status quo, it doesn't impose a new design.

### Frontend

```js
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    { name: 'lib-is-leaf',
      comment: 'lib/ must stay UI-free',
      severity: 'error',
      from: { path: '^src/lib' },
      to: { path: '^src/(components|hooks|pages|contexts)' } },
    { name: 'sw-worker-safe',
      comment: 'sw.ts may only import worker-safe internal modules',
      severity: 'error',
      from: { path: '^src/sw\\.ts$' },
      to: { path: '^src/', pathNot: '^src/lib/pushCopy\\.ts$',
            dependencyTypesNot: ['type-only'] } },
    { name: 'generated-schema-via-types',
      severity: 'error',
      from: { pathNot: '^src/types\\.ts$' },
      to: { path: '^src/apiSchema\\.generated\\.ts$' } },
    { name: 'pdfjs-via-accessor',
      severity: 'error',
      from: { pathNot: '^src/lib/pdfjs\\.ts$' },
      to: { path: 'node_modules/pdfjs-dist' } },
    { name: 'firebase-via-lib',
      severity: 'error',
      from: { pathNot: '^src/lib/(firebase|push|receiptAi)\\.ts$' },
      to: { path: 'node_modules/(firebase|@firebase)' } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '\\.test\\.(ts|tsx)$|vitest\\.setup\\.ts$' },
  },
}
```

Run: `cd frontend && depcruise src --config <file> -T err-long`. Tests are excluded — the rules govern production code; a test may import whatever it tests.

## Findings

### Backend — 59 files, 128 internal dependencies, both contracts KEPT

Nothing to fix. The layering that AGENTS.md describes in prose is already true in the graph, including the two spots most likely to rot: no `services → routers` edge and no cross-router import. Adopting the contract is free.

### Frontend — 174 modules, 455 dependencies, 4 rules kept, 2 findings

Kept without violations: `lib-is-leaf` (all ~50 `lib/` modules stay UI-free), `generated-schema-via-types`, `pdfjs-via-accessor`, and `sw-worker-safe` (the service worker's only internal import really is `lib/pushCopy.ts` — the rule is a graph-level twin of `tsconfig.worker.json`'s include list, and would catch a new import *before* the worker typecheck does).

Two findings:

1. **One circular dependency, type-only.** `ReceiptLineResolveBody.tsx → ReceiptScanSheet.tsx → ReceiptLineResolveBody.tsx`, closed by `import type { ItemRef }`. Erased at compile time, so harmless at runtime — but it is the only cycle in 455 edges, and it makes the sheet and its sub-view mutually unmovable. Fix: move `ItemRef` into `lib/receiptReview.ts`, where the other receipt-review types already live. Then `no-circular` holds strictly and stays that way.
2. **`contexts/AuthContext.tsx` imports `firebase/auth` directly** (value imports: `onAuthStateChanged`, `signInWithPopup`, …). This does *not* break the house rule — the rule is that firebase **clients** are constructed lazily via `lib/firebase.ts` accessors, and AuthContext does use `getFirebaseAuth()`; importing SDK functions at module scope is fine. The rule-as-written above was stricter than the doctrine. The honest codified form is an allowlist: firebase imports confined to `lib/firebase.ts`, `lib/push.ts`, `lib/receiptAi.ts`, `contexts/AuthContext.tsx` — so a *new* file pulling the SDK in gets flagged and reviewed instead of slipping in.

### What the tools cannot check

The firebase finding shows the limit: the real invariant is "no client construction at module scope", which is about *when code runs*, not *what imports what*. A dependency rule can only approximate it with an allowlist. Same for `environment.ts` ("no direct `import.meta.env`") — that is a lint rule, not a graph rule. Fitness functions guard the graph; ESLint and review guard behaviour.

## Gotchas

- **dependency-cruiser fails silently to zero without TypeScript resolvable.** Run via bare `npx` (isolated install), it cannot `require('typescript')`, parses no `.ts` files, and reports "✔ no dependency violations found (0 modules cruised)" with exit 0. A green run must be checked for a sane module count — the same "empty green" failure mode the CI classifier fails open against. Installing it as a devDependency next to the project's own `typescript` removes the trap.
- **The service-worker rule must scope to internal imports.** A naive "sw.ts imports only pushCopy" also forbids workbox, which is worker-safe by design. Constrain the `to` side to `^src/`.
- **Type-only cycles are still cycles to dependency-cruiser.** They can be exempted with `dependencyTypesNot: ['type-only']` on the cycle rule, but with exactly one in the codebase, fixing it is cheaper than carving the exemption.
- **import-linter needs nothing installed.** grimp is static; `uv run --with import-linter` against the existing venv just works, contracts run in ~1 s.

## Cost

Seconds per run for both tools, no test suite, no build. Contrast with the other two spikes: CRAP needs a full coverage run, mutation needs ~10 minutes of suite re-runs. This is the only one of the three whose cost profile fits inside `lint`.

## Integration options

1. **Wire into lint (recommended).** Backend: add `import-linter` as a dev dependency, contracts in `pyproject.toml` (`[tool.importlinter]`), run from the existing backend lint recipe. Frontend: add `dependency-cruiser` as a devDependency, config as `.dependency-cruiser.cjs`, run inside `pnpm lint`. Both ride the existing CI jobs — no new job, no classifier change, no `paths:` (per the CI rules in AGENTS.md).
2. **Periodic audit only, like CRAP/mutation.** Rejected: the value of a fitness function is catching the erosion in the PR that introduces it, and the cost that justifies the audit-only cadence for the other two tools isn't there.
3. **Do nothing.** Rejected: the prose rules these contracts encode have already needed re-stating in AGENTS.md more than once; an exit code is cheaper than re-explaining.

Adoption order if option 1 is taken: fix the `ItemRef` cycle first, settle the firebase allowlist, then land tools + configs + green contracts in one PR. The contracts should stay a codification of decisions already made — a new rule is an architecture decision and deserves its ADR or AGENTS.md line first, not the other way round.
