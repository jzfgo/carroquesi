import type { Page } from '@playwright/test'
import path from 'node:path'
import {
  dismissUndoNotice,
  expect,
  expectScreenshot,
  GEMINI_ENDPOINT_PATTERN,
  mockGeminiReceiptParse,
  SEED_ITEMS,
  SEED_LISTS,
  test,
} from './fixtures'

const LIST_ID = SEED_LISTS[0].id
const ITEM_LECHE = SEED_ITEMS[LIST_ID][0]
const ITEM_CAFE = SEED_ITEMS[LIST_ID][1]
const ITEM_PAPEL = SEED_ITEMS[LIST_ID][2]

// receiptAi.ts only ever ships the file to the (mocked) Gemini endpoint, so
// any small valid image works — the mock never inspects its bytes.
const RECEIPT_IMAGE = path.join(
  import.meta.dirname,
  '../public/transparent.png',
)

// What the AI reads off the paper. The backend mock answers from
// SEED_RECEIPT_RESULT whatever this says, so the only thing the two must agree
// about is the order: an `index` over there is a position in this array.
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
      name: 'Pan integral',
      price_type: 'UNIT' as const,
      unit_price: 1.0,
      quantity: null,
      line_total: 1.0,
    },
    {
      name: 'Cafe molido Nescafe',
      price_type: 'UNIT' as const,
      unit_price: 2.6,
      quantity: null,
      line_total: 2.6,
    },
  ],
}

/**
 * Pinned because the sheet prints the paper's day and the ticket it files
 * prints its own. Left to the machine clock, the committed baselines would
 * depict whatever day they were generated on and start disagreeing with the
 * runner the next morning.
 *
 * Two days after the paper, so the ticket this flow files has already torn off
 * and its lines read as a record rather than as a cart.
 */
const FIXED_NOW = new Date('2026-07-12T10:00:00Z')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW)
})

/** Every query below is scoped to the sheet. The screen behind it carries a
 *  filter chip per shop and a "Tienda" control on the input bar, and it also
 *  carries the other door into scanning, so an unscoped name match finds the
 *  wrong control rather than failing. */
const sheet = (page: Page) => page.locator('.cts')

/** One row of the close sheet, found by what the paper printed on it. */
const row = (page: Page, printed: string) =>
  sheet(page).locator('.cts__row').filter({ hasText: printed })

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
  await dismissUndoNotice(page)
}

async function openCloseSheet(page: Page) {
  await page.locator('.stamp-row').click()
  await expect(sheet(page)).toBeVisible()
}

/** Answer the source picker with a file. Both doors open the same picker. */
async function pickReceiptFile(page: Page) {
  const chooser = page.waitForEvent('filechooser')
  await page
    .locator('.receipt-source-picker')
    .getByRole('button', { name: 'Elegir de galería' })
    .click()
  await (await chooser).setFiles(RECEIPT_IMAGE)
}

/** Read a paper from the sheet's own thumbnail — the door this phase built. */
async function scanFromSheet(page: Page) {
  await sheet(page).getByRole('button', { name: 'Escanear ticket' }).click()
  await pickReceiptFile(page)
}

/** The other door: a shop nobody wrote down, read straight from the list. It
 *  opens the close sheet already filled in. */
async function scanFromList(page: Page) {
  await page.locator('.save-ticket').click()
  await pickReceiptFile(page)
}

/** The sheet has the paper's three lines on it. */
async function expectPaperRead(page: Page) {
  await expect(sheet(page).locator('.cts__raw')).toHaveCount(3)
}

/** Say which product a printed line was, by creating one. The brand rides in
 *  on the sigil grammar rather than a separate field. */
async function resolveAsNewProduct(page: Page, printed: string, typed: string) {
  await row(page, printed)
    .getByRole('button', { name: `Asignar ${printed}` })
    .click()
  const resolve = page.locator('.rls')
  await expect(resolve).toBeVisible()
  await resolve.locator('.rls__field').fill(typed)
  await resolve.getByRole('button', { name: 'Asignar' }).click()
  await expect(resolve).toBeHidden()
}

const THEMES = [
  { name: 'light', colorScheme: 'light' as const },
  { name: 'dark', colorScheme: 'dark' as const },
]

