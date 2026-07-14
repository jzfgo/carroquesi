import type { Page } from '@playwright/test'
import { expect, expectScreenshot, SEED_ITEMS, SEED_LISTS, test } from './fixtures'

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
}

async function addItemManzanas(page: Page) {
  await page.goto(`/lists/${SEED_LISTS[0].id}`)
  await page.getByLabel('Añadir producto').fill('Manzanas')
  await page.getByRole('button', { name: 'Añadir', exact: true }).click()
  await expect(page.getByText('Manzanas')).toBeVisible()
}

test.describe('light mode', () => {
  test('dashboard shows all lists', async ({ page }) => {
    await assertDashboardLoaded(page)
    await expectScreenshot(page, 'dashboard-light.png')
  })

  test('list screen shows items', async ({ page }) => {
    await assertListScreenLoaded(page)
    await expectScreenshot(page, 'list-screen-light.png')
  })

  test('adding an item appears immediately', async ({ page }) => {
    await addItemManzanas(page)
    await expectScreenshot(page, 'add-item-light.png')
  })
})

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('dashboard shows all lists', async ({ page }) => {
    await assertDashboardLoaded(page)
    await expectScreenshot(page, 'dashboard-dark.png')
  })

  test('list screen shows items', async ({ page }) => {
    await assertListScreenLoaded(page)
    await expectScreenshot(page, 'list-screen-dark.png')
  })

  test('adding an item appears immediately', async ({ page }) => {
    await addItemManzanas(page)
    await expectScreenshot(page, 'add-item-dark.png')
  })
})
