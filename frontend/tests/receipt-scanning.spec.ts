import type { Page } from '@playwright/test'
import path from 'node:path'
import {
  ALICE,
  awaitPrimingCard,
  expect,
  expectScreenshot,
  GEMINI_ENDPOINT_PATTERN,
  mockGeminiReceiptParse,
  SEED_ITEMS,
  SEED_LISTS,
  SEED_RECEIPT_RESULT,
  test,
} from './fixtures'

const LIST_ID = SEED_LISTS[0].id
const ITEM_CAFE = SEED_ITEMS[LIST_ID][1]
const ITEM_LECHE = SEED_ITEMS[LIST_ID][0]

// receiptAi.ts only ever ships the file to the (mocked) Gemini endpoint, so
// any small valid image works — the mock never inspects its bytes.
const RECEIPT_IMAGE = path.join(
  import.meta.dirname,
  '../public/transparent.png',
)

const PARSED_RECEIPT = {
  store: 'Mercadona',
  receipt_date: '2026-07-10',
  receipt_total: 4.35,
  lines: [
    {
      name: 'Leche Hacendado',
      price_type: 'UNIT' as const,
      unit_price: 0.75,
      quantity: null,
      line_total: 0.75,
    },
    {
      name: 'Cafe molido Nescafe',
      price_type: 'UNIT' as const,
      unit_price: 2.6,
      quantity: null,
      line_total: 2.6,
    },
    {
      name: 'Pan integral',
      price_type: 'UNIT' as const,
      unit_price: 1.0,
      quantity: null,
      line_total: 1.0,
    },
  ],
}

// An unreadable ticket: the parse rescues store/date/total but reads no lines,
// which is the 18c illegible threshold.
const ILLEGIBLE_RECEIPT = {
  store: 'Carrefour',
  receipt_date: '2026-07-10',
  receipt_total: 41.6,
  lines: [],
}

function itemCard(page: Page, name: string) {
  return page.locator('.item-card').filter({ hasText: name })
}

// A record inside an expanded trip in the stack — where settled, closed-trip
// purchases live, rather than the pending list.
function stackRecord(page: Page, name: string) {
  return page
    .locator('.stack .trip-card__lines')
    .locator('.item-card')
    .filter({ hasText: name })
}

// The receipt sheet keeps the `rss` class across both sub-views (list ⇄
// resolve), so this stays valid even while the resolve body is showing —
// unlike a filter on a body-specific element.
function reviewSheet(page: Page) {
  return page.locator('.modal-sheet.rss')
}

function receiptRow(page: Page, receiptName: string) {
  return page.locator('.rss-row').filter({ hasText: receiptName })
}

async function gotoList(page: Page) {
  await page.goto(`/lists/${LIST_ID}`)
  await expect(page.getByText(ITEM_CAFE.name)).toBeVisible()
  await awaitPrimingCard(page)
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

async function uploadReceipt(page: Page) {
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page
    .locator('.list-action-sheet')
    .getByRole('button', { name: 'Escanear ticket' })
    .click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Elegir de galería' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(RECEIPT_IMAGE)
}

const THEMES = [
  { name: 'light', colorScheme: 'light' as const },
  { name: 'dark', colorScheme: 'dark' as const },
]

// The clock is pinned so the created-item stack test (below) reads a purchase
// dated the day before "today", which is what yields the re-buy control the
// impulse assertion depends on.
const FIXED_NOW = new Date('2026-07-12T10:00:00Z')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW)
})