for (const { name: themeName, colorScheme } of THEMES) {
  test.describe(`${themeName} mode`, () => {
    test.use({ colorScheme })

    test('a scan lays the paper over the close sheet, in the printed order', async ({
      page,
    }) => {
      await gotoList(page)
      await putInCart(page, ITEM_LECHE.name)
      await putInCart(page, ITEM_CAFE.name)
      await mockGeminiReceiptParse(page, PARSED_RECEIPT)

      await openCloseSheet(page)
      await scanFromSheet(page)

      // The paper's order, which is neither response array's. The line the
      // matcher could not place was printed between the two it did, so a sheet
      // that listed every match before every miss would put it last.
      await expect(sheet(page).locator('.cts__raw')).toHaveText([
        'LECHE HACENDADO',
        'PAN INTEGRAL',
        'CAFE MOLIDO NESCAFE',
      ])
      // Under each printed string, what the app believes it was. A line with
      // no product yet asks for one instead.
      await expect(sheet(page).locator('.cts__guess')).toHaveText([
        'Leche Hacendado',
        'Asignar producto',
        'Cafe molido Nescafe',
      ])
      // One of the two matches came from a name somebody had already confirmed
      // for this shop and the other did not. Asserted because it is the scan's
      // `confirmed` flag crossing the wire — how the two forms are drawn is a
      // computed-style test on the component, where a dashed stroke is worth
      // fewer pixels than a screenshot's tolerance.
      await expect(
        row(page, 'LECHE HACENDADO').locator('.cts__guess'),
      ).not.toHaveClass(/cts__guess--ask/)
      await expect(
        row(page, 'CAFE MOLIDO NESCAFE').locator('.cts__guess'),
      ).toHaveClass(/cts__guess--ask/)

      // A row the paper never printed stays where it was, and stays unticked.
      // It is still on the list; the shop simply did not sell it today.
      await expect(
        row(page, ITEM_PAPEL.name).locator('.cts__check'),
      ).not.toBeChecked()

      // The shop and the day are the paper's, not the sheet's. The day is the
      // one printed on it and survives the round trip through the wire's
      // offset, which is why the literal is spelled out rather than derived.
      await expect(
        sheet(page).getByRole('button', { name: 'Mercadona' }),
      ).toHaveClass(/cts__pill--on/)
      await expect(sheet(page).getByLabel('Fecha')).toHaveValue('2026-07-10')
      // The three printed amounts add up to the total printed on the paper.
      await expect(sheet(page).locator('.cts__recon')).toContainText(
        'Cuadra con el ticket',
      )

      await expectScreenshot(page, `close-sheet-ticket-${themeName}.png`)
    })

    test('a line the matcher could not place asks which product it was', async ({
      page,
    }) => {
      await gotoList(page)
      await putInCart(page, ITEM_LECHE.name)
      await putInCart(page, ITEM_CAFE.name)
      await mockGeminiReceiptParse(page, PARSED_RECEIPT)

      await openCloseSheet(page)
      await scanFromSheet(page)
      await expectPaperRead(page)

      await row(page, 'PAN INTEGRAL')
        .getByRole('button', { name: 'Asignar PAN INTEGRAL' })
        .click()

      // Two causes, one under the other. The paper's own line is quoted above
      // both, because that is the thing being answered.
      const resolve = page.locator('.rls')
      await expect(resolve).toBeVisible()
      await expect(resolve.locator('.rls__raw')).toHaveText('PAN INTEGRAL')
      // The only row of the sheet no printed line has claimed. The two matched
      // rows are taken, so offering them would put one product on two lines of
      // one ticket.
      await expect(resolve.getByRole('radio')).toHaveCount(1)
      await expect(resolve.locator('.rls__option-name')).toHaveText(
        ITEM_PAPEL.name,
      )

      await expectScreenshot(page, `resolve-line-${themeName}.png`)

      await resolve.locator('.rls__field').fill('Pan integral #Bimbo')
      await resolve.getByRole('button', { name: 'Asignar' }).click()
      await expect(resolve).toBeHidden()

      // The row keeps the printed string and now names a product, so it stops
      // asking — and an answered line is one the household means to record.
      const answered = row(page, 'PAN INTEGRAL')
      await expect(answered.locator('.cts__guess')).toHaveText('Pan integral')
      await expect(answered.locator('.cts__check')).toBeChecked()
    })
  })
}

