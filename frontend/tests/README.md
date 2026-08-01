# E2E Tests (Playwright)

Run: `just frontend test-e2e` (alias: `pnpm test:e2e`). Runs against the **preview build**, not the dev server — if you've made frontend changes, build first (`pnpm build`) or just let Playwright's `webServer` config do it for you.

## Fixtures

No backend runs here. `fixtures.ts` intercepts every `localhost:8000` call and answers it from `fixtures.json`.

The payloads sit in JSON rather than in the spec so that both ends can check them. `fixtures.ts` annotates each one with a type from `src/types`, so a frontend type change breaks this file. `backend/tests/test_e2e_contract.py` reads the same JSON and validates it against the response model each route actually declares, so a backend response-shape change fails the backend job. Neither check exists without the other: drop the annotations and a frontend rename passes, drop the pytest and a backend rename passes.

Two consequences worth knowing before you edit `fixtures.json`:

- The backend suite has to stay green. `scripts/ci-changed-areas.sh` counts this file as a backend change for exactly that reason.
- Write paths are covered through templates. A write mock answers by spreading the echoed request fields over a `SEED_*` template from this file, so the key set and every non-echoed value are validated like the read fixtures. What remains outside the guard: the echoed request fields themselves, and the two PATCH mocks (list and item), which spread a patch over an already-validated base — a patch body cannot invent keys, so a template would add nothing.

## Visual regression

Key screens are also checked for pixel-level visual regressions via Playwright's `toHaveScreenshot()`, wrapped in the `expectScreenshot(page, name)` helper in `fixtures.ts`. Only the `chromium` and `Mobile Chrome` projects carry visual baselines — `expectScreenshot` no-ops on the other three (`firefox`, `webkit`, `Mobile Safari`), which still run full functional assertions.

Baseline PNGs live alongside each spec file (e.g. `smoke.spec.ts-snapshots/`) and are committed to git.

### Tolerance

`playwright.config.ts` allows a fixed number of differing pixels per screenshot (`maxDiffPixels`), not a share of the image (`maxDiffPixelRatio`). The distinction matters more than it looks. A ratio scales with the capture, so the 1280×720 desktop shot was allowed 921 differing pixels while the 360-wide mobile shot got 263 — for the same screen. Since a small text button costs around 600 pixels, desktop could gain or lose one and still pass. `fullPage` is a second reason to keep the budget absolute, though it has not bitten yet: every capture today is exactly viewport-sized, but the first screen that grows past its viewport would buy itself a bigger allowance under a ratio, for page height alone.

