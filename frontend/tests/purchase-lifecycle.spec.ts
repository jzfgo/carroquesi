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

function itemCard(page: Page, name: string) {
  return page.locator('.item-card').filter({ hasText: name })
}

async function gotoList(page: Page) {
  await page.goto(`/lists/${LIST_ID}`)
  await expect(page.getByText(ITEM_CAFE.name)).toBeVisible()
}

/** The row carries no price control any more — brand, shop and price all live
 *  one tap in, on the item itself. */
async function openPrice(page: Page, name: string) {
  await itemCard(page, name).locator('.item-card__open').click()
  await page
    .locator('.item-action-sheet')
    .getByRole('button', { name: /precio/i })
    .click()
}

async function markPurchased(page: Page, name: string) {
  await itemCard(page, name)
    .getByRole('checkbox', { name: 'Poner en el carro' })
    .click()
  await expect(
    itemCard(page, name).getByRole('checkbox', {
      name: 'Sacar del carro',
    }),
  ).toBeVisible()
}

const THEMES = [
  { name: 'light', colorScheme: 'light' as const },
  { name: 'dark', colorScheme: 'dark' as const },
]

for (const { name: themeName, colorScheme } of THEMES) {
  test.describe(`${themeName} mode`, () => {
    test.use({ colorScheme })

    test('marking an item purchased moves it to a read-only state', async ({
      page,
    }) => {
      await gotoList(page)
      await markPurchased(page, ITEM_CAFE.name)

      const card = itemCard(page, ITEM_CAFE.name)
      // Marked today, so it is in the cart: picked up, but the trip is not over
      // and it has not torn off into a purchase yet.
      await expect(card).toHaveClass(/item-card--cart/)
      await expectScreenshot(page, `item-purchased-${themeName}.png`)

      // The row carries no chips at all now — brand and shop live in the item.
      await expect(card.locator('.item-card__tag')).toHaveCount(0)
      await expect(
        card.getByText(ITEM_CAFE.brand ?? '', { exact: true }),
      ).toHaveCount(0)

      // Opening the item: it offers "buy again" instead of rename, and says
      // the brand the row stopped carrying.
      await card.locator('.item-card__open').click()
      await expect(
        page.getByText(ITEM_CAFE.brand ?? '', { exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Renombrar' })).toHaveCount(
        0,
      )
      await expect(
        page.getByRole('button', { name: 'Comprar de nuevo' }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
    })

    test('logs a price for a purchased item via LogPurchaseSheet', async ({
      page,
    }) => {
      await gotoList(page)
      await markPurchased(page, ITEM_CAFE.name)

      await openPrice(page, ITEM_CAFE.name)
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
        itemCard(page, ITEM_CAFE.name).locator('.item-card__figure--amount'),
      ).toBeVisible()
    })

    test('same-day price-deletion guard surfaces a 422 from the backend', async ({
      page,
    }) => {
      await gotoList(page)
      await markPurchased(page, ITEM_LECHE.name)

      // Simulate the backend race: canDelete is true client-side (purchased
      // just now), but the server still rejects the deletion.
      await page.route(
        `**/lists/${LIST_ID}/items/${ITEM_LECHE.id}/prices`,
        async (route) => {
          if (route.request().method() === 'DELETE') {
            return route.fulfill({
              status: 422,
              contentType: 'application/json',
              body: JSON.stringify({
                detail:
                  'Cannot delete the price of an item purchased on a previous day',
              }),
            })
          }
          return route.fallback()
        },
      )

      await openPrice(page, ITEM_LECHE.name)
      await page
        .locator('.phs')
        .getByRole('button', { name: 'Actualizar precio' })
        .click()
      const sheet = page.locator('.lps')
      await sheet.getByRole('button', { name: 'Eliminar precio' }).click()

      await expect(page.getByRole('alert')).toContainText(
        'No se puede eliminar el precio de un artículo comprado en otro día',
      )
      await expectScreenshot(page, `price-delete-guard-${themeName}.png`)

      // Sheet stays open and the price is untouched
      await expect(sheet).toBeVisible()
      await expect(
        itemCard(page, ITEM_LECHE.name).locator('.item-card__figure--amount'),
      ).toBeVisible()
    })
  })
}
