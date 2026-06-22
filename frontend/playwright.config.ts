import { defineConfig, devices } from '@playwright/test'

process.loadEnvFile()

export default defineConfig({
  testDir: './tests',
  // fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${process.env.VITE_E2E_PORT}`,
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
      command: `pnpm build && pnpm preview -- --port ${process.env.VITE_E2E_PORT}`,
      url: `http://localhost:${process.env.VITE_E2E_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'just ../backend serve',
      url: 'http://localhost:8000/health',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
