# Playwright e2e + Visual Regression Rollout — Design Spec

**Date:** 2026-07-14
**Status:** Approved

---

## Overview

PRs #92/#93 set up Playwright infrastructure: `frontend/playwright.config.ts` runs 5 browser/device projects (Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari), `frontend/tests/fixtures.ts` mocks the entire backend via `page.route`, and `.github/workflows/playwright.yml` runs the suite as a required check on every PR to main. Only 3 smoke tests exist (`frontend/tests/smoke.spec.ts`: dashboard loads, list shows items, add item), and no visual regression tooling exists yet.

This spec covers the full rollout: broader functional flow coverage plus net-new visual regression, both treated as one combined effort.

The mocked-backend approach means these are frontend contract tests (UI behavior given known API responses), not frontend+backend integration tests — that's an intentional, pre-existing trade-off this rollout keeps rather than revisits.

---

## Scope

### Functional flow coverage (priority order)

1. **Purchase lifecycle** — mark item purchased, `LogPurchaseSheet` price/store entry, same-day price-deletion guard (422 on prior-day deletion attempts, per both frontend and `DELETE /lists/{id}/items/{item_id}/prices`), purchased-item read-only UI (rename/qty/brand/store edits disabled)
2. **Receipt scanning** — the 4-step flow (client parse → backend fuzzy match → `ReceiptScanSheet` review → apply prices), with the Gemini call mocked at the network boundary rather than hitting the real API

Barcode scanning, smart-input sigils, and list/member management are out of scope for this rollout — can be added as follow-up flow specs using the same pattern established here.

### Gemini mocking

`receiptAi.ts` calls the Firebase AI SDK directly from the browser. Tests intercept that network call and return a fixed parsed-receipt payload, rather than calling real Gemini. This keeps tests fast and deterministic and covers where bugs actually concentrate — backend fuzzy-matching, the review UI, and price application — without fighting LLM output non-determinism or burning API quota. The AI parsing step itself is not exercised end-to-end by these tests.

### Visual regression

- Tooling: Playwright's built-in `toHaveScreenshot()`. No third-party service (Percy/Chromatic) — avoids adding a paid SaaS dependency and external account for a solo-maintained project.
- Projects: `chromium` and `Mobile Chrome` only. Screenshots on all 5 projects would 5x the baseline count and cross-engine font/anti-aliasing differences produce false-positive diffs; Firefox/WebKit/Mobile Safari keep full functional coverage but own no visual baselines.
- Snapshot granularity: full-page, per key screen, in both light and dark mode. No component-level/Storybook-style isolation — full-page matches how visual bugs have actually surfaced in this codebase (e.g. #99, the dark-mode barcode scanner overlay), and building an isolated rendering harness isn't justified yet.
- Dark mode: `ThemeManager.tsx` toggles a `theme-dark` body class purely off `prefers-color-scheme` (no manual switcher exists — it was removed). Tests drive this via `page.emulateMedia({ colorScheme: 'dark' | 'light' })`.

---

## Architecture

### Test file organization

Visual assertions are embedded as additional `expect()` calls inside the same flow spec files that already cover functional behavior — not separate `visual.spec.ts` files. A small helper wraps `toHaveScreenshot` and no-ops on projects other than `chromium`/`Mobile Chrome`:

```ts
// tests/fixtures.ts (extended)
export async function expectScreenshot(page: Page, name: string) {
  const projectName = test.info().project.name
  if (projectName !== 'chromium' && projectName !== 'Mobile Chrome') return
  await expect(page).toHaveScreenshot(name)
}
```

This was chosen over dedicated visual spec files because the suite is small and solo-maintained — the coordination benefit of a separate visual suite doesn't outweigh the drift risk of duplicating page-setup/navigation logic between functional and visual specs. One file per flow stays the single source of truth, matching how `smoke.spec.ts` is already structured.

New/extended files:
- `frontend/tests/purchase-lifecycle.spec.ts` — new
- `frontend/tests/receipt-scanning.spec.ts` — new
- `frontend/tests/smoke.spec.ts` — retrofit with visual assertions (first target, since it's already stable)
- `frontend/tests/fixtures.ts` — extended with `expectScreenshot` helper, plus new mocked endpoints (price PATCH/DELETE, `/receipts/scan`) following the existing pattern (add a branch to `installApiMocks`; unmocked routes already `console.warn` and 404 loudly)

### Baseline storage & updates

- Baseline PNGs committed to `frontend/tests/*-snapshots/` (Playwright's default location alongside each spec)
- Regeneration: `pnpm exec playwright test --update-snapshots`, run locally on the same OS/Docker image Playwright's CI step targets, to avoid font-rendering false positives between a dev machine and CI. Documented as a short README note in `frontend/tests/`.
- Baseline updates happen in the same PR as the intentional UI change that caused them — never a follow-up commit. A failing visual check on an unrelated PR is treated as a real signal.

### CI integration

- No new workflow file. Visual assertions run inside the existing `.github/workflows/playwright.yml` job, across the same 5 projects as today (screenshots just no-op on 3 of them).
- Blocking: a visual diff fails the PR check exactly like a functional assertion failure — same required-check semantics as today.
- Failure review: the existing `playwright-report/` artifact upload is sufficient. Playwright's HTML report renders expected/actual/diff images side-by-side; no separate dashboard is introduced.

---

## Rollout Sequencing

Three independently-mergeable PRs, in order:

1. **Visual regression infra** — `expectScreenshot` helper, dark-mode emulation, baseline snapshots for the 3 existing smoke tests, README note on regenerating baselines. Proves the mechanism before adding flow breadth.
2. **Purchase lifecycle e2e** — functional + visual assertions, extends `fixtures.ts` mocks for price endpoints.
3. **Receipt scanning e2e** — functional + visual assertions, adds Gemini-call interception, extends `fixtures.ts` mocks for `/receipts/scan`.

Each PR follows the repo's existing squash-merge workflow and must pass `just ci` plus the Playwright CI job before merge.

---

## Maintenance

- No dashboard/approval workflow needed at solo-maintainer scale. Review surface is the git diff of the PNG plus the HTML report.
- Follow-up flows (barcode scanning, smart-input sigils, list/member management) can reuse this same pattern (spec file with embedded `expectScreenshot` calls, mocks added to `fixtures.ts`) without further design work.

---

## Out of Scope

- Real-backend (non-mocked) integration testing — deferred; current mocked-contract-test approach is retained
- Barcode scanning and smart-input sigil e2e coverage — follow-up, not this rollout
- List/member management e2e coverage — follow-up, not this rollout
- Third-party visual regression service (Percy/Chromatic) — revisit only if solo-maintainer scale changes (e.g. team grows)
- Exercising the real Gemini API end-to-end — network boundary mock is sufficient for this rollout's goals