for (const { name: themeName, colorScheme } of THEMES) {
  test.describe(`${themeName} mode`, () => {
    test.use({ colorScheme })

    test('reviews the ticket as one list, solid matched and dashed unmatched, then applies prices', async ({
      page,
    }) => {
      await gotoList(page)
      await markPurchased(page, ITEM_LECHE.name)
      await markPurchased(page, ITEM_CAFE.name)
      await mockGeminiReceiptParse(page, PARSED_RECEIPT)

      await uploadReceipt(page)

      const sheet = reviewSheet(page)
      await expect(sheet).toBeVisible()
      await expect(page.locator('.rss-row')).toHaveCount(3)

      // Matched lines are confirmed — solid ink, checked by default.
      const lecheRow = receiptRow(page, 'LECHE HACENDADO')
      await expect(lecheRow.locator('.rss-annot--solid')).toContainText(
        ITEM_LECHE.name,
      )
      await expect(lecheRow.locator('.rss-row__check')).toBeChecked()

      // The unmatched line is the dashed "Asignar producto" CTA — still checked,
      // which is what keeps the save button disabled until it is named.
      const panRow = receiptRow(page, 'PAN INTEGRAL')
      await expect(panRow.locator('.rss-annot--dashed')).toHaveText(
        'Asignar producto',
      )
      await expect(panRow.locator('.rss-row__check')).toBeChecked()

      // 0,75 + 2,60 + 1,00 = 4,35 = the paper total → the cuadre is green.
      await expect(sheet.getByText('Total', { exact: true })).toBeVisible()
      const save = sheet.getByRole('button', { name: /Guardar compra/ })
      await expect(save).toBeDisabled()

      await expectScreenshot(page, `receipt-scan-sheet-${themeName}.png`)

      // Drop the unnamed line and the two matched prices apply.
      await panRow.locator('.rss-row__check').click()
      await expect(save).toBeEnabled()
      await save.click()

      await expect(sheet).toBeHidden()
      await expect(page.getByRole('alert')).toContainText(
        '2 precios actualizados',
      )
    })

    test('an unreadable ticket offers the 18c partial save', async ({
      page,
    }) => {
      await gotoList(page)
      await mockGeminiReceiptParse(page, ILLEGIBLE_RECEIPT)

      await uploadReceipt(page)

      // A zero-line parse routes to the illegible sheet, not the review sheet.
      const sheet = page.locator('.modal-sheet.rill')
      await expect(sheet).toBeVisible()
      await expect(reviewSheet(page)).toBeHidden()
      await expect(sheet.locator('.rill-head__title')).toHaveText(
        'No se lee el ticket',
      )
      // The rescued store and total are seeded and editable.
      await expect(
        sheet.getByRole('button', { name: /Carrefour/ }),
      ).toBeVisible()
      await expect(sheet.getByRole('button', { name: /41,60/ })).toBeVisible()

      await expectScreenshot(page, `receipt-illegible-${themeName}.png`)
    })
  })
}

