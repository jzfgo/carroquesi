import type { Page } from '@playwright/test'
import {
  awaitPrimingCard,
  expect,
  expectScreenshot,
  SEED_ITEMS,
  SEED_LISTS,
  test,
} from './fixtures'

async function assertDashboardLoaded(page: Page) {
  await page.goto('/')
  await expect(page.getByLabel(SEED_LISTS[0].name)).toBeVisible()
  await expect(page.getByLabel(SEED_LISTS[1].name)).toBeVisible()
}

async function assertListScreenLoaded(page: Page) {
  await page.goto(`/lists/${SEED_LISTS[0].id}`)
  const items = SEED_ITEMS[SEED_LISTS[0].id]
  await expect(page.getByText(items[0].name)).toBeVisible()
  await expect(page.getByText(items[1].name)).toBeVisible()
  await awaitPrimingCard(page)
}

async function addItemManzanas(page: Page) {
  await page.goto(`/lists/${SEED_LISTS[0].id}`)
  await page.getByLabel('Añadir producto').fill('Manzanas')
  await page.getByRole('button', { name: 'Añadir', exact: true }).click()
  await expect(page.getByText('Manzanas')).toBeVisible()
  await awaitPrimingCard(page)
}

const THEMES = [
  { name: 'light', colorScheme: 'light' as const },
  { name: 'dark', colorScheme: 'dark' as const },
]

for (const { name: themeName, colorScheme } of THEMES) {
  test.describe(`${themeName} mode`, () => {
    test.use({ colorScheme })

    test('dashboard shows all lists', async ({ page }) => {
      await assertDashboardLoaded(page)
      await expectScreenshot(page, `dashboard-${themeName}.png`)
    })

    test('list screen shows items', async ({ page }) => {
      await assertListScreenLoaded(page)
      await expectScreenshot(page, `list-screen-${themeName}.png`)
    })

    test('adding an item appears immediately', async ({ page }) => {
      await addItemManzanas(page)
      await expectScreenshot(page, `add-item-${themeName}.png`)
    })
  })
}

// A screen reader picks its pronunciation engine from `lang`. Nothing on
// screen changes when it is wrong, so no screenshot can catch this. The
// manifest is a second document with its own copy of the declaration, and
// it is the one the OS reads for the installed app's name.
test('declares Spanish on both documents it serves', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')

  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  expect((await manifest.json()).lang).toBe('es')
})
