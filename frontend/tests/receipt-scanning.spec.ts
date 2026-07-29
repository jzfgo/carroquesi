import type { Page } from '@playwright/test'
import path from 'node:path'
import {
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

// Mirrors the sentinel <option value> in ReceiptScanSheet, which is module-private.
// Selecting by value rather than by its "✚ Crear artículo nuevo" label keeps the
// test off a string that carries a decorative glyph.
const CREATE_OPTION = '__create__'

function itemCard(page: Page, name: string) {
  return page.locator('.item-card').filter({ hasText: name })
}

function receiptRow(page: Page, receiptName: string) {
  return page.locator('.rss-row').filter({ hasText: receiptName })
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

/**
 * The sheet asks the user to confirm a receipt date that falls outside the
 * match window (see lib/receiptDate.ts). PARSED_RECEIPT carries a fixed date,
 * so without a fixed clock that prompt would appear on its own as real-world
 * time moves on — silently changing the committed screenshots, and quietly
 * putting every other test in this file in front of a banner it was never
 * written for. Pin "now" inside the window so each test starts on the
 * ordinary path; the one test that wants the prompt moves the clock itself.
 */
const FIXED_NOW = new Date('2026-07-12T10:00:00Z')

// File-level, not per-test: the receipt fixture's date is what makes the
// prompt appear, and every test in this file uses it.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW)
})

for (const { name: themeName, colorScheme } of THEMES) {
  test.describe(`${themeName} mode`, () => {
    test.use({ colorScheme })

    test('scanning a receipt reviews matched and unmatched lines, then applies prices', async ({
      page,
    }) => {
      await gotoList(page)
      await markPurchased(page, ITEM_LECHE.name)
      await markPurchased(page, ITEM_CAFE.name)
      await mockGeminiReceiptParse(page, PARSED_RECEIPT)

      await uploadReceipt(page)

      const sheet = page
        .locator('.sheet')
        .filter({ has: page.locator('.rss-toolbar') })
      await expect(sheet).toBeVisible()
      await expect(page.locator('.rss-row')).toHaveCount(3)

      // Matched lines are pre-checked, the unmatched line is not
      await expect(sheet.locator('.rss-toolbar-count')).toHaveText(
        '2 de 3 seleccionados',
      )
      const unmatchedRow = receiptRow(page, 'PAN INTEGRAL')
      await expect(unmatchedRow.locator('.rss-item')).toHaveClass(/unlinked/)
      await expect(unmatchedRow.locator('.rss-item')).toHaveText('sin vincular')
      await expect(unmatchedRow.locator('.rss-check')).not.toBeChecked()

      const lecheRow = receiptRow(page, 'LECHE HACENDADO')
      await expect(lecheRow.locator('.rss-item')).toHaveText(ITEM_LECHE.name)
      await expect(lecheRow.locator('.rss-check')).toBeChecked()

      await expectScreenshot(page, `receipt-scan-sheet-${themeName}.png`)

      await sheet.getByRole('button', { name: 'Guardar precios' }).click()

      await expect(sheet).toBeHidden()
      await expect(page.getByRole('alert')).toContainText(
        '2 precios actualizados',
      )
    })
  })
}

