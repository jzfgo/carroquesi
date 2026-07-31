# E2E Tests (Playwright)

Run: `just frontend test-e2e` (alias: `pnpm test:e2e`). Runs against the **preview build**, not the dev server — if you've made frontend changes, build first (`pnpm build`) or just let Playwright's `webServer` config do it for you.

## Visual regression

Key screens are also checked for pixel-level visual regressions via Playwright's `toHaveScreenshot()`, wrapped in the `expectScreenshot(page, name)` helper in `fixtures.ts`. Only the `chromium` and `Mobile Chrome` projects carry visual baselines — `expectScreenshot` no-ops on the other three (`firefox`, `webkit`, `Mobile Safari`), which still run full functional assertions.

Baseline PNGs live alongside each spec file (e.g. `smoke.spec.ts-snapshots/`) and are committed to git.

### Tolerance

`playwright.config.ts` allows a fixed number of differing pixels per screenshot (`maxDiffPixels`), not a share of the image (`maxDiffPixelRatio`). The distinction matters more than it looks. A ratio scales with the capture, so the 1280×720 desktop shot was allowed 921 differing pixels while the 360-wide mobile shot got 263 — for the same screen. Since a small text button costs around 600 pixels, desktop could gain or lose one and still pass. `fullPage` is a second reason to keep the budget absolute, though it has not bitten yet: every capture today is exactly viewport-sized, but the first screen that grows past its viewport would buy itself a bigger allowance under a ratio, for page height alone.

The number is 250, and it is known to be enough rather than known to be tight. CI passes every screen on a runner that installs its own fonts, while the baselines come out of a container, so the gap between those two machines is at most 250 — a run that passes cannot say how much less than that it really is. What bounds the number from above is the signal it has to preserve, and 250 does not preserve all of it. The only affordance ever measured — the strikethrough purchased items carried before the sheet model replaced it — moved about 75 pixels, so on the visual gate alone a real affordance leaves the screen with every baseline still green. So 250 catches a change the size of a button and misses a change the size of a line through a word — treat it as a number to lower, never to raise.

That kind of loss does not have to ride on the number. `purchase-lifecycle.spec.ts` asserts the computed style of the two things that say a line is in the cart — the disc is filled, and the name's ink sits a rung below an untouched line's — and both fail whatever the tolerance is. Take it as the general move rather than a one-off. When the thing you are protecting **is** a style rule, assert the computed style and let the screenshot cover what no assertion can name.

Prefer a relation to a fixed value when you can. Both of those assertions compare the cart line against a line still to buy rather than naming a colour, so one form holds under both themes and neither has to be revisited when a token is retuned. A budget can only ever catch what is bigger than itself.

A baseline that passes while depicting the wrong UI does not heal. It becomes the reference for every later run, so the missing element stays invisible and the next change near it is measured against a picture that was already wrong.

### Anything the screenshot shows must be pinned

A screenshot captures whatever was on screen, including today's date. `purchase-lifecycle.spec.ts` and `receipt-scanning.spec.ts` both pin the browser clock with `page.clock.setFixedTime` for exactly this reason: purchase dates are stamped client-side, so on a real clock every baseline would describe the day it was written and drift a little further from the truth every day after. Any new spec that screenshots a date, a relative time, or a random value needs the same treatment.

The clock is not the only fixture of this kind. `playwright.config.ts` also pins `timezoneId` to `Europe/Madrid` for the whole suite, so every committed baseline is rendered at that offset and a spec does not have to pin the zone itself. Dates in this app are local calendar days throughout — receipt dates are built from local components and reduced back to the viewer's calendar — so an unpinned zone would make the machine's offset an input to what renders.

One consequence is easy to get wrong. `timezoneId` pins the **browser**, and Playwright does not touch the Node process the test file runs in. So an expectation about an instant leaving the browser has to be written as a literal: computing it in the spec builds it at the runner's zone, which is not the one under test. `receipt-scanning.spec.ts` asserts a receipt date this way, and the comment there explains the value. The same asymmetry means the vitest suite is still on the machine's zone, so a unit test touching dates has to be made zone-less on its own.

