import type { Page } from '@playwright/test'
import {
  expect,
  expectScreenshot,
  SEED_ITEMS,
  SEED_LISTS,
  test,
} from './fixtures'

const LIST_ID = SEED_LISTS[0].id
const ITEM_CAFE = SEED_ITEMS[LIST_ID][1] // no price, one store, unpurchased
const ITEM_LECHE = SEED_ITEMS[LIST_ID][0] // has a price already, unpurchased
const ITEM_MANTEQUILLA = SEED_ITEMS[LIST_ID][2] // closed-trip record, no price
const ITEM_HUEVOS = SEED_ITEMS[LIST_ID][3] // closed-trip record, already priced

function itemCard(page: Page, name: string) {
  return page.locator('.item-card').filter({ hasText: name })
}

async function gotoList(page: Page) {
  await page.goto(`/lists/${LIST_ID}`)
  await expect(page.getByText(ITEM_CAFE.name)).toBeVisible()
}

async function markPurchased(page: Page, name: string) {
  await itemCard(page, name)
    .getByRole('checkbox', { name: 'Marcar como comprado' })
    .click()
  await expect(
    itemCard(page, name).getByRole('checkbox', {
      name: 'Marcar como no comprado',
    }),
  ).toBeVisible()
}

const THEMES = [
  { name: 'light', colorScheme: 'light' as const },
  { name: 'dark', colorScheme: 'dark' as const },
]

/**
 * Marking an item purchased stamps it with the browser's clock, and the card
 * then prints that date. Left on the real clock, every screenshot here says
 * whatever today happens to be, so the committed baselines describe the day
 * they were written and drift a little further apart every day after. Pin it,
 * and the date becomes part of the fixture like any other seeded value.
 *
 * The day is the one the committed baselines already depict, so pinning cost
 * no regeneration. The zone is no longer a variable either — the config pins it
 * — so only the clock needs pinning per spec. Midday is still the value to
 * choose: it leaves the rendered day the same distance from either boundary, so
 * the fixture survives a change of pinned zone. Purchases are still stamped
 * "now", so the same-day price-deletion guard sees exactly what it did before.
 */
const FIXED_NOW = new Date('2026-07-15T10:00:00Z')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW)
  // The notification priming card appears on the list screen only once the
  // member list has loaded, and nothing here waits for that. A screenshot can
  // therefore catch the screen either before or after the card pushes 117px of
  // content down, and toHaveScreenshot settles for the first frame that matches
  // its baseline — so whichever state got committed keeps passing while the
  // other one is what the user ends up seeing. This spec is about purchase
  // state, not about that card, so take it out of the picture. smoke.spec.ts
  // and receipt-scanning.spec.ts still cover it.
  await page.addInitScript(() =>
    localStorage.setItem('push-priming-dismissed', '1'),
  )
})

for (const { name: themeName, colorScheme } of THEMES) {
  test.describe(`${themeName} mode`, () => {
    test.use({ colorScheme })

    test('marking an item purchased moves it to a read-only state', async ({
      page,
    }) => {
      await gotoList(page)
      await markPurchased(page, ITEM_CAFE.name)

      const card = itemCard(page, ITEM_CAFE.name)
      // A fresh purchase sits in the cart (trip still open). The state reads
      // from the circle and the voice — no strikethrough anywhere (DESIGN.md).
      await expect(card).toHaveClass(/item-card--cart/)
      await expectScreenshot(page, `item-purchased-${themeName}.png`)

      // Read-only: the brand is plain text in the meta line, not its own
      // editable control. `exact` matters — the row body is itself a button
      // (it opens the action sheet) and its accessible name contains the
      // brand, so a substring match would find it; what must not exist is a
      // control whose whole name is the brand, i.e. the old brand chip.
      await expect(
        card.getByRole('button', { name: ITEM_CAFE.brand ?? '', exact: true }),
      ).toHaveCount(0)
      await expect(card.locator('.item-card__meta')).toContainText(
        ITEM_CAFE.brand ?? '',
      )

      // Row tap offers "buy again" instead of rename
      await card.locator('.item-card__body').click()
      await expect(page.getByRole('button', { name: 'Renombrar' })).toHaveCount(
        0,
      )
      await expect(
        page.getByRole('button', { name: 'Comprar de nuevo' }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
    })

    test('records a price on a closed-trip record; the affordance is absent before the trip closes', async ({
      page,
    }) => {
      await gotoList(page)

      const actionSheet = page.getByRole('dialog', {
        name: 'Opciones del producto',
      })

      // Prices belong to closed-trip records only. A pending row offers no
      // price entry — row tap opens the action sheet without one.
      await itemCard(page, ITEM_LECHE.name).locator('.item-card__body').click()
      await expect(actionSheet).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Registrar precio' }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Historial de precios' }),
      ).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(actionSheet).toBeHidden()

      // Nor does an in-cart row (purchased, trip still open) — the figure
      // would not be a confirmed record yet.
      await markPurchased(page, ITEM_CAFE.name)
      await itemCard(page, ITEM_CAFE.name).locator('.item-card__body').click()
      await expect(actionSheet).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Registrar precio' }),
      ).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(actionSheet).toBeHidden()

      // A closed-trip record does: row tap → Registrar precio → history →
      // log the price. It has none yet, so the sheet offers to set one.
      await itemCard(page, ITEM_MANTEQUILLA.name)
        .locator('.item-card__body')
        .click()
      await page.getByRole('button', { name: 'Registrar precio' }).click()
      await page
        .locator('.phs')
        .getByRole('button', { name: '+ Registrar precio' })
        .click()

      const sheet = page.locator('.lps')
      await expect(sheet).toBeVisible()
      await sheet.locator('.lps__qty-input').fill('2')
      await sheet.locator('.lps__input').fill('3.50')
      await sheet.getByRole('button', { name: 'Mercadona' }).click()
      await expectScreenshot(page, `log-purchase-sheet-${themeName}.png`)
      await sheet.getByRole('button', { name: 'Guardar' }).click()

      await expect(sheet).toBeHidden()
      await expect(
        itemCard(page, ITEM_MANTEQUILLA.name).locator('.item-card__amount'),
      ).toBeVisible()
    })

    test('a closed-trip record offers no price deletion — its spend is settled', async ({
      page,
    }) => {
      // The trip-boundary rule at the UI layer: once a trip has torn off, the
      // price it recorded is permanent history. The record can still be
      // corrected upward (Actualizar precio stays), but the sheet offers no
      // «Eliminar precio» — deleting spend nobody can re-date is what the rule
      // forbids. This is the same guard the backend enforces with a 422; here
      // the control never appears, so the request is never made.
      await gotoList(page)

      await itemCard(page, ITEM_HUEVOS.name).locator('.item-card__body').click()
      await page.getByRole('button', { name: 'Registrar precio' }).click()
      await page
        .locator('.phs')
        .getByRole('button', { name: 'Actualizar precio' })
        .click()

      const sheet = page.locator('.lps')
      await expect(sheet).toBeVisible()
      // Correcting the price is still on offer…
      await expect(sheet.getByRole('button', { name: 'Guardar' })).toBeVisible()
      // …but deletion is not, because the trip has closed.
      await expect(
        sheet.getByRole('button', { name: 'Eliminar precio' }),
      ).toHaveCount(0)
    })
  })
}
