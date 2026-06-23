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

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000'
const DEV_AUTH_BYPASS = 'true'

const FRONTEND_PORT = process.env.FRONTEND_PORT_E2E ?? '4173'
const FRONTEND_URL = process.env.FRONTEND_URL_E2E || 'http://localhost:4173'
const VITE_DEV_USER_ID = process.env.VITE_DEV_USER_ID || 'seed-alice'

// loadEnvFile() sets VITE_BACKEND_URL as the literal "${BACKEND_URL}" since it
// doesn't expand variable references. Override it now so the Vite build
// subprocess (pnpm build) doesn't inherit the unexpanded literal.
process.env.VITE_BACKEND_URL = BACKEND_URL

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

  webServer: [
    {
      command: `pnpm build && pnpm preview -- --port ${FRONTEND_PORT}`,
      url: FRONTEND_URL,
      reuseExistingServer: !IS_CI,
      env: { VITE_DEV_USER_ID },
    },
    // Backend not available in CI — omit so smoke tests can run without full stack
    ...(!IS_CI
      ? [
          {
            command: 'just ../backend serve',
            url: `${BACKEND_URL}/health`,
            reuseExistingServer: true,
            env: { FRONTEND_URL, DEV_AUTH_BYPASS },
          },
        ]
      : []),
  ],
})
