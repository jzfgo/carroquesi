import { defineConfig, devices } from '@playwright/test'
import { loadEnvFile } from 'node:process'

loadEnvFile()

const IS_CI = process.env.CI
const BACKEND_URL = `${process.env.VITE_BACKEND_PROTO}://${process.env.VITE_BACKEND_HOST}${process.env.VITE_BACKEND_PORT ? `:${process.env.VITE_BACKEND_PORT}` : ''}`
const FRONTEND_PORT_E2E = process.env.VITE_FRONTEND_PORT_E2E

export default defineConfig({
  testDir: './tests',
  // fullyParallel: true,
  forbidOnly: !!IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT_E2E}`,
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
      command: `pnpm build && pnpm preview -- --port ${FRONTEND_PORT_E2E}`,
      url: `http://localhost:${FRONTEND_PORT_E2E}`,
      reuseExistingServer: !IS_CI,
    },
    {
      command: 'just ../backend serve',
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: !IS_CI,
    },
  ],
})
