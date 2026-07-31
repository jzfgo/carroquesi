import type { BrowserContext, Page } from '@playwright/test'
import {
  expect,
  expectScreenshot,
  SEED_ITEMS,
  SEED_LISTS,
  test,
} from './fixtures'

/**
 * Pinned because «Cambios sin enviar» prints when each change was written, and
 * it says «hoy 10:00». Left on the machine clock the baseline would depict the
 * minute it was generated and disagree with the runner a minute later.
 *
 * It fixes `Date.now`, which is what the queue stamps an op with and what the
 * sheet reads those stamps against — the same instant on both sides, which is
 * the point.
 */
const FIXED_NOW = new Date('2026-07-31T10:00:00Z')

/**
 * Go offline the way the app sees it.
 *
 * Two halves, and both are needed: `setOffline` is what flips
 * `navigator.onLine` and fires the event the band and the drain listen for,
 * while the abort is what makes a write actually fail. The fixture answers
 * every backend call from inside the browser, so without it the POST would be
 * fulfilled locally and nothing would ever reach the queue.
 */
async function goOffline(page: Page, context: BrowserContext) {
  await context.setOffline(true)
  await page.route('**/lists/*/items', (route) => route.abort())
}

/**
 * The row appears at once — the app is optimistic — so waiting on it proves
 * nothing about the queue. `queued` is the count the band promises about, and
 * it only moves once the write has actually been written down.
 */
async function addOffline(page: Page, name: string, queued: number) {
  await page.getByLabel('Añadir producto').fill(name)
  await page.getByRole('button', { name: 'Añadir', exact: true }).click()
  await expect(page.getByText(name)).toBeVisible()
  await expect(page.locator('.list-notice')).toContainText(
    queued === 1
      ? 'Sin conexión · 1 cambio se enviará solo'
      : `Sin conexión · ${queued} cambios se enviarán solos`,
  )
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
     * A shopping list with no signal is not broken — the supermarket is where
     * there is no coverage. The band promises, the dot marks which lines the
     * promise is about, and nothing offers a button to press.
     */
    test('without a connection the list says so and keeps working', async ({
      page,
      context,
    }) => {
      await assertListScreenLoaded(page)
      await goOffline(page, context)
      await addOffline(page, 'Manzanas', 1)

      await expect(page.getByLabel('Sin enviar')).toBeVisible()
      await expectScreenshot(page, `offline-band-${themeName}.png`)
    })

    /**
     * Driven from the notice row rather than from the toast that also opens
     * this sheet: the toast lasts six seconds, and a test that has to catch it
     * is a flake generator. The row is the reason that door exists.
     */
    test('a change the server refused waits where it can be found', async ({
      page,
      context,
    }) => {
      await page.clock.setFixedTime(FIXED_NOW)
      await assertListScreenLoaded(page)
      await goOffline(page, context)
      await addOffline(page, 'Manzanas', 1)
      // A minute later, so the two rows carry distinct stamps. On one fixed
      // instant they tie, and the sheet's order — oldest first — would then be
      // whichever way the queue happened to hand them over. Advancing only
      // after the first write is down is the other half of that: a clock moved
      // while it was still in flight would stamp both the same anyway.
      await page.clock.setFixedTime(new Date(FIXED_NOW.getTime() + 60_000))
      await addOffline(page, 'Pimentón', 2)

      // Back on the network, and the server says no — the case that used to
      // delete the write and leave a number in a notice that left.
      await page.unroute('**/lists/*/items')
      await page.route('**/lists/*/items', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        const body = route.request().postDataJSON() as { name: string }
        return route.fulfill({
          // One of each: a server that failed and may not next time, and a
          // list that is gone and never will accept it.
          status: body.name === 'Manzanas' ? 503 : 404,
          body: 'nope',
        })
      })
      await context.setOffline(false)

      // The notice says so too, and it is the door that lasts. Dismissing it
      // is what this test is about: the row behind it is still there.
      const toast = page.locator('.toast')
      await expect(toast).toContainText('2 cambios no se pudieron enviar')
      await toast.getByRole('button', { name: 'Cerrar' }).click()
      await expect(toast).toBeHidden()

      const notice = page.locator('.list-notice')
      await expect(notice).toContainText('2 cambios sin enviar')
      await notice.getByRole('button', { name: 'Ver cuáles' }).click()

      const sheet = page.getByRole('dialog', { name: 'Cambios sin enviar' })
      await expect(sheet).toBeVisible()
      // Oldest first, and each row says what it was, when, and why it did not
      // go in. The stamps differ, so the order is a fact and not a tie.
      const rows = sheet.locator('.unsent__row')
      await expect(rows.first()).toContainText(
        'Añadido · hoy 12:00 · el servidor falló',
      )
      await expect(rows.last()).toContainText(
        'Añadido · hoy 12:01 · la lista ya no existe',
      )
      await expectScreenshot(page, `unsent-changes-${themeName}.png`)
    })
  })
}
