# E2E Tests (Playwright)

Run: `just frontend test-e2e` (alias: `pnpm test:e2e`). Runs against the **preview build**, not the dev server — if you've made frontend changes, build first (`pnpm build`) or just let Playwright's `webServer` config do it for you.

## Visual regression

Key screens are also checked for pixel-level visual regressions via Playwright's `toHaveScreenshot()`, wrapped in the `expectScreenshot(page, name)` helper in `fixtures.ts`. Only the `chromium` and `Mobile Chrome` projects carry visual baselines — `expectScreenshot` no-ops on the other three (`firefox`, `webkit`, `Mobile Safari`), which still run full functional assertions.

Baseline PNGs live alongside each spec file (e.g. `smoke.spec.ts-snapshots/`) and are committed to git.

### Regenerating baselines

Baselines must be generated on the same OS Playwright's CI step runs on (Ubuntu), not natively on macOS — font rendering differs enough between platforms to produce false-positive diffs, and Playwright suffixes the generated filename by platform (`-linux.png` vs `-darwin.png`), so a macOS-generated baseline is simply never picked up by CI.

Use the official Playwright Docker image, pinned to the version in `package.json`:

```bash
cd frontend
docker run --rm -v "$(pwd):/work" -w /work \
  mcr.microsoft.com/playwright:v1.61.0-noble \
  bash -c "corepack enable && pnpm install --frozen-lockfile && pnpm exec playwright test --update-snapshots"
```

Update the image tag if `@playwright/test`'s version in `package.json` changes.

Commit the updated PNGs **in the same PR** as the UI change that caused them to change — a visual diff failing on an unrelated PR is a real regression signal, not noise to dismiss.

Review a failing visual check via the `playwright-report/` artifact CI uploads on every run — it renders expected/actual/diff images side-by-side.