// Neither test below asserts anything theme-dependent, so they run once
// instead of once per THEMES entry.
test.describe('functional', () => {
  test('closing a scanned ticket sends the paper the sheet was filled from', async ({
    page,
  }) => {
    await gotoList(page)
    await putInCart(page, ITEM_LECHE.name)
    await putInCart(page, ITEM_CAFE.name)
    await mockGeminiReceiptParse(page, PARSED_RECEIPT)

    // The other door, with no sheet open yet: it opens the close sheet on the
    // trip that is still running, already filled in from the paper.
    await scanFromList(page)
    await expect(sheet(page)).toBeVisible()
    await expectPaperRead(page)

    await resolveAsNewProduct(page, 'PAN INTEGRAL', 'Pan integral #Bimbo')

    const posted = page.waitForRequest(
      (r) => r.url().includes('/purchases/close') && r.method() === 'POST',
    )
    await sheet(page).getByRole('button', { name: 'Guardar compra' }).click()
    const body = (await posted).postDataJSON() as {
      store: string
      total: number | null
      purchased_at: string | null
      scan_id: string | null
      lines: { item_id: string; price: number | null }[]
      new_items: { name: string; brand: string | null; price: number }[]
      mappings: {
        receipt_name: string
        item_name: string
        item_brand: string | null
      }[]
    }

    // One act, one endpoint: the scan is named on the close rather than
    // applied by one of its own.
    expect(body.scan_id).toBe('scan-e2e-1')
    expect(body.store).toBe('Mercadona')
    // The figure printed on the paper, which only a scanned close ever sends.
    expect(body.total).toBe(4.35)
    // The literal, not something derived here. The paper printed a day and no
    // hour, so the sheet keeps Madrid midnight of the 10th — 22:00 the day
    // before in UTC, which is how every instant below the API is written.
    // Building this expectation in Node would compute it in the runner's
    // timezone, which Playwright does not pin, so it would drift from the
    // browser's.
    expect(body.purchased_at).toBe('2026-07-09T22:00:00')

    // Each matched line carries the paper's own unit price, replacing the
    // 0,65 the list already had for the milk.
    expect(body.lines).toHaveLength(2)
    expect(body.lines).toEqual([
      expect.objectContaining({ item_id: ITEM_LECHE.id, price: 0.75 }),
      expect.objectContaining({ item_id: ITEM_CAFE.id, price: 2.6 }),
    ])

    // The answered line was never on the list, so it is bought outright.
    expect(body.new_items).toHaveLength(1)
    expect(body.new_items[0]).toMatchObject({
      name: 'Pan integral',
      brand: 'Bimbo',
      price: 1,
    })
    // And answering it teaches the app the printed string, as printed. The
    // shop is stated once by the close, so a mapping does not carry its own.
    expect(body.mappings).toEqual([
      {
        receipt_name: 'PAN INTEGRAL',
        item_name: 'Pan integral',
        item_brand: 'Bimbo',
      },
    ])

    // The round trip that matters: the sheet goes away, the group becomes a
    // ticket headed by the shop, and the product that was never on the list
    // comes back already bought.
    await expect(sheet(page)).toBeHidden()
    await expect(page.locator('.item-list__label-text')).toContainText(
      'Mercadona',
    )
    const created = itemCard(page, 'Pan integral')
    await expect(created).toBeVisible()
    await expect(created).toHaveClass(/item-card--bought/)
  })

  test('a read that fails leaves the sheet in hand mode with what it held', async ({
    page,
  }) => {
    await gotoList(page)
    await putInCart(page, ITEM_LECHE.name)
    await page.route(GEMINI_ENDPOINT_PATTERN, (route) =>
      route.fulfill({ status: 500, body: 'Internal Server Error' }),
    )

    await openCloseSheet(page)
    await scanFromSheet(page)

    await expect(page.locator('.toast')).toContainText(
      'No se pudo leer el ticket',
    )
    // The sheet is still up, still has no paper on it, and still offers to
    // read one. A read that failed throws away nothing the sheet was holding.
    await expect(sheet(page).locator('.cts__raw')).toHaveCount(0)
    await expect(sheet(page).locator('.cts__thumb')).toBeVisible()
    await expect(
      row(page, ITEM_LECHE.name).locator('.cts__check'),
    ).toBeChecked()
  })
})