One thing to know before you pin a spec that also adds items: `useListItems` builds the optimistic temporary id from the clock, so under a frozen one two adds in the same test produce the same id. No spec hits this today — the one that adds items is not pinned — but the combination is easy to reach from here.

### A hairline can cost ten times the budget

A 1px rule across a 1280px screen is 1280 pixels. Move it one row and the diff counts both rows: 2560, against a budget of 250. The screen looks identical, and no amount of staring at the two images finds it.

That move is not a change anyone made. A rule lands on a whole device row only if the box it sits on does. `.item-detail` was capped at `88vh` — 633.6px on a 720px viewport — and sits on the bottom edge, so a fractional height gave it a fractional top; the heading added a second fraction, because 24px of type at 1.3 is a 31.2px line. Every rule in the sheet ended up about a tenth of a pixel from the point where the browser has to choose one row or the other, and the container and the CI runner chose differently.

So when a visual check fails by thousands of pixels on a screen you believe you did not change, measure before you look. Count the differing pixels per row: a row at exactly the image width is a rule that moved, and the fix is upstream of the screenshot. `round(down, …, 1px)` on the offending height makes the geometry whole, with the plain value left above it as the fallback. Do not reach for the tolerance — a budget large enough to hide a moved hairline is large enough to hide four buttons.

The residual after that is ordinary glyph antialiasing, and it does not respond to geometry. `price-history-open-*` is the densest screen in the suite and sits just over the budget on this account alone: the container renders it about 280 pixels away from what both CI and an Arch host render, and those two agree with each other exactly. Nothing is wrong with it, and there is nothing to fix in the app — it is the container being the outlier, on the one screen crowded enough for that to matter.

Narrowing that capture to the sheet was tried, on the reasoning that the app header behind it is not the surface under test. It bought **one pixel**, 281 to 280. The lesson generalises: a per-row diff taken at your own threshold is a good way to find _where_ pixels differ, but it does not tell you which of them this comparator counts. `toHaveScreenshot` scores each pixel by colour distance, so a large area of faint disagreement can read as almost nothing while a small area of stark disagreement is the whole number. Here the header was the faint kind and the item name and the mono figures were the stark kind — all three inside the sheet. Measure the change, not the region, before spending a helper API on it.

So the opened shop of `purchase-lifecycle.spec.ts` carries **no baseline**. Everything else was ruled out first: the geometry lands on whole pixels, and the fonts are not the difference — JetBrains Mono loads and draws identically in the container and outside it, measured as a bare family at 80px on both, with every `woff2` returning 200. What is left is how two font stacks hint the same file, on the one panel dense enough in mono figures for that to clear 250. No change to the app moves it, and raising the budget for one screen buys a number nobody can justify later. The spec states the panel's contents instead — the three figures, the ≈ beside a converted amount, the «sin precio» row, the count — which is a stronger guard than a picture for everything except layout, and layout is still photographed one line earlier by `item-detail-*`.

The general rule that falls out of it: a screen can be too dense in small text to hold a pixel baseline across two machines. When you meet one, say so where the baseline would have gone, and be able to show the measurement that ruled out the causes you _can_ fix.

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

### Finding the stale ones without having to guess

Deleting works only once you know **which** baseline is stale, and that is the part you usually do not know. Set `maxDiffPixels: 0` in `playwright.config.ts`, run `just frontend update-snapshots`, then put the number back. That rewrites every baseline whose pixels genuinely differ and leaves byte-identical ones untouched, so it finds the set instead of confirming a hunch — and because the run happens in the container the baselines already come from, machine noise is not in the picture and cannot be laundered into a file.

