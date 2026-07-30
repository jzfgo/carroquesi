import type { Page } from '@playwright/test'
import {
  expect,
  expectScreenshot,
  SEED_ITEMS,
  SEED_LISTS,
  test,
} from './fixtures'

const LIST_ID = SEED_LISTS[0].id
const ITEM_LECHE = SEED_ITEMS[LIST_ID][0]
const ITEM_CAFE = SEED_ITEMS[LIST_ID][1]

/** Pinned because both the ticket header and the close sheet print a date.
 *  Left to the machine clock, the committed baseline would depict whatever day
 *  it was generated on and start disagreeing with the runner the next morning.
 */
const FIXED_NOW = new Date('2026-07-15T10:00:00Z')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW)
})

function itemCard(page: Page, name: string) {
  return page.locator('.item-card').filter({ hasText: name })
}

async function gotoList(page: Page) {
  await page.goto(`/lists/${LIST_ID}`)
  await expect(page.getByText(ITEM_CAFE.name)).toBeVisible()
}

async function putInCart(page: Page, name: string) {
  await itemCard(page, name)
    .getByRole('checkbox', { name: 'Poner en el carro' })
    .click()
  await expect(
    itemCard(page, name).getByRole('checkbox', { name: 'Sacar del carro' }),
  ).toBeVisible()
}

/** The one shop this list has bought from before, so the one pill it offers. */
const SUGGESTED_STORE = 'Mercadona'

/** Every query below is scoped to the sheet. The screen behind it carries a
 *  filter chip per shop and a "Tienda" control on the input bar, so an
 *  unscoped name match finds the wrong control rather than failing. */
const sheet = (page: Page) => page.locator('.cts')

async function openCloseSheet(page: Page) {
  await page.locator('.stamp-row').click()
  await expect(
    sheet(page).getByText('Total de lo que has puesto'),
  ).toBeVisible()
}

/** Open the sheet from the cart's own stamp and tap the shop it offers. */
async function closeTrip(page: Page) {
  await openCloseSheet(page)
  await sheet(page).getByRole('button', { name: SUGGESTED_STORE }).click()
  await sheet(page).getByRole('button', { name: 'Guardar compra' }).click()
}

test('closing a trip names the shop on its ticket', async ({ page }) => {
  await gotoList(page)
  await putInCart(page, ITEM_LECHE.name)

  await closeTrip(page)

  // The sheet goes away and the group becomes a filed ticket, headed by the
  // shop it was bought at. Before this phase nothing in the E2E suite ever
  // reached purchase_filed: true.
  await expect(sheet(page)).toBeHidden()
  await expect(page.locator('.item-list__label-text')).toContainText(
    SUGGESTED_STORE,
  )
  await expectScreenshot(page, 'trip-filed.png')
})

test('a filed line is read-only, and its price cannot be deleted', async ({
  page,
}) => {
  await gotoList(page)
  await putInCart(page, ITEM_LECHE.name)
  await closeTrip(page)

  await expect(page.locator('.item-list__label-text')).toContainText(
    SUGGESTED_STORE,
  )
  await itemCard(page, ITEM_LECHE.name).click()

  // The trip is closed, so the price is part of a ticket someone confirmed.
  await expect(
    page.getByRole('button', { name: /Eliminar precio/i }),
  ).toHaveCount(0)
})

test('an unticked row is left off the ticket entirely', async ({ page }) => {
  await gotoList(page)
  await putInCart(page, ITEM_LECHE.name)
  await putInCart(page, ITEM_CAFE.name)

  await openCloseSheet(page)
  await sheet(page)
    .getByRole('checkbox', { name: ITEM_CAFE.name })
    .uncheck({ force: true })
  // A shop this list has never bought from, typed rather than tapped — the
  // other half of the pill row, and the only path a first-time household has.
  await sheet(page).getByRole('button', { name: '+ otra' }).click()
  await sheet(page).getByLabel('Tienda').fill('Lidl')

  // Asserted on the request rather than on the screen afterwards: what an
  // unticked row must not do is reach the server, and that is a fact about
  // the payload. One evening with two shops becomes two tickets precisely
  // because this one carries only what was ticked.
  const posted = page.waitForRequest(
    (r) => r.url().includes('/purchases/close') && r.method() === 'POST',
  )
  await sheet(page).getByRole('button', { name: 'Guardar compra' }).click()
  const body = (await posted).postDataJSON() as {
    store: string
    lines: { item_id: string }[]
  }

  expect(body.store).toBe('Lidl')
  expect(body.lines).toHaveLength(1)
  expect(body.lines[0].item_id).toBe(ITEM_LECHE.id)
})