// None of the tests below assert anything theme-dependent (no expectScreenshot),
// so they run once rather than once per THEMES entry.
test.describe('functional', () => {
  test('deselecting a matched line excludes it from the applied price patch', async ({
    page,
  }) => {
    await gotoList(page)
    await markPurchased(page, ITEM_LECHE.name)
    await markPurchased(page, ITEM_CAFE.name)
    await mockGeminiReceiptParse(page, PARSED_RECEIPT)

    await uploadReceipt(page)
    const sheet = reviewSheet(page)
    await expect(sheet).toBeVisible()

    // Uncheck the matched leche line, and the unmatched pan line so the unnamed
    // line stops blocking save. Only cafe is left to apply.
    await receiptRow(page, 'LECHE HACENDADO').locator('.rss-row__check').click()
    await receiptRow(page, 'PAN INTEGRAL').locator('.rss-row__check').click()

    const save = sheet.getByRole('button', { name: /Guardar compra/ })
    await expect(save).toBeEnabled()

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/lists/${LIST_ID}/receipt-prices`) &&
        resp.status() === 200,
    )
    await save.click()
    const response = await responsePromise
    await expect(sheet).toBeHidden()

    const body = response.request().postDataJSON() as {
      patches: { item_id: string }[]
    }
    expect(body.patches).toHaveLength(1)
    expect(body.patches[0].item_id).toBe(ITEM_CAFE.id)
  })

  // The impulse-buy path: a receipt line that matches nothing becomes a new
  // item that is already purchased. Resolution now happens in the 13b sub-view.
  test('an unmatched line can be created as an already-purchased item', async ({
    page,
  }) => {
    await gotoList(page)
    await markPurchased(page, ITEM_LECHE.name)
    await markPurchased(page, ITEM_CAFE.name)
    await mockGeminiReceiptParse(page, PARSED_RECEIPT)

    await uploadReceipt(page)
    const sheet = reviewSheet(page)
    await expect(sheet).toBeVisible()

    // Tap the unmatched row → the resolve sub-view (same sheet). Name it via the
    // smart create-bar; the brand rides in on the sigil grammar.
    await receiptRow(page, 'PAN INTEGRAL').locator('.rss-row__open').click()
    await expect(sheet.getByText('Línea del ticket')).toBeVisible()
    await sheet
      .getByPlaceholder(/Nombre del producto/)
      .fill('Pan integral #Bimbo')
    await sheet.getByRole('button', { name: 'Asignar' }).click()

    // Back on the list, the line is now solid with its assigned name.
    await expect(
      receiptRow(page, 'PAN INTEGRAL').locator('.rss-annot--solid'),
    ).toContainText('Pan integral')

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/lists/${LIST_ID}/receipt-prices`) &&
        resp.status() === 200,
    )
    await sheet.getByRole('button', { name: /Guardar compra/ }).click()
    const response = await responsePromise
    await expect(sheet).toBeHidden()

    const body = response.request().postDataJSON() as {
      new_items: { name: string; brand: string | null; price: number }[]
    }
    expect(body.new_items).toHaveLength(1)
    expect(body.new_items[0]).toMatchObject({
      name: 'Pan integral',
      brand: 'Bimbo',
      price: 1.0,
    })

    // The created record is a settled purchase on a closed trip, so it lands in
    // the trip stack, not the pending list — and the stack is a separate read
    // that a receipt apply does not refresh in place. Surface that trip and
    // reload, then the record reads back exactly as the API returns it.
    await page.route(/\/purchases(\?|$)/, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          purchases: [
            {
              id: 'trip-receipt-0710',
              list_id: LIST_ID,
              opened_at: '2026-07-10T00:00:00',
              tears_off_at: '2026-07-11T00:00:00',
              closed_at: '2026-07-11T00:00:00',
              store: 'Mercadona',
              total: 1.0,
              line_count: 1,
              has_receipt: true,
              items_total: 1.0,
            },
          ],
          total: 1,
        }),
      }),
    )
    await page.route(/\/purchases\/[^/]+\/items(\?|$)/, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'created-pan-integral',
            list_id: LIST_ID,
            name: 'Pan integral',
            quantity: null,
            purchased_quantity: '1',
            brand: 'Bimbo',
            stores: ['Mercadona'],
            purchased: true,
            purchased_at: '2026-07-10T00:00:00',
            purchase_id: 'trip-receipt-0710',
            purchase_ends_at: '2026-07-11T00:00:00',
            ean: null,
            price: 1.0,
            price_per: null,
            price_store: 'Mercadona',
            added_by: 'seed-user-alice',
            created_at: '2026-07-10T00:00:00',
            updated_at: '2026-07-10T00:00:00',
          },
        ]),
      }),
    )
    await page.goto(`/lists/${LIST_ID}`)

    // It comes back already purchased, carrying the sigil brand and the
    // receipt's price; being a day before the pinned clock, the check yields
    // its slot to the re-buy control.
    const created = stackRecord(page, 'Pan integral')
    await expect(created).toBeVisible()
    await expect(
      created.getByRole('button', { name: 'Volver a comprar' }),
    ).toBeVisible()
    await expect(created.locator('.item-card__meta')).toContainText('Bimbo')
    // formatPrice() uses Intl with the *browser's* locale and the config pins
    // none, so the decimal separator differs between a local run and CI's
    // container. Match either rather than baking in one environment's output.
    await expect(created.locator('.item-card__amount')).toContainText(/1[.,]00/)
  })

  // JAV-182: an unreadable ticket still stores its capture — a lineless scan
  // is written before the 18c sheet opens, and the save hands that scan to
  // the manual record so the purchase carries its paper from day one.
  test('an illegible save hands the stored capture to the manual record', async ({
    page,
  }) => {
    await gotoList(page)
    await mockGeminiReceiptParse(page, ILLEGIBLE_RECEIPT)

    const scanPromise = page.waitForResponse(
      (resp) =>
        resp.url().endsWith(`/lists/${LIST_ID}/receipt`) &&
        resp.request().method() === 'POST',
    )
    await uploadReceipt(page)

    const sheet = page.locator('.modal-sheet.rill')
    await expect(sheet).toBeVisible()
    // The capture found a home before the sheet opened, and the sheet says so.
    await expect(sheet.locator('.rill-head__sub')).toHaveText(
      'Se distinguen la tienda y el total; la foto se guarda con la compra',
    )

    const scanResponse = await scanPromise
    const scanBody = scanResponse.request().postDataJSON() as {
      lines: unknown[]
    }
    expect(scanBody.lines).toEqual([])
    const { scan_id } = (await scanResponse.json()) as { scan_id: string }

    const savePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/purchases/manual') && resp.status() === 200,
    )
    await sheet
      .getByRole('button', { name: 'Guardar solo la tienda y el total' })
      .click()
    const saveResponse = await savePromise
    const saveBody = saveResponse.request().postDataJSON() as {
      scan_id: string | null
    }
    expect(saveBody.scan_id).toBe(scan_id)
    await expect(page.getByRole('alert')).toContainText('Compra guardada')
  })

  // The save guard: a store AND a date, deliberately stricter than the 13a
  // handoff caption. Neither alone unlocks the button; both are entered
  // through the header pills when the parse read none.
  test('saving requires both a date and a store, entered via the header pills', async ({
    page,
  }) => {
    await gotoList(page)
    await mockGeminiReceiptParse(page, {
      ...PARSED_RECEIPT,
      store: null,
      receipt_date: null,
    })
    // The match step echoes what the parse read: no store, no date.
    await page.route(new RegExp(`/lists/${LIST_ID}/receipt$`), (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...SEED_RECEIPT_RESULT,
          store: null,
          receipt_date: null,
        }),
      }),
    )

    await uploadReceipt(page)
    const sheet = reviewSheet(page)
    await expect(sheet).toBeVisible()

    // Both pills open empty, and the unnamed pan line is dropped so only the
    // date+store guard holds the button.
    await expect(
      sheet.getByRole('button', { name: 'Poner tienda' }),
    ).toBeVisible()
    await expect(
      sheet.getByRole('button', { name: 'Poner fecha' }),
    ).toBeVisible()
    await receiptRow(page, 'PAN INTEGRAL').locator('.rss-row__check').click()

    const save = sheet.getByRole('button', { name: /Guardar compra/ })
    await expect(save).toBeDisabled()

    // A date alone is not enough.
    await sheet.getByRole('button', { name: 'Poner fecha' }).click()
    await sheet.locator('input[type="date"]').fill('2026-07-10')
    await expect(save).toBeDisabled()

    // The store completes the pair.
    await sheet.getByRole('button', { name: 'Poner tienda' }).click()
    await sheet.getByPlaceholder('Nombre de la tienda').fill('Mercadona')
    await sheet.getByRole('button', { name: 'Listo' }).click()
    await expect(save).toBeEnabled()

    // A store alone is not enough either: clearing the date locks the save
    // again, so each half of the pair carries the guard. The date pill now
    // prints the date itself, so it is reached by position, not label.
    await sheet.locator('button.rss-pill').nth(1).click()
    await sheet.locator('input[type="date"]').fill('')
    await expect(save).toBeDisabled()

    // Re-entering the date restores the pair.
    await sheet.getByRole('button', { name: 'Poner fecha' }).click()
    await sheet.locator('input[type="date"]').fill('2026-07-10')
    await expect(save).toBeEnabled()

    // And the entered pair is what the apply carries.
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/lists/${LIST_ID}/receipt-prices`) &&
        resp.status() === 200,
    )
    await save.click()
    const response = await responsePromise
    await expect(sheet).toBeHidden()

    const body = response.request().postDataJSON() as {
      receipt_date: string | null
      store: string | null
    }
    expect(body.receipt_date).toBe('2026-07-10')
    expect(body.store).toBe('Mercadona')
  })

  // The other resolve-sheet outcome: instead of creating a new product, the
  // line is linked to an item still pending on the list, completing that
  // record rather than adding one.
  test('an unmatched line can be linked to a pending item in the resolve sub-view', async ({
    page,
  }) => {
    await gotoList(page)
    await mockGeminiReceiptParse(page, PARSED_RECEIPT)
    // A match result that leaves Leche unlinked, so it shows up as a
    // candidate in the resolve list.
    await page.route(new RegExp(`/lists/${LIST_ID}/receipt$`), (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...SEED_RECEIPT_RESULT,
          matched: [SEED_RECEIPT_RESULT.matched[1]],
        }),
      }),
    )

    await uploadReceipt(page)
    const sheet = reviewSheet(page)
    await expect(sheet).toBeVisible()
    await expect(page.locator('.rss-row')).toHaveCount(2)

    // Open the unmatched row → the still-pending Leche is offered as a link
    // target, named with its pending state and store.
    await receiptRow(page, 'PAN INTEGRAL').locator('.rss-row__open').click()
    await expect(sheet.getByText('Línea del ticket')).toBeVisible()
    const radio = sheet.getByRole('radio', { name: /Leche Hacendado/ })
    await expect(radio).toContainText('pendiente · Mercadona')
    await radio.click()
    await sheet.getByRole('button', { name: 'Asignar' }).click()

    // Back on the list, the line is solid with the linked item's name.
    await expect(
      receiptRow(page, 'PAN INTEGRAL').locator('.rss-annot--solid'),
    ).toContainText('Leche Hacendado')

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/lists/${LIST_ID}/receipt-prices`) &&
        resp.status() === 200,
    )
    await sheet.getByRole('button', { name: /Guardar compra/ }).click()
    const response = await responsePromise
    await expect(sheet).toBeHidden()

    // The linked line patches the existing item with the receipt's price;
    // nothing is created.
    const body = response.request().postDataJSON() as {
      patches: { item_id: string; price: number }[]
      new_items: unknown[]
    }
    expect(body.new_items).toHaveLength(0)
    expect(body.patches).toHaveLength(2)
    const lechePatch = body.patches.find((p) => p.item_id === ITEM_LECHE.id)
    expect(lechePatch).toMatchObject({ price: 1.0 })
  })

  test('a first scan asks for consent, and granting flows straight into the scan', async ({
    page,
  }) => {
    // An account that has never been asked: the shared mock's granted ALICE is
    // overridden before the app boots.
    const undecided = { ...ALICE, receipt_consent: null }
    await page.route('**/users/me', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(undecided),
      }),
    )
    await page.route('**/auth/sync', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(undecided),
      }),
    )
    await gotoList(page)
    await mockGeminiReceiptParse(page, PARSED_RECEIPT)

    // The scan entry opens the disclosure, not the source picker.
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page
      .locator('.list-action-sheet')
      .getByRole('button', { name: 'Escanear ticket' })
      .click()
    const consent = page.locator('.modal-sheet.receipt-consent-sheet')
    await expect(consent).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Elegir de galería' }),
    ).toHaveCount(0)

    // Granting records the decision, and only then continues into the picker.
    const putPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/users/me/receipt-consent') &&
        resp.request().method() === 'PUT',
    )
    await consent.getByRole('button', { name: 'Activar escaneo' }).click()
    const put = await putPromise
    expect(put.request().postDataJSON()).toEqual({ consent: 'granted' })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Elegir de galería' }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(RECEIPT_IMAGE)

    // The scan proceeds with no second ask.
    await expect(reviewSheet(page)).toBeVisible()
  })

  test('declining consent records the decision and never opens the scan', async ({
    page,
  }) => {
    const undecided = { ...ALICE, receipt_consent: null }
    await page.route('**/users/me', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(undecided),
      }),
    )
    await page.route('**/auth/sync', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(undecided),
      }),
    )
    await gotoList(page)

    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page
      .locator('.list-action-sheet')
      .getByRole('button', { name: 'Escanear ticket' })
      .click()
    const consent = page.locator('.modal-sheet.receipt-consent-sheet')
    await expect(consent).toBeVisible()

    const putPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/users/me/receipt-consent') &&
        resp.request().method() === 'PUT',
    )
    await consent.getByRole('button', { name: 'Ahora no' }).click()
    const put = await putPromise
    expect(put.request().postDataJSON()).toEqual({ consent: 'declined' })

    // The sheet closes and the flow stops there: no source picker.
    await expect(consent).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Elegir de galería' }),
    ).toHaveCount(0)
  })

  test('a failed AI parse surfaces an error toast without opening the review sheet', async ({
    page,
  }) => {
    await gotoList(page)
    await page.route(GEMINI_ENDPOINT_PATTERN, (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    )

    await uploadReceipt(page)

    await expect(page.getByRole('alert')).toContainText(
      'No se pudo leer el ticket',
    )
    await expect(page.locator('.rss-listhead')).toHaveCount(0)
  })
})