The number is 50, and it comes from a measurement rather than a guess (#216, JAV-70). The budget used to be 250, which was only known to be _enough_: CI passed every screen on a runner that installs its own fonts while the baselines come out of a container, so the gap between those two machines was known only as "at most 250" — a passing run cannot say how much less. Zeroing the budget on a branch made every comparison report its exact figure: twelve of the twenty-eight screens matched the container baselines pixel for pixel, and the other sixteen differed by 6 to 23 pixels, identically across all three attempts of each retry — deterministic font-rasterization noise, not flake. The budget is roughly twice that worst case, so a runner font update has some room to drift before turning CI red, and it sits well below the roughly 75 pixels that deleting the purchased-item strikethrough costs — still the only measurement of what a visible affordance is worth. A change smaller than 50 pixels without its own assertion still slips through, so treat the number as one to lower, never to raise.

That particular loss no longer rides on the number: `purchase-lifecycle.spec.ts` asserts the computed `text-decoration-line` directly, which fails whatever the tolerance is. Take that as the general move rather than a one-off. When the thing you are protecting **is** a style rule, assert the computed style and let the screenshot cover what no assertion can name. A budget can only ever catch what is bigger than itself.

A baseline that passes while depicting the wrong UI does not heal. It becomes the reference for every later run, so the missing element stays invisible and the next change near it is measured against a picture that was already wrong.

### Parallelism

CI runs two workers, which is about 15% faster than one — measured as a paired comparison inside single jobs, because the runner drifts enough between runs to hide an effect that size. The runner has four cores, and a worker is not worth one of them: each drives a browser that renders and composites on threads of its own, so two already use the machine. Three and four were measured too and came out no faster, so this is a number to leave alone. Sharding across jobs is the next lever if the suite grows, but not yet — every extra job re-pays the browser install and the build, which together cost more than the test phase they would be splitting.

Raising it surfaced one bug rather than causing it. An offline-queue drain that flushed nothing still asked the list to be read again, and that read carried the state from before whatever the test had just done — so a purchase or a newly added item vanished from the screen. It failed only sometimes because it was a race, and `retries: 2` turned the failures into passes. Two workers made the window wider and the race easier to see.

Take the general lesson rather than the specific fix: a suite that is green only because it retries can hide a real defect indefinitely. When judging a change to parallelism, run with `--retries=0` and read the _first-attempt_ result, or the measurement answers a different question than the one asked.

### Anything the screenshot shows must be pinned

A screenshot captures whatever was on screen, including today's date. `purchase-lifecycle.spec.ts` and `receipt-scanning.spec.ts` both pin the browser clock with `page.clock.setFixedTime` for exactly this reason: purchase dates are stamped client-side, so on a real clock every baseline would describe the day it was written and drift a little further from the truth every day after. Any new spec that screenshots a date, a relative time, or a random value needs the same treatment.

A spec can be clock-pinned and still lose a race to a timer. `setFixedTime` pins only what `Date` answers; `setTimeout` keeps running on the real clock, so anything that dismisses itself — a toast, a transient badge — can leave the screen between an assertion and the capture that follows it, and no retry brings it back. `page.clock.install` is the member of the API that fakes the timer functions themselves: under it the dismissal never fires unless the test advances the clock. Scope it to the test that screenshots the transient thing rather than the whole file, so the other tests keep running timers. `purchase-lifecycle.spec.ts` does this for the same-day-guard toast, and the comment there explains the race.

The clock is not the only fixture of this kind. `playwright.config.ts` also pins `timezoneId` to `Europe/Madrid` for the whole suite, so every committed baseline is rendered at that offset and a spec does not have to pin the zone itself. Dates in this app are local calendar days throughout — receipt dates are built from local components and reduced back to the viewer's calendar — so an unpinned zone would make the machine's offset an input to what renders.

One consequence is easy to get wrong. `timezoneId` pins the **browser**, and Playwright does not touch the Node process the test file runs in. So an expectation about an instant leaving the browser has to be written as a literal: computing it in the spec builds it at the runner's zone, which is not the one under test. `receipt-scanning.spec.ts` asserts a receipt date this way, and the comment there explains the value. The same asymmetry means the vitest suite is still on the machine's zone, so a unit test touching dates has to be made zone-less on its own.

One thing to know before you pin a spec that also adds items: `useListItems` builds the optimistic temporary id from the clock, so under a frozen one two adds in the same test produce the same id. No spec hits this today — the one that adds items is not pinned — but the combination is easy to reach from here.

An optimistic write puts a second state on the screen that needs the same treatment as a date. The item a user adds is drawn before the server answers, and it carries no author yet, so its avatar reads `?` until the created item arrives and replaces it. Both pictures are real, and `toHaveScreenshot` settles for whichever it finds first — so the baseline records one of them and the other one fails on a slow run. Waiting for the name to appear is not enough, because the optimistic item is what makes it appear. Wait for something only the server's answer can produce. `smoke.spec.ts` waits for that avatar.

### Regenerating baselines

Baselines must be generated in the container, never on your own machine. Every committed PNG came out of that one image, so it is the only machine whose output the rest of them still agree with. That holds whatever you run, Ubuntu included — the image carries a fixed set of font packages, which is not the set a desktop install of the same distribution ends up with.

On macOS the mistake announces itself: Playwright suffixes the filename by platform, so a `-darwin.png` is simply never picked up by CI. On Linux nothing announces it. The host writes the same `-linux.png` CI expects, so a natively generated baseline is picked up and quietly disagrees. Measured once, on an Arch-based host against the Ubuntu-based container: the `chromium` screens landed within 68 pixels of the container's, while the `Mobile Chrome` ones were out by up to 1046. Under the old 250-pixel budget, 68 passed the gate — the silent-wrong-baseline failure this page is otherwise about, arriving by a second route. The measured 50-pixel budget is smaller than that drift, so a host-built baseline now probably announces itself in CI instead of passing; probably, not certainly, so the rule stays: generate in the container.

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
