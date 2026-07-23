import type { Page } from '@playwright/test'
import path from 'node:path'
import {
  expect,
  expectScreenshot,
  GEMINI_ENDPOINT_PATTERN,
  mockGeminiReceiptParse,
  SEED_ITEMS,
  SEED_LISTS,
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
