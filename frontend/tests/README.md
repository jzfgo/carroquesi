# E2E Tests (Playwright)

Run: `just frontend test-e2e` (alias: `pnpm test:e2e`). Runs against the **preview build**, not the dev server — if you've made frontend changes, build first (`pnpm build`) or just let Playwright's `webServer` config do it for you.

## Visual regression

Key screens are also checked for pixel-level visual regressions via Playwright's `toHaveScreenshot()`, wrapped in the `expectScreenshot(page, name)` helper in `fixtures.ts`. Only the `chromium` and `Mobile Chrome` projects carry visual baselines — `expectScreenshot` no-ops on the other three (`firefox`, `webkit`, `Mobile Safari`), which still run full functional assertions.

Baseline PNGs live alongside each spec file (e.g. `smoke.spec.ts-snapshots/`) and are committed to git.

### Tolerance

`playwright.config.ts` allows a fixed number of differing pixels per screenshot (`maxDiffPixels`), not a share of the image (`maxDiffPixelRatio`). The distinction matters more than it looks. A ratio scales with the capture, so the 1280×720 desktop shot was allowed 921 differing pixels while the 360-wide mobile shot got 263 — for the same screen. Since a small text button costs around 600 pixels, desktop could gain or lose one and still pass. `fullPage` compounded it: a taller page bought a bigger allowance for free.

A baseline that passes while depicting the wrong UI does not heal. It becomes the reference for every later run, so the missing element stays invisible and the next change near it is measured against a picture that was already wrong.

### Anything the screenshot shows must be pinned

A screenshot captures whatever was on screen, including today's date. `purchase-lifecycle.spec.ts` and `receipt-scanning.spec.ts` both pin the browser clock with `page.clock.setFixedTime` for exactly this reason: purchase dates are stamped client-side, so on a real clock every baseline would describe the day it was written and drift a little further from the truth every day after. Any new spec that screenshots a date, a relative time, or a random value needs the same treatment.

### Regenerating baselines

Baselines must be generated on the same OS Playwright's CI step runs on (Ubuntu), not natively on macOS — font rendering differs enough between platforms to produce false-positive diffs, and Playwright suffixes the generated filename by platform (`-linux.png` vs `-darwin.png`), so a macOS-generated baseline is simply never picked up by CI.

Run:

```bash
just frontend update-snapshots
```

This runs the official Playwright Docker image (version read straight from `package.json`, so it can't drift out of sync) with `frontend/` bind-mounted in, then `pnpm install`s and re-runs the suite with `--update-snapshots` inside the container. The container is pinned to `--platform linux/amd64` — CI's `ubuntu-latest` runners are amd64, and on an Apple Silicon Mac, Docker otherwise defaults to pulling the native `arm64` image, which can render fonts subtly differently and reintroduce the exact false-positive diffs this whole workflow exists to avoid.

Two things are deliberately kept **out** of the `frontend/` bind mount, each via its own named Docker volume, so the container's Linux-side `pnpm install` can never bleed onto your macOS host:

- `node_modules` → `carroquesi-playwright-node-modules`, mounted over `/work/node_modules`. Without this, the container's `pnpm install --frozen-lockfile` — running on Linux — overwrites your host `node_modules` with Linux-only native bindings (esbuild, rollup, etc.), silently breaking `pnpm dev`/`vite` on macOS until you reinstall natively.
- pnpm's content-addressable store → `carroquesi-playwright-pnpm-store`, mounted at `/pnpm-store` with `store-dir` pointed there via `pnpm --config.store-dir=/pnpm-store install` (pnpm v11 defaults the store to a project-relative `.pnpm-store/` rather than a `$HOME`-based path — the `npm_config_store_dir` env var is _not_ honored for this key, the explicit `--config.store-dir` flag is required). Without it, the container dumps a multi-hundred-MB untracked `.pnpm-store/` into the bind-mounted `frontend/` on the host.

Only source files and the generated PNGs cross the bind mount; both volumes are cached across runs, so only the first invocation pays the full `pnpm install` cost. If either ever gets into a bad state, drop it: `docker volume rm carroquesi-playwright-node-modules carroquesi-playwright-pnpm-store`.

`--update-snapshots` only rewrites a baseline whose comparison **failed**, so it cannot repair one that is passing but wrong. If you have reason to think a baseline is stale, delete it and re-run: a _missing_ snapshot is always written. Prefer that to `--update-snapshots=all`, which also rewrites every unrelated screen with whatever noise that one run happened to produce.

Commit the updated PNGs **in the same PR** as the UI change that caused them to change — a visual diff failing on an unrelated PR is a real regression signal, not noise to dismiss.

Review a failing visual check via the `playwright-report/` artifact CI uploads on every run — it renders expected/actual/diff images side-by-side.
