import type { Page } from '@playwright/test'
import {
  expect,
  expectScreenshot,
  SEED_ITEMS,
  SEED_LISTS,
  SEED_TRIPS,
  test,
} from './fixtures'

const LIST_ID = SEED_LISTS[0].id
const TRIP_WITH_FILE = SEED_TRIPS.purchases[0] // trip-con-ticket
const TRIP_WITHOUT = SEED_TRIPS.purchases[1] // trip-sin-ticket

/**
 * Serve the seeded stack page. Trips live per-spec, not in the shared mock,
 * so a populated stack never drifts the other specs' list screenshots. The
 * latest trip mounts expanded, so its lines are fetched too.
 */
async function installTrips(page: Page) {
  const records = SEED_ITEMS[LIST_ID].filter((i) => i.purchased)
  await page.route(/\/purchases(\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(SEED_TRIPS),
    }),
  )
  await page.route(/\/purchases\/[^/]+\/items(\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(records),
    }),
  )
}

function tripCard(page: Page, store: string) {
  return page.locator('.trip-card').filter({ hasText: store })
}

// Trip headers print dates; pin the clock so the baselines describe seeded
// values, not the day they were generated. Same instant as the other specs.
const FIXED_NOW = new Date('2026-07-15T10:00:00Z')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW)
  // This spec is about the stack, not the notification priming card — keep it
  // out of the frame (same reasoning as purchase-lifecycle.spec.ts).
  await page.addInitScript(() =>
    localStorage.setItem('push-priming-dismissed', '1'),
  )
  await installTrips(page)
  await page.goto(`/lists/${LIST_ID}`)
  await expect(tripCard(page, TRIP_WITHOUT.store ?? '')).toBeVisible()
})

const THEMES = [
  { name: 'light', colorScheme: 'light' as const },
  { name: 'dark', colorScheme: 'dark' as const },
]

for (const { name: themeName, colorScheme } of THEMES) {
  test.describe(`${themeName} mode`, () => {
    test.use({ colorScheme })

    test('the two 25b states: solid miniature and dashed camera', async ({
      page,
    }) => {
      const withFile = tripCard(page, TRIP_WITH_FILE.store ?? '')
      const without = tripCard(page, TRIP_WITHOUT.store ?? '')

      // Solid: the real miniature, served by the pretend bucket.
      const img = withFile.locator('.trip-thumb__img')
      await expect(img).toBeVisible()
      await expect(img).toHaveAttribute('src', /__gcs__/)
      await expect(withFile.getByText('Ticket guardado')).toBeVisible()

      // Dashed: the fillable hole.
      await expect(without.locator('.trip-thumb--empty')).toBeVisible()
      await expect(without.getByText('Sin ticket · escanéalo')).toBeVisible()

      // The state is drawn by the border, and a 34px box costs less than the
      // screenshot budget — assert the style rule itself as well.
      await expect(withFile.locator('.trip-thumb')).toHaveCSS(
        'border-top-style',
        'solid',
      )
      await expect(without.locator('.trip-thumb')).toHaveCSS(
        'border-top-style',
        'dashed',
      )

      await expectScreenshot(page, `receipt-thumbnails-${themeName}.png`)
    })

    test('the solid thumb opens the paper fullscreen', async ({ page }) => {
      await tripCard(page, TRIP_WITH_FILE.store ?? '')
        .getByRole('button', { name: 'Ver el ticket' })
        .click()

      const viewer = page.getByRole('dialog', { name: 'Ticket' })
      await expect(viewer).toBeVisible()
      await expect(viewer.locator('.rfv__img')).toHaveAttribute(
        'src',
        /__gcs__/,
      )
      await expectScreenshot(page, `receipt-viewer-${themeName}.png`)

      await page.keyboard.press('Escape')
      await expect(viewer).toBeHidden()
    })
  })
}

test('the dashed thumb launches the scan flow', async ({ page }) => {
  await tripCard(page, TRIP_WITHOUT.store ?? '')
    .getByRole('button', { name: 'Escanear el ticket' })
    .click()
  // ALICE's consent is granted in the fixture, so the source picker opens
  // directly — the same funnel every other scan entry uses.
  await expect(page.getByRole('button', { name: 'Tomar foto' })).toBeVisible()
})
