import type { BrowserContext, Page } from '@playwright/test'
import {
  expect,
  expectScreenshot,
  SEED_ITEMS,
  SEED_LISTS,
  test,
} from './fixtures'

/**
 * Go offline the way the app sees it.
 *
 * Two halves, and both are needed: `setOffline` is what flips
 * `navigator.onLine` and fires the event the band listens for, while the abort
 * is what makes a write actually fail. The fixture answers every backend call
 * from inside the browser, so without it a POST would be fulfilled locally and
 * the gate would be the only thing that ever stopped it.
 */
async function goOffline(page: Page, context: BrowserContext) {
  await context.setOffline(true)
  await page.route('**/lists/*/items', (route) => route.abort())
}

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

async function openSettings(page: Page) {
  await page.goto('/')
  await expect(page.getByLabel(SEED_LISTS[0].name)).toBeVisible()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible()
}

async function addItemManzanas(page: Page) {
  await page.goto(`/lists/${SEED_LISTS[0].id}`)
  await page.getByLabel('Añadir producto').fill('Manzanas')
  await page.getByRole('button', { name: 'Añadir', exact: true }).click()
  await expect(page.getByText('Manzanas')).toBeVisible()
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

    // The dashboard is flat surface, and so is this: the sheet is the largest
    // place that could pick up paper language by accident. The version in the
    // foot is masked — it changes at every release, and this screen does not.
    test('settings opens from the avatar', async ({ page }) => {
      await openSettings(page)
      await expectScreenshot(page, `settings-${themeName}.png`, {
        mask: [page.locator('.settings-sheet__version')],
      })
    })

    test('list screen shows items', async ({ page }) => {
      await assertListScreenLoaded(page)
      await expectScreenshot(page, `list-screen-${themeName}.png`)
    })

    test('adding an item appears immediately', async ({ page }) => {
      await addItemManzanas(page)
      await expectScreenshot(page, `add-item-${themeName}.png`)
    })

    /**
     * A list with no signal is still a list: it reads, it opens, it scrolls.
     * What it stops doing is pretending a write is possible. The band above
     * the router says why, once, and the controls that write are drawn as
     * unavailable rather than tapped and refused.
     */
    test('without a connection the list reads but does not write', async ({
      page,
      context,
    }) => {
      await assertListScreenLoaded(page)
      await goOffline(page, context)

      await expect(page.locator('.offline-band')).toContainText('Sin conexión')

      // A name first: the add button is also disabled on an empty field, so
      // without this the assertion passes on `!hasName` and would go on
      // passing with the offline gate deleted.
      await page.getByLabel('Añadir producto').fill('Manzanas')
      await expect(
        page.getByRole('button', { name: 'Añadir', exact: true }),
      ).toBeDisabled()
      await expect(page.getByRole('checkbox').first()).toBeDisabled()

      // Nothing was added, and nothing anywhere claims it will be sent later.
      await expect(page.getByText(/se enviar/i)).toHaveCount(0)
      await expect(page.getByText(/cambios sin enviar/i)).toHaveCount(0)

      await expectScreenshot(page, `offline-band-${themeName}.png`)
    })

    /** The band is a change once it comes back, and then it goes away. */
    test('the band says the connection is back, then leaves', async ({
      page,
      context,
    }) => {
      await assertListScreenLoaded(page)
      await goOffline(page, context)
      await expect(page.locator('.offline-band')).toContainText('Sin conexión')

      await page.unroute('**/lists/*/items')
      await context.setOffline(false)

      await expect(page.locator('.offline-band')).toContainText(
        'De nuevo en línea',
      )
      await expect(page.locator('.offline-band')).toBeHidden()

      // Same trap as above: type before asserting the control came back.
      await page.getByLabel('Añadir producto').fill('Manzanas')
      await expect(
        page.getByRole('button', { name: 'Añadir', exact: true }),
      ).toBeEnabled()
    })
  })
}
