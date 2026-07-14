import { expect, expectScreenshot, SEED_ITEMS, SEED_LISTS, test } from './fixtures'

test('dashboard shows all lists', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel(SEED_LISTS[0].name)).toBeVisible()
  await expect(page.getByLabel(SEED_LISTS[1].name)).toBeVisible()
  await expectScreenshot(page, 'dashboard-light.png')
})

test('list screen shows items', async ({ page }) => {
  await page.goto(`/lists/${SEED_LISTS[0].id}`)
  const items = SEED_ITEMS[SEED_LISTS[0].id]
  await expect(page.getByText(items[0].name)).toBeVisible()
  await expect(page.getByText(items[1].name)).toBeVisible()
})

test('adding an item appears immediately', async ({ page }) => {
  await page.goto(`/lists/${SEED_LISTS[0].id}`)
  await page.getByLabel('Añadir producto').fill('Manzanas')
  await page.getByRole('button', { name: 'Añadir', exact: true }).click()
  await expect(page.getByText('Manzanas')).toBeVisible()
})