Reach for it after any change that alters rendering app-wide: a money or date format, a type token, a shared component. Such a change moves screens nobody thought to open, and on each of them it may land under 250 — which means it does not fail, does not get rewritten, and leaves that baseline asserting a screen the app stopped drawing. It happened here: the money format moved every price in the app, and eighteen baselines across four spec files went on depicting `€0.75` while the app drew `€ 0,75`. They were 56–127 differing pixels each, against captures that were correct sitting at 1–23 — so each was also spending a third to a half of its budget on a difference nobody knew about, leaving that much less room for the machine variance the number exists to absorb.

### The glyphs used to come from someone else's server

They no longer do. `src/fonts.css` declares every face and `src/assets/fonts/` holds the bytes, both written by `scripts/fetch-fonts.py`; nothing in the app requests `fonts.googleapis.com` or `fonts.gstatic.com` any more. This section stays because what it described was real, and vendoring is only half the fix.

What it described: the container is the one machine whose output the rest of the baselines agree with — but that held only while an external CDN kept serving it the same bytes. Google re-cuts a family and bumps its version directory (`geist/v5`, `caveat/v23`) when it does, and every baseline in the suite went stale at once, with no commit to blame and no PR to catch it. Worse if the re-cut were a re-hinting rather than a redraw: each capture moves less than 250, nothing fails, and the suite goes on asserting glyphs the app stopped drawing. Nothing in this repo could have told you it had happened.

Vendoring turns that from a silent event into a diff. A refresh is `just frontend fetch-fonts`, and a changed `.woff2` in its output **is** the notice: the letterforms moved, so the baselines have to be regenerated in the same commit. That is the half the vendoring does not do by itself — it makes the change visible, it does not make it safe. Treat a font refresh as an app-wide rendering change, which is what the section above is about.

One thing did not change. `≈` — beside a converted price in `PriceHistoryBlock`, and beside the running total in `LogPurchaseSheet` — is outside every subset Google serves, `latin` included, so it came from a system font before and still does. It is the one glyph in the suite whose shape is still the container's to decide.

Commit the updated PNGs **in the same PR** as the UI change that caused them to change — a visual diff failing on an unrelated PR is a real regression signal, not noise to dismiss.

Review a failing visual check via the `playwright-report/` artifact CI uploads on every run — it renders expected/actual/diff images side-by-side.

## Neither sweep can see a test that is green for the wrong reason

The `maxDiffPixels: 0` pass above has a unit-suite sibling: run the whole suite from one end of the world to the other, and any assertion naming a day that a reader further east would see differently turns red.

```bash
cd frontend
for tz in UTC America/New_York Europe/Madrid Asia/Tokyo \
          Pacific/Auckland Pacific/Kiritimati Pacific/Midway; do
  printf '%-22s ' "$tz"; TZ=$tz pnpm test 2>&1 | grep -E '^ +Tests +'
done
```

Those seven span −11 to +14. That is not quite the full range — `Etc/GMT+12` exists at −12 — but Midway is the westmost _inhabited_ zone, and nothing in the suite distinguishes an hour further out. Kiritimati is the eastern end, and Auckland earns its place separately: +12/+13 is where a far-east zone that observes DST catches what a fixed +14 does not. The runner's zone is what varies here; the browser's is pinned separately (see above).

The two sweeps are one instrument pointed at two things, and they share a blind spot. Both work by making a hidden difference turn **red**. Neither can see a test that passes without asserting anything.

Negative assertions are where that bites, because they have two ways to pass and only one of them is the test. `expect(screen.queryByText('15 jul')).not.toBeInTheDocument()` was green in every zone from −11 to +14; in most of them it was green because the sheet drew «16 jul» and the query matched nothing at all, not because the code had dropped the date it was written to catch. Reintroducing that bug settled it: Madrid failed, Auckland passed 22 of 22. The sweep ran the very zone that exposes the flaw and still reported success — a vacuous pass and a real one are the same colour.

So the zone sweep audits assertions that **name** a rendered value. It cannot find the ones that quietly stopped naming one. For those, ask the DOM something with a single answer in every zone — `document.querySelector('.item-detail__last-meta')` is either there or it is not — and pair it with a positive test that the row appears when it should, so its absence means something was removed rather than never drawn.
