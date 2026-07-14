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
  workers: IS_CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
  },
  // Baselines are generated locally via Docker (see tests/README.md); a handful of pixels
  // on emoji/symbol glyphs (🛒, €, ⋯) still render slightly differently than on the actual
  // CI runner's font stack. 0.1% is well above that noise floor but far below what any real
  // visual regression (misplaced element, wrong theme, stray overlay) would produce.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
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