// Neither test below asserts anything theme-dependent (no expectScreenshot
// call), so they run once instead of once per THEMES entry.
test.describe('functional', () => {
  test('deselecting a matched line excludes it from the applied price patch', async ({
    page,
  }) => {
    await gotoList(page)
    await markPurchased(page, ITEM_LECHE.name)
    await markPurchased(page, ITEM_CAFE.name)
    await mockGeminiReceiptParse(page, PARSED_RECEIPT)

    await uploadReceipt(page)
    const sheet = page
      .locator('.sheet')
      .filter({ has: page.locator('.rss-toolbar') })
    await expect(sheet).toBeVisible()

    const lecheRow = receiptRow(page, 'LECHE HACENDADO')
    await lecheRow.locator('.rss-check').click()

    await expect(sheet.locator('.rss-toolbar-count')).toHaveText(
      '1 de 3 seleccionados',
    )
    await expect(sheet.locator('.confirm-count')).toHaveText('1 elemento')

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/lists/${LIST_ID}/receipt-prices`) &&
        resp.status() === 200,
    )
    await sheet.getByRole('button', { name: 'Guardar precios' }).click()
    const response = await responsePromise
    await expect(sheet).toBeHidden()

    const body = response.request().postDataJSON() as {
      patches: { item_id: string }[]
    }
    expect(body.patches).toHaveLength(1)
    expect(body.patches[0].item_id).toBe(ITEM_CAFE.id)
  })

  // The impulse-buy path: a receipt line that matches nothing on the list
  // becomes a new item that is already purchased. Asserts the persisted card
  // rather than the toast — a toast-only check would still pass if the
  // new_items payload never reached the database.
  test('an unmatched line can be created as an already-purchased item', async ({
    page,
  }) => {
    await gotoList(page)
    await markPurchased(page, ITEM_LECHE.name)
    await markPurchased(page, ITEM_CAFE.name)
    await mockGeminiReceiptParse(page, PARSED_RECEIPT)

    await uploadReceipt(page)
    const sheet = page
      .locator('.sheet')
      .filter({ has: page.locator('.rss-toolbar') })
    await expect(sheet).toBeVisible()

    // Switching the unmatched line to "create" also selects it, so the row
    // needs no separate checkbox tick.
    const panRow = receiptRow(page, 'PAN INTEGRAL')
    // The per-row form is collapsed until the summary is tapped.
    await panRow.locator('.rss-summary').click()
    await expect(panRow).toHaveClass(/expanded/)
    await panRow.locator('.rss-link-select').selectOption(CREATE_OPTION)
    await expect(sheet.locator('.rss-toolbar-count')).toHaveText(
      '3 de 3 seleccionados',
    )

    // The brand rides in on the sigil grammar rather than a separate field.
    await panRow.locator('.rss-create-input').fill('Pan integral #Bimbo')

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/lists/${LIST_ID}/receipt-prices`) &&
        resp.status() === 200,
    )
    await sheet.getByRole('button', { name: 'Guardar precios' }).click()
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

    // The round trip that matters: it comes back from the API already
    // purchased, carrying the sigil brand and the receipt's price.
    const created = itemCard(page, 'Pan integral')
    await expect(created).toBeVisible()
    await expect(
      created.getByRole('checkbox', { name: 'Marcar como no comprado' }),
    ).toBeVisible()
    await expect(created.getByText('Bimbo', { exact: true })).toBeVisible()
    // formatPrice() uses Intl with the *browser's* locale and the config pins
    // none, so the decimal separator differs between a local run and CI's
    // container. Match either rather than baking in one environment's output.
    await expect(created.locator('.item-card__tag--price')).toContainText(
      /1[.,]00/,
    )
  })

  // The seam JAV-54 exists to close, end to end: a misread date empties the
  // backend's match window, so the sheet asks about it, and correcting it
  // re-runs the match. The API is mocked here (see installApiMocks), so this
  // proves the *wiring* — that the correction reaches a second POST carrying
  // the new date, and that its result replaces the first one on screen. That
  // the window itself is +-3 days is the backend's own test.
  test('correcting a flagged receipt date re-runs the match with the new date', async ({
    page,
  }) => {
    // The production scenario: the user shopped today and the AI misread the
    // date as 2026-07-10, so the window landed two weeks off. Overrides the
    // file-level clock, which deliberately sits inside the window.
    const TODAY = '2026-07-25'
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00Z`))

    const receiptDatesSent: (string | null)[] = []
    // Registered after installApiMocks, so it wins: Playwright resolves routes
    // most-recently-registered first.
    await page.route(
      (url) => url.pathname.endsWith('/receipt'),
      async (route) => {
        const body = route.request().postDataJSON() as {
          receipt_date: string | null
        }
        receiptDatesSent.push(body.receipt_date)
        // First scan: the window landed on the wrong week, so the matcher had
        // no candidates to score. Second: the corrected date finds them.
        const emptyWindow = receiptDatesSent.length === 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...SEED_RECEIPT_RESULT,
            // The router echoes the submitted date rather than restating its
            // own; the sheet re-reads it to decide whether to keep asking.
            receipt_date: body.receipt_date,
            scan_id: `scan-e2e-${receiptDatesSent.length}`,
            matched: emptyWindow ? [] : SEED_RECEIPT_RESULT.matched,
            unmatched: emptyWindow
              ? [
                  // Same lines, minus the item they would have matched: with
                  // no candidates in the window there is nothing to link to.
                  ...SEED_RECEIPT_RESULT.matched.map((m) => ({
                    receipt_name: m.receipt_name,
                    price_type: m.price_type,
                    unit_price: m.unit_price,
                    quantity: m.quantity,
                    line_total: m.line_total,
                  })),
                  ...SEED_RECEIPT_RESULT.unmatched,
                ]
              : SEED_RECEIPT_RESULT.unmatched,
          }),
        })
      },
    )

    await gotoList(page)
    await mockGeminiReceiptParse(page, PARSED_RECEIPT)
    await uploadReceipt(page)

    const sheet = page
      .locator('.sheet')
      .filter({ has: page.locator('.rss-toolbar') })
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.rss-toolbar-count')).toHaveText(
      '0 de 3 seleccionados',
    )

    // The prompt is a question, not an error — it offers the correction rather
    // than performing one.
    const prompt = sheet.locator('.rss-date-check')
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Corregir fecha' }).click()

    await sheet.locator('#rss-date-input').fill(TODAY)
    await sheet.getByRole('button', { name: 'Volver a buscar' }).click()

    // The corrected day reaches the backend, and no second Gemini call is made
    // to get there — the parsed receipt is reused verbatim apart from the date.
    await expect(async () => {
      expect(receiptDatesSent).toHaveLength(2)
    }).toPass()
    // The literal, not `toContain(TODAY)`: what leaves the browser is an
    // instant, not a calendar day. `withDatePart` rebuilds the corrected day
    // from local components, so TODAY at Madrid midnight is 22:00 on the day
    // before in UTC. A substring check on TODAY can therefore only pass where
    // local midnight *is* UTC midnight, which is CI and nowhere else — it
    // asserts something a correct value cannot satisfy for any real user.
    // The config pins the zone and this test pins the day, which together make
    // this exactly one value — so spell it out rather than recompute it. Do not
    // derive it here either: the expectation would be built in Node, whose
    // timezone Playwright does not pin, so it would drift from the browser's.
    expect(receiptDatesSent[1]).toBe('2026-07-24T22:00:00.000Z')

    // The re-match replaces what is on screen, prompt included.
    await expect(sheet.locator('.rss-toolbar-count')).toHaveText(
      '2 de 3 seleccionados',
    )
    await expect(sheet.locator('.rss-date-check')).toHaveCount(0)
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
    await expect(page.locator('.rss-toolbar')).toHaveCount(0)
  })
})
