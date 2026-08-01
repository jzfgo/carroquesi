import { defineConfig, devices } from '@playwright/test'
import { join } from 'node:path'
import { loadEnvFile } from 'node:process'

// Load .env if present — note: does NOT expand ${VAR} syntax (unlike Vite's dotenv-expand)
// Use import.meta.dirname so the path is correct regardless of cwd when tests are launched
try {
  loadEnvFile(join(import.meta.dirname, '.env'))
} catch {
  /* .env is optional in CI */
}

const IS_CI = process.env.CI

const FRONTEND_PORT = process.env.FRONTEND_PORT_E2E ?? '4173'
const FRONTEND_URL = process.env.FRONTEND_URL_E2E || 'http://localhost:4173'

const VITE_DEV_USER_ID = process.env.VITE_DEV_USER_ID || 'seed-alice'
const VITE_BACKEND_URL = 'http://localhost:8000'

// Dummy Firebase config — SDK must initialize cleanly at module load.
// Dev auth bypass means no actual Firebase API calls are made.
const VITE_FIREBASE_API_KEY = 'test-api-key'
const VITE_FIREBASE_AUTH_DOMAIN = 'test-project.firebaseapp.com'
const VITE_FIREBASE_PROJECT_ID = 'test-project'
const VITE_FIREBASE_STORAGE_BUCKET = 'test-project.appspot.com'
const VITE_FIREBASE_MESSAGING_SENDER_ID = '000000000000'
const VITE_FIREBASE_APP_ID = '1:000000000000:web:0000000000000000000000'

export default defineConfig({
  testDir: './tests',
  // fullyParallel: true,
  forbidOnly: !!IS_CI,
  retries: IS_CI ? 2 : 0,
  // Two, because the runner has four cores and a worker is not worth one core:
  // each drives a browser that renders and composites on threads of its own, so
  // two of them already use the machine. Three and four were measured too and
  // came out no faster than two, which is the reason to leave this alone
  // rather than raise it again later.
  workers: IS_CI ? 2 : undefined,
  reporter: 'html',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    // The suite's timezone is a fixture, not a property of the machine running
    // it. Dates in this app are local calendar days end to end: receipt dates
    // are built from local components and reduced back to the viewer's calendar,
    // and the purchase clock is read the same way. Unpinned, the offset becomes
    // a silent input — a date assertion or a rendered day can differ between a
    // developer's machine and the runner, which is how an assertion that no
    // correct value could satisfy sat green in CI for as long as it did.
    //
    // Madrid rather than UTC on purpose. The app is Spanish, so almost every
    // real user sits at +1 or +2 — the Canaries are the exception, on +0 in
    // winter. What rules UTC out is not that nobody is there but that it is the
    // one offset where local midnight and UTC midnight coincide, so it is the
    // one place an offset bug cannot show itself. Any nonzero offset exposes the
    // bug class; Madrid is the one most users are on. Pinning here also
    // decouples the browser from the runner's own TZ, which Playwright does not
    // touch.
    timezoneId: 'Europe/Madrid',
    // These specs test app/API contract behavior, not PWA/offline behavior — the
    // active service worker (devOptions.enabled: true) otherwise proxies fetches
    // in a way that makes route mocking unreliable on WebKit-based projects
    // (webkit, Mobile Safari), causing UI-triggered POST/PATCH requests to
    // intermittently fail with "no-response" even though the same mock works
    // fine for Chromium/Firefox and for requests fired outside a click handler.
    serviceWorkers: 'block',
  },
  // How many pixels may differ before a screenshot is a failure. An absolute
  // count, never a ratio: a ratio scales with the image, so the 1280x720
  // desktop capture was allowed 921 differing pixels while the 360-wide mobile
  // one got 263 — for the same UI. A small text button costs about 600, so
  // desktop could gain or lose one and still pass, and a baseline that passes
  // while showing the wrong UI never heals, because --update-snapshots only
  // rewrites what already failed.
  //
  // 50 comes from a measurement, not a guess. With this set to zero, the CI
  // runner — which installs its own fonts, while every baseline comes out of
  // the container — disagreed with the baselines by 6 to 23 pixels per screen,
  // and twelve of the twenty-eight screens matched pixel for pixel. The counts
  // were identical across every retry, so that is rasterization noise, not
  // flake. The budget is roughly twice the worst case, which leaves room for
  // the runner's fonts to drift a little without going red.
  //
  // What bounds it from above is the signal it has to preserve. The only
  // measurement of that is the strikethrough on a purchased item: deleting it
  // moves about 75 pixels. That particular loss no longer depends on this
  // number — purchase-lifecycle.spec.ts asserts the computed style, so the
  // rule cannot vanish silently. The class of problem stands, though: 75 is
  // the going rate for a visible affordance, and one smaller than this budget
  // and without its own assertion would still slip through. So treat this as
  // a number to lower, never to raise.
  expect: {
    toHaveScreenshot: { maxDiffPixels: 50 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 10'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 17'] },
    },
  ],

  webServer: {
    command: `pnpm build && pnpm preview -- --port ${FRONTEND_PORT}`,
    url: FRONTEND_URL,
    reuseExistingServer: !IS_CI,
    env: {
      VITE_DEV_USER_ID,
      VITE_BACKEND_URL,
      VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_STORAGE_BUCKET,
      VITE_FIREBASE_MESSAGING_SENDER_ID,
      VITE_FIREBASE_APP_ID,
    },
  },
})
