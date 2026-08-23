# Spike: suppression ratchet (type-coverage + grep)

**Date:** 2026-08-23
**Verdict:** there is almost nothing to ratchet — the classic suppressions are already pinned at zero and *enforced*. Frontend: `as any` 0, `@ts-ignore` 0, `@ts-expect-error` 0, all guarded by typescript-eslint's `no-explicit-any` and `ban-ts-comment`, so a counter would double-encode a rule ESLint already gates. Backend: `# type: ignore` 0 in `app/` — but only because no type checker runs; a ratchet without pressure measures nothing. The one gate with real content is **type-coverage**: the frontend is 99.89% any-free, and the residue has a single dominant root cause (`import.meta.env` is untyped) worth fixing once and then pinning with `--at-least`.

Fifth memo of the test-quality saga ([CRAP](2026-08-23-crap-scoring.md), [mutation](2026-08-23-mutation-testing.md), [dependency fitness](2026-08-23-dependency-fitness.md), [dead code](2026-08-23-dead-code-duplication.md)). The question: **how much type-checking have we opted out of, and can we stop the number growing?** A ratchet records today's count as a ceiling and fails CI on regression — but it only earns its keep when the count is non-zero and not already gated.

## Method

Run 2026-08-23 against develop at `29a4065` (code identical to `9ea160e`; the delta is docs-only).

- **Grep** for the written escape hatches: `as any`, `@ts-ignore`, `@ts-expect-error`, `as unknown as`, `eslint-disable` (frontend `src/` + `tests/`); `# type: ignore`, `# noqa` (backend `app/`, `tests/`, `alembic/`, `scripts/`).
- **type-coverage 2.29** for the *propagated* any count: `type-coverage -p tsconfig.app.json`, plus `--strict` and a production-only pass with `--ignore-files 'src/**/*.test.*'`. Grep counts what someone wrote; type-coverage counts what the compiler actually lost — a codebase can be grep-clean and still leak `any` (this one: zero `as any`, 52 any-typed identifiers).

## Findings

### Frontend — suppressions are at zero and fenced

| Escape hatch | src | tests | Guarded by |
| --- | --- | --- | --- |
| `as any` | 0 | 0 | `no-explicit-any` (tseslint recommended) |
| `@ts-ignore` | 0 | 0 | `ban-ts-comment` |
| `@ts-expect-error` | 0 | 0 | `ban-ts-comment` (would allow with description) |
| `as unknown as` | 2 | 9 | nothing — the one open hatch |
| `eslint-disable` | 15 total | | every one names its rule |

The 15 `eslint-disable` are dominated by `react-hooks/set-state-in-effect` (11), with the rest 3 × `react-refresh/only-export-components` and 1 × `react-hooks/exhaustive-deps`; there is no blanket `eslint-disable` without a rule name anywhere. This is already ratchet-shaped discipline, enforced at the PR, not counted after the fact.

### Frontend — type-coverage: 99.89%, one root cause

- **Default:** 49,442 / 49,494 identifiers typed — **52 anys (99.89%)**.
- **Production only** (tests excluded): 22,294 / 22,331 — **37 anys (99.83%)**. `tsconfig.app.json` compiles the colocated `*.test.ts`, so the headline number includes tests.
- **`--strict`** (assertions and partial anys count too): 99.36%.

Where the 52 live: `lib/environment.ts` (16), `lib/parseInput.ts` (7), `lib/api.ts` (5), then a long tail. The detail output shows the concentration is really one leak: **`import.meta.env` is `Record<string, any>`** under vite/client's default types, so every `VITE_*` read in `environment.ts` is an any, and `BACKEND_URL` re-exports it into `api.ts` (all 5 hits). Because env access is already centralized in `environment.ts` (house rule), declaring an `ImportMetaEnv` interface in `vite-env.d.ts` — a dozen lines — types the whole family at the source and roughly halves the count. `parseInput.ts`'s 7 are destructured regex named groups; typing the destructure clears them.

### Backend — zero suppressions, zero pressure

- `# type: ignore` in `app/`: **0**. In `tests/`: 2, both deliberate `None`-injections annotated `[arg-type]`.
- `# noqa`: 2, both `F401` import-for-side-effect (model registration), each with the reason on the line.

But no mypy/pyright is configured, so the zero is trivial: nothing forces a suppression when nothing checks. The counts only become ratchetable the day a checker lands — that adoption is its own decision (the CI section of AGENTS.md already anticipates "adding mypy" as the canonical job-rename example), and *its* rollout is where a ratchet would genuinely help: run the checker, suppress the existing debt with coded `# type: ignore[...]`, ratchet the suppression count down. Recording that pattern here so the future mypy spike doesn't reinvent it.

## Gotchas

- **type-coverage via bare `npx` crashes** (`TypeError: Cannot read properties of undefined (reading 'Unknown')` in `checker.js`) — it cannot resolve its peer `typescript` from an isolated install. Same family as the dependency-cruiser silent-zero and the knip noise ([dead code](2026-08-23-dead-code-duplication.md)); this one at least fails loudly. Install it next to the project's own `typescript`.
- **Don't mix modes when pinning.** `--strict` also counts type assertions (the `as unknown as` casts surface there), so a threshold chosen from the default run will fail a `--strict` run by construction. Pick one mode and stay in it.
- **The grep and the tool answer different questions.** Grep = hatches someone wrote (reviewable intent); type-coverage = anys the compiler holds (propagation). Both zeros must hold independently.

## Cost

Seconds. Grep is free; type-coverage runs in about the time of a typecheck. Fits inside `lint` like the fitness contracts and knip.

## Integration options

1. **Fix the root cause, then pin (recommended).** One PR: declare `ImportMetaEnv` in `vite-env.d.ts`, type the `parseInput` regex groups, then add `type-coverage` as a devDependency with `"typeCoverage": { "atLeast": <measured> }` in `package.json` and a `type-coverage` step inside `pnpm lint`. Raise `atLeast` opportunistically (`--update`) — a ratchet that only tightens. Modest value (ESLint already fences the written hatches; this catches *propagated* any from deps and generated code, which ESLint cannot see) but the cost is near zero.
2. **Backend: nothing now.** A suppression ratchet without a type checker is a gauge on an empty pipe. Revisit inside the mypy/pyright adoption, using the suppress-then-ratchet rollout above.
3. **No counters for `as unknown as` / `eslint-disable`.** Eleven of the fifteen disables are one React rule with the rule named in place — a numeric ceiling would just re-encode what the lint config and review already govern (DRY is about rules, not lines).
