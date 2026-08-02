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
  // The name arrives with the optimistic item, which carries no author yet, so
  // its avatar reads "?" until the created item comes back and replaces it.
  // Both states are on screen for real, and the screenshot below settles for
  // whichever one it finds first — so wait for the one the baseline depicts.
  //
  // Assert the initial rather than the absence of "?". A negated matcher is
  // satisfied by an element that is not there at all, so renaming the class
  // would delete this wait without failing anything, and the race would come
  // back unannounced. The author is seeded, so "A" is a fixture, not a guess.
  await expect(
    page
      .locator('.item-card')
      .filter({ hasText: 'Manzanas' })
      .locator('.item-card__avatar'),
  ).toHaveText('A')
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

    test('avatar opens the settings sheet', async ({ page }) => {
      await assertDashboardLoaded(page)
      await page.getByRole('button', { name: 'Ajustes' }).click()
      await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible()
      await expect(page.getByText('Salir de la cuenta')).toBeVisible()
      await expectScreenshot(page, `settings-sheet-${themeName}.png`)
    })
  })
}

// The 34a override: an explicit preference beats the OS scheme, and the
// pre-paint script in index.html restores it before first paint on the next
// load. The dark baselines above stay on pure OS dark — no stored preference —
// so they keep exercising the media-query path this test deliberately leaves.
test.describe('appearance override', () => {
  test.use({ colorScheme: 'dark' })

  test('picking Claro overrides OS dark and survives a reload', async ({
    page,
  }) => {
    await assertDashboardLoaded(page)
    await page.getByRole('button', { name: 'Ajustes' }).click()
    await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible()
    await page.getByRole('radio', { name: 'Claro' }).click()

    const html = page.locator('html')
    await expect(html).toHaveClass(/theme-light/)
    // The light --paper-0, painted from :root — the class must beat the
    // media query, not merely be present.
    await expect(html).toHaveCSS('background-color', 'rgb(238, 241, 245)')

    await page.reload()
    await expect(page.getByLabel(SEED_LISTS[0].name)).toBeVisible()
    await expect(html).toHaveClass(/theme-light/)
    await expect(html).toHaveCSS('background-color', 'rgb(238, 241, 245)')
  })
})

// The 38a panel geometry is a style rule, and a drift smaller than the
// screenshot pixel budget would vanish silently — so the load-bearing numbers
// are asserted as computed styles too: 36px emoji column, 28px glyph, and the
// 56/50px row heights (with and without a subtitle).
test('panel rows keep the 38a geometry', async ({ page }) => {
  await page.goto('/')
  const rows = page.locator('.list-card')
  await expect(rows).toHaveCount(SEED_LISTS.length)

  await expect(rows.first()).toHaveCSS('grid-template-columns', /^36px /)

  await expect(page.locator('.list-card__emoji').first()).toHaveCSS(
    'font-size',
    '28px',
  )

  // Compra semanal is shared with a cart running, so its row carries a
  // subtitle; Fiesta de cumple is solo with an empty cart and stays compact.
  expect((await rows.nth(0).boundingBox())?.height).toBe(56)
  expect((await rows.nth(1).boundingBox())?.height).toBe(50)
})

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
