# E2E Tests (Playwright)

Run: `just frontend test-e2e` (alias: `pnpm test:e2e`). Runs against the **preview build**, not the dev server — if you've made frontend changes, build first (`pnpm build`) or just let Playwright's `webServer` config do it for you.

## Visual regression

Key screens are also checked for pixel-level visual regressions via Playwright's `toHaveScreenshot()`, wrapped in the `expectScreenshot(page, name)` helper in `fixtures.ts`. Only the `chromium` and `Mobile Chrome` projects carry visual baselines — `expectScreenshot` no-ops on the other three (`firefox`, `webkit`, `Mobile Safari`), which still run full functional assertions.

Baseline PNGs live alongside each spec file (e.g. `smoke.spec.ts-snapshots/`) and are committed to git.

### Tolerance

`playwright.config.ts` allows a fixed number of differing pixels per screenshot (`maxDiffPixels`), not a share of the image (`maxDiffPixelRatio`). The distinction matters more than it looks. A ratio scales with the capture, so the 1280×720 desktop shot was allowed 921 differing pixels while the 360-wide mobile shot got 263 — for the same screen. Since a small text button costs around 600 pixels, desktop could gain or lose one and still pass. `fullPage` is a second reason to keep the budget absolute, though it has not bitten yet: every capture today is exactly viewport-sized, but the first screen that grows past its viewport would buy itself a bigger allowance under a ratio, for page height alone.

The number is 250, and it is known to be enough rather than known to be tight. CI passes every screen on a runner that installs its own fonts, while the baselines come out of a container, so the gap between those two machines is at most 250 — a run that passes cannot say how much less than that it really is. What bounds the number from above is the signal it has to preserve, and that button is the only part of it anyone has measured. Smaller changes exist — a shifted padding, a swapped icon — so treat 250 as a number to lower, never to raise.

A baseline that passes while depicting the wrong UI does not heal. It becomes the reference for every later run, so the missing element stays invisible and the next change near it is measured against a picture that was already wrong.

### Anything the screenshot shows must be pinned

A screenshot captures whatever was on screen, including today's date. `purchase-lifecycle.spec.ts` and `receipt-scanning.spec.ts` both pin the browser clock with `page.clock.setFixedTime` for exactly this reason: purchase dates are stamped client-side, so on a real clock every baseline would describe the day it was written and drift a little further from the truth every day after. Any new spec that screenshots a date, a relative time, or a random value needs the same treatment.

One thing to know before you pin a spec that also adds items: `useListItems` builds the optimistic temporary id from the clock, so under a frozen one two adds in the same test produce the same id. No spec hits this today — the one that adds items is not pinned — but the combination is easy to reach from here.

### Regenerating baselines

Baselines must be generated in the container, never on your own machine. Every committed PNG came out of that one image, so it is the only machine whose output the rest of them still agree with. That holds whatever you run, Ubuntu included — the image carries a fixed set of font packages, which is not the set a desktop install of the same distribution ends up with.

On macOS the mistake announces itself: Playwright suffixes the filename by platform, so a `-darwin.png` is simply never picked up by CI. On Linux nothing announces it. The host writes the same `-linux.png` CI expects, so a natively generated baseline is picked up and quietly disagrees. Measured once, on an Arch-based host against the Ubuntu-based container: the `chromium` screens landed within 68 pixels of the container's, while the `Mobile Chrome` ones were out by up to 1046. 68 would pass the gate. That is the silent-wrong-baseline failure this page is otherwise about, arriving by a second route.

Run:

```bash
just frontend update-snapshots
```

This runs the official Playwright Docker image (version read straight from `package.json`, so it can't drift out of sync) with `frontend/` bind-mounted in, then `pnpm install`s and re-runs the suite with `--update-snapshots` inside the container. The container is pinned to `--platform linux/amd64` — CI's `ubuntu-latest` runners are amd64, and on any arm64 host the runtime otherwise defaults to pulling the native `arm64` image, which can render fonts subtly differently and reintroduce the exact false-positive diffs this whole workflow exists to avoid. An Apple Silicon Mac is the common case, not the only one.

Rootless podman works too, via the `docker` shim in `podman-docker`. The recipe ends by giving the generated files back to whoever owns the checkout, and asks the mounted directory who that is rather than passing an id in from outside. The runtimes disagree on the answer: a rootless one maps container root to your account, so a chown to `$(id -u)` lands on an id far above it that resolves to nobody on the host. Reading the owner off the mount is right for both, without testing which is in use. One thing not exercised here: on a host with SELinux enforcing, the container may be denied the mount until it is relabelled, which is `-v "$(pwd):/work:z"` on the mount itself rather than anything you can add afterwards. Know what you are agreeing to before reaching for it — `:z` writes a shared label onto the checkout on your host, not just inside the container.

Two things are deliberately kept **out** of the `frontend/` bind mount, each via its own named volume, so the container's `pnpm install` can never bleed onto your host:

- `node_modules` → `carroquesi-playwright-node-modules`, mounted over `/work/node_modules`. Without this, the container's `pnpm install --frozen-lockfile` overwrites your host `node_modules` with linux-amd64 native bindings (esbuild, rollup, etc.), silently breaking `pnpm dev`/`vite` until you reinstall natively. This is not only a macOS problem — the run is pinned to `--platform linux/amd64`, so an arm64 Linux host gets the wrong bindings for the same reason.
- pnpm's content-addressable store → `carroquesi-playwright-pnpm-store`, mounted at `/pnpm-store` with `store-dir` pointed there via `pnpm --config.store-dir=/pnpm-store install` (pnpm v11 defaults the store to a project-relative `.pnpm-store/` rather than a `$HOME`-based path — the `npm_config_store_dir` env var is _not_ honored for this key, the explicit `--config.store-dir` flag is required). Without it, the container dumps a multi-hundred-MB untracked `.pnpm-store/` into the bind-mounted `frontend/` on the host.

Only source files and the generated PNGs cross the bind mount; both volumes are cached across runs, so only the first invocation pays the full `pnpm install` cost. If either ever gets into a bad state, drop it: `docker volume rm carroquesi-playwright-node-modules carroquesi-playwright-pnpm-store`.

`--update-snapshots` only rewrites a baseline whose comparison **failed**, so it cannot repair one that is passing but wrong. If you have reason to think a baseline is stale, delete it and re-run: a _missing_ snapshot is always written. Prefer that to `--update-snapshots=all`, which also rewrites every unrelated screen with whatever noise that one run happened to produce.

Commit the updated PNGs **in the same PR** as the UI change that caused them to change — a visual diff failing on an unrelated PR is a real regression signal, not noise to dismiss.

Review a failing visual check via the `playwright-report/` artifact CI uploads on every run — it renders expected/actual/diff images side-by-side.
