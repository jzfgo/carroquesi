import type { Page } from '@playwright/test'
import {
  expect,
  expectScreenshot,
  SEED_ITEMS,
  SEED_LISTS,
  test,
} from './fixtures'

// These specs typecheck without the DOM lib on purpose: they run in Node, and
// browser globals exist only inside an `evaluate` callback, which is shipped to
// the page as source. Declaring the one global we call there keeps that split —
// widening the lib would let a spec reach for `document` at the Node layer and
// only find out at run time.
declare function getComputedStyle(el: unknown): {
  color: string
  backgroundColor: string
  opacity: string
}

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
 *  one tap in, on the item itself. The history is a block of that sheet rather
 *  than a sheet of its own, so opening the item is the whole journey. */
async function openPrice(page: Page, name: string) {
  await itemCard(page, name).locator('.item-card__open').click()
  await page
    .locator('.item-detail')
    .getByRole('button', { name: 'Registrar un precio' })
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
      // Marked today, so it is in the cart: picked up, but the trip is not over
      // and it has not torn off into a purchase yet.
      await expect(card).toHaveClass(/item-card--cart/)

      // The modifier above does not prove the cart reads as one: it can be
      // present with the rules that style it gone. The screenshot below is the
      // only other witness and it cannot carry this alone — an affordance this
      // size costs about 75 pixels, inside the tolerance the suite allows, so
      // it can leave the screen with every baseline still green. Assert the
      // computed values, which are what produce the pixels. Both are read as
      // relations rather than fixed colours, because the two themes resolve the
      // tokens differently and this test runs under both.
      //
      const todo = itemCard(page, ITEM_LECHE.name)

      // The filled disc is what says "picked up" from across the room. Two
      // things have to hold and neither follows from the other: it is filled at
      // all, which a lost rule breaks, and what fills it is not the paper it
      // sits on, which a bad token leaves "filled" and invisible.
      const cartDisc = await card
        .locator('.item-card__checkbox')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
      const paper = await page
        .locator('.item-list__sheet')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(cartDisc).not.toBe('rgba(0, 0, 0, 0)')
      expect(cartDisc).not.toBe(paper)

      // And the ink drops a rung, so a line in the cart reads quieter than one
      // still to buy. Here the comparison is what bites — on its own a name
      // always has some colour, whatever rule did or did not apply — and a
      // relation also spares this a fixed value per theme.
      const cartInk = await card
        .locator('.item-card__name')
        .evaluate((el) => getComputedStyle(el).color)
      const todoInk = await todo
        .locator('.item-card__name')
        .evaluate((el) => getComputedStyle(el).color)
      expect(cartInk).not.toBe(todoInk)
      await expectScreenshot(page, `item-purchased-${themeName}.png`)

      // No chips — the shop, the price and everything you can do to the line
      // live in the item. The brand is not a chip: it is the second line,
      // under the name, because it is what you are looking for on the shelf.
      await expect(card.locator('.item-card__tag')).toHaveCount(0)
      await expect(card.locator('.item-card__sub')).toHaveText(
        ITEM_CAFE.brand ?? '',
      )

      // Opening the item: it offers "buy again" instead of rename.
      await card.locator('.item-card__open').click()
      await expect(
        page.getByText(ITEM_CAFE.brand ?? '', { exact: true }).first(),
      ).toBeVisible()
      // Bought, so the fields state themselves and no longer open an editor.
      await expect(page.getByRole('button', { name: /^Nombre/ })).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Volver a comprar' }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
    })

    test('the item sheet states its price, then opens a shop where it stands', async ({
      page,
    }) => {
      await gotoList(page)
      await itemCard(page, ITEM_LECHE.name).locator('.item-card__open').click()

      const sheet = page.locator('.item-detail')
      await expect(sheet).toBeVisible()

      // The sheet sits on the bottom edge, so a fractional height gives it a
      // fractional top and every hairline inside it falls between two device
      // rows. Two machines then pick different rows, and one full-width rule
      // moving one row is 2560 pixels — ten times the whole budget, for a
      // screen that looks identical. This says so in one line instead.
      const top = await sheet.evaluate((el) => el.getBoundingClientRect().top)
      expect(top % 1).toBe(0)
      // The four blocks of 22a, in the order a sheet is opened for. By role,
      // because "Eliminar producto" also contains the word "Producto".
      for (const block of ['Último precio', 'Producto', 'Rastro']) {
        await expect(sheet.getByRole('heading', { name: block })).toBeVisible()
      }
      await expectScreenshot(page, `item-detail-${themeName}.png`)

      // 22b: the shop opens in place. The others neither move nor fade.
      // Scoped to the price block — the «Tiendas» field row names the shops too.
      const shops = sheet.locator('.phb')
      const alcampo = shops.getByRole('button', { name: /Alcampo/ })
      const mercadona = shops.getByRole('button', { name: /Mercadona/ })
      await expect(alcampo).toBeVisible()
      await mercadona.click()
      await expect(mercadona).toHaveAttribute('aria-expanded', 'true')
      await expect(alcampo).toBeVisible()

      // Rule 5 says the unopened shop is not dimmed. A screenshot cannot hold
      // this on its own: an opacity of 0.4 on one row is well inside the
      // tolerance the suite allows.
      const faded = await alcampo.evaluate((el) => getComputedStyle(el).opacity)
      expect(faded).toBe('1')

      // A converted amount says so, and a shop that wrote nothing down says
      // that too. Both are too small for the pixel budget to notice.
      await expect(sheet.getByText('sin precio')).toBeVisible()
      await expect(sheet.getByText(/≈/).first()).toBeVisible()
      await expectScreenshot(page, `price-history-open-${themeName}.png`)

      await page.keyboard.press('Escape')
    })

    test('logs a price for a purchased item via LogPurchaseSheet', async ({
      page,
    }) => {
      await gotoList(page)
      await markPurchased(page, ITEM_CAFE.name)

      await openPrice(page, ITEM_CAFE.name)

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

    test('price-deletion guard surfaces a 422 when the trip has already been filed', async ({
      page,
    }) => {
      await gotoList(page)
      await markPurchased(page, ITEM_LECHE.name)

      // Simulate the backend race: canDelete is true client-side (the trip is
      // still open as far as this page knows), but the server rejects the
      // deletion because the trip was closed — by hand, or by tearing off —
      // between render and this request.
      await page.route(
        `**/lists/${LIST_ID}/items/${ITEM_LECHE.id}/prices`,
        async (route) => {
          if (route.request().method() === 'DELETE') {
            return route.fulfill({
              status: 422,
              contentType: 'application/json',
              body: JSON.stringify({
                detail:
                  'Cannot delete the price of a purchase that has already been filed',
              }),
            })
          }
          return route.fallback()
        },
      )

      await openPrice(page, ITEM_LECHE.name)
      const sheet = page.locator('.lps')
      await sheet.getByRole('button', { name: 'Eliminar precio' }).click()

      await expect(page.getByRole('alert')).toContainText(
        'No se puede eliminar el precio de una compra ya archivada',
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
