import { test as base, expect, type Page } from '@playwright/test'
import type {
  ApiList,
  BackendMember,
  ListItem,
  ListStoreEntry,
  ListUpdatedAt,
  NewPurchasedItem,
  PriceEntry,
  PriceHistoryResponse,
  PriceType,
  ReceiptPriceApplyResult,
  ReceiptScanResult,
  UserMe,
} from '../src/types'
import data from './fixtures.json' with { type: 'json' }

const BACKEND = 'http://localhost:8000'
export const GEMINI_ENDPOINT_PATTERN =
  'https://firebasevertexai.googleapis.com/**'

// The payloads live in fixtures.json so a backend test can validate them
// against the Pydantic response models. Annotating them here keeps the other
// half of the contract: a change to src/types has to break this file too.
// The JSON import widens "granted" to string, so the union field needs a
// narrowing cast, like price_type below.
export const ALICE: UserMe = {
  ...data.ALICE,
  receipt_consent: data.ALICE.receipt_consent as UserMe['receipt_consent'],
}
export const SEED_LISTS: ApiList[] = data.SEED_LISTS
export const SEED_ITEMS: Record<string, ListItem[]> = data.SEED_ITEMS

const SEED_MEMBERS: Record<string, BackendMember[]> = data.SEED_MEMBERS

const SEED_STORES: Record<string, ListStoreEntry[]> = data.SEED_STORES

// Write-path templates. A write mock answers by spreading the echoed request
// fields over one of these, so the key set — and every value the echo leaves
// alone — is pinned by the same backend test that validates the read fixtures.
const SEED_CREATED_LIST: ApiList = data.SEED_CREATED_LIST
const SEED_CREATED_ITEM: ListItem = data.SEED_CREATED_ITEM
const SEED_IMPULSE_ITEM: ListItem = data.SEED_IMPULSE_ITEM
const SEED_PRICE_ENTRY: PriceEntry = data.SEED_PRICE_ENTRY
const SEED_PRICE_HISTORY: PriceHistoryResponse = data.SEED_PRICE_HISTORY
const SEED_RECEIPT_APPLY_RESULT: ReceiptPriceApplyResult =
  data.SEED_RECEIPT_APPLY_RESULT
const SEED_UPDATED_AT: ListUpdatedAt = data.SEED_UPDATED_AT

// A ReceiptScanSheet review, matching item-leche (existing price, gets updated)
// and item-cafe (no price yet), plus one unmatched line — mirrors the shape
// used in ReceiptScanSheet.test.tsx.
//
// price_type is narrowed one field at a time rather than casting the whole
// object: a JSON import widens "UNIT" to string, and a cast over the top would
// stop checking every other field along with it.
const narrowPriceType = <T extends { price_type: string }>(line: T) => ({
  ...line,
  price_type: line.price_type as PriceType,
})

export const SEED_RECEIPT_RESULT: ReceiptScanResult = {
  ...data.SEED_RECEIPT_RESULT,
  matched: data.SEED_RECEIPT_RESULT.matched.map(narrowPriceType),
  unmatched: data.SEED_RECEIPT_RESULT.unmatched.map(narrowPriceType),
}

// ── Route installer ───────────────────────────────────────────────────────────

export async function installApiMocks(page: Page): Promise<void> {
  // Impulse buys created mid-test, keyed by list. The rest of this mock is
  // deliberately stateless — echo a response, persist nothing — but a created
  // item is the one thing that has to outlive its request: the client refetches
  // straight after applying prices, and would otherwise never see it at all.
  const createdItems: Record<string, ListItem[]> = {}

  // The backend stores naive UTC and the client re-attaches the 'Z' when
  // parsing (itemCost.ts), so timestamps here must carry no zone suffix.
  const naiveUtc = (iso: string) => iso.replace(/Z$/, '')

  await page.route(`${BACKEND}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()

    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })

    // Auth
    if (method === 'POST' && path === '/auth/sync') return json(ALICE)
    if (method === 'GET' && path === '/users/me') return json(ALICE)

    // Settings sheet key issuance — fired on open under Apple UAs (the two
    // iPhone projects). Steady state: the key exists, no plaintext returned.
    if (method === 'POST' && path === '/account/api-key')
      return json({ key: null, created: false })

    // Lists collection
    if (path === '/lists') {
      if (method === 'GET') return json(SEED_LISTS)
      if (method === 'POST') {
        const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
        const now = naiveUtc(new Date().toISOString())
        return json({
          ...SEED_CREATED_LIST,
          ...body,
          id: `new-list-${Date.now()}`,
          created_at: now,
          updated_at: now,
        })
      }
    }

    // Suggestions
    if (method === 'GET' && path === '/suggestions') return json([])

    // /lists/:id and sub-resources
    const listMatch = path.match(/^\/lists\/([^/]+)(\/.*)?$/)
    if (listMatch) {
      const listId = listMatch[1]
      const sub = listMatch[2] ?? ''
      const list = SEED_LISTS.find((l) => l.id === listId)

      // /lists/:id
      if (sub === '') {
        if (method === 'GET')
          return list ? json(list) : json({ detail: 'Not found' }, 404)
        if (method === 'PATCH') {
          const patch = (req.postDataJSON() ?? {}) as Partial<ApiList>
          return list
            ? json({
                ...list,
                ...patch,
                updated_at: naiveUtc(new Date().toISOString()),
              })
            : json({ detail: 'Not found' }, 404)
        }
        if (method === 'DELETE') return route.fulfill({ status: 204 })
      }

      // /lists/:id/updated-at (polled every 5s)
      if (sub === '/updated-at' && method === 'GET') {
        return json({
          ...SEED_UPDATED_AT,
          updated_at: list?.updated_at ?? naiveUtc(new Date().toISOString()),
        })
      }

      // /lists/:id/items
      if (sub === '/items') {
        if (method === 'GET')
          return json([
            ...(SEED_ITEMS[listId] ?? []),
            ...(createdItems[listId] ?? []),
          ])
        if (method === 'POST') {
          const body = (req.postDataJSON() ?? {}) as Partial<ListItem>
          const now = naiveUtc(new Date().toISOString())
          return json({
            ...SEED_CREATED_ITEM,
            id: `new-item-${Date.now()}`,
            list_id: listId,
            created_at: now,
            updated_at: now,
            ...body,
            stores: body.stores ?? [],
          })
        }
      }

      // /lists/:id/members
      if (sub === '/members') {
        if (method === 'GET') return json(SEED_MEMBERS[listId] ?? [])
      }

      // /lists/:id/purchases — the trip stack fetches page 0 on every list
      // open. No seed trips, so an empty page; the mock only spares the app the
      // 404 fallback it otherwise swallows on mount.
      if (sub === '/purchases' && method === 'GET') {
        return json({ purchases: [], total: 0 })
      }

      // /lists/:id/stores — the store registry; fetched with every list read.
      if (sub === '/stores') {
        if (method === 'GET') return json(SEED_STORES[listId] ?? [])
      }

      // /lists/:id/due-suggestions
      if (sub === '/due-suggestions') return json([])

      // /lists/:id/seen — the push unseen-count watermark reset. Fired by
      // useListSeen on every list view, so without this the mock logs an
      // unhandled request on each one.
      if (sub === '/seen' && method === 'POST')
        return route.fulfill({ status: 204, body: '' })

      // /lists/:id/receipt (backend fuzzy-match step)
      if (sub === '/receipt' && method === 'POST') {
        const body = (req.postDataJSON() ?? {}) as {
          receipt_date?: string | null
        }
        // The router echoes the submitted date back verbatim
        // (`receipt_date=body.receipt_date`) rather than restating its own
        // fixture. Mirroring that matters: the sheet re-reads this field to
        // decide whether to keep asking about the date, so a mock that
        // ignored the correction would re-flag a date the user just fixed.
        return json({
          ...SEED_RECEIPT_RESULT,
          receipt_date: body.receipt_date ?? SEED_RECEIPT_RESULT.receipt_date,
        })
      }

      // /lists/:id/receipt-prices (apply reviewed prices)
      if (sub === '/receipt-prices' && method === 'POST') {
        const body = (req.postDataJSON() ?? {}) as {
          patches?: unknown[]
          new_items?: NewPurchasedItem[]
        }
        const now = new Date().toISOString()
        // An impulse buy is a purchase that already happened — you scan the
        // receipt after the fact — so it lands as a settled record on a
        // *closed* trip, not an in-cart line. Its purchase instant and trip
        // boundary come from the SEED_IMPULSE_ITEM template (a prior day,
        // torn off): on the real backend those are parsed from the submitted
        // receipt date, and a mock re-deriving that rule would drift on its
        // own. The template's closed trip is what makes the created card
        // render as a bought record (price + re-buy), which the impulse test
        // asserts.
        const created = (body.new_items ?? []).map((n, idx) => ({
          ...SEED_IMPULSE_ITEM,
          id: `created-item-${idx}-${now}`,
          list_id: listId,
          name: n.name,
          quantity: null, // never planned — that is what makes it an impulse buy
          purchased_quantity: n.quantity ?? null,
          brand: n.brand ?? null,
          stores: n.store ? [n.store] : [],
          ean: n.ean ?? null,
          price: n.price,
          price_per: n.price_per ?? null,
          price_store: n.store ?? null,
          created_at: naiveUtc(now),
          updated_at: naiveUtc(now),
        }))
        createdItems[listId] = [...(createdItems[listId] ?? []), ...created]
        return json({
          ...SEED_RECEIPT_APPLY_RESULT,
          items_updated: body.patches?.length ?? 0,
          items_created: created.length,
        })
      }

      // /lists/:id/items/:itemId
      const itemMatch = sub.match(/^\/items\/([^/]+)$/)
      if (itemMatch) {
        const itemId = itemMatch[1]
        const items = SEED_ITEMS[listId] ?? []
        const item = items.find((i) => i.id === itemId)
        if (method === 'PATCH') {
          const patch = (req.postDataJSON() ?? {}) as Partial<ListItem>
          return item
            ? json({
                ...item,
                ...patch,
                updated_at: naiveUtc(new Date().toISOString()),
              })
            : json({ detail: 'Not found' }, 404)
        }
        if (method === 'DELETE') return route.fulfill({ status: 204 })
      }

      // /lists/:id/items/:itemId/prices
      const priceMatch = sub.match(/^\/items\/([^/]+)\/prices$/)
      if (priceMatch) {
        const itemId = priceMatch[1]
        const items = SEED_ITEMS[listId] ?? []
        const item = items.find((i) => i.id === itemId)
        if (!item) return json({ detail: 'Not found' }, 404)

        if (method === 'GET') {
          const entries =
            item.price != null
              ? [
                  {
                    ...SEED_PRICE_ENTRY,
                    amount: item.price,
                    price_per: item.price_per,
                    store: item.price_store,
                    purchased_at: item.purchased_at,
                    quantity: item.quantity,
                  },
                ]
              : []
          return json({ ...SEED_PRICE_HISTORY, entries })
        }

        const body = (req.postDataJSON() ?? {}) as {
          amount: number
          price_per: string | null
          store: string | null
        }
        // A price write answers with the entry as written, and the writer does
        // not fill purchased_at or quantity — the template's nulls are the
        // backend's actual response, not a gap in the mock.
        if (method === 'POST') {
          if (item.price != null)
            return json(
              { detail: 'Item already has a price; use PATCH to update it' },
              409,
            )
          return json({ ...SEED_PRICE_ENTRY, ...body }, 201)
        }
        if (method === 'PATCH') {
          if (item.price == null)
            return json(
              { detail: 'Item has no price yet; use POST to set it' },
              404,
            )
          return json({ ...SEED_PRICE_ENTRY, ...body })
        }
        if (method === 'DELETE') {
          if (item.price == null)
            return json({ detail: 'Item has no price to delete' }, 404)
          return route.fulfill({ status: 204 })
        }
      }
    }

    // Unhandled: surface loudly so missing mocks are easy to spot
    console.warn(`[mock] Unhandled ${method} ${url.pathname}${url.search}`)
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Not mocked: ${method} ${url.pathname}` }),
    })
  })
}

// ── Extended test fixture (auto-installs mocks before every test) ─────────────

export { expect }

export const test = base.extend<object>({
  page: async ({ page }, provide) => {
    // Headless Chromium hard-codes Notification.permission to 'denied', so
    // without this every screenshot would show the dashboard's "you have
    // blocked notifications" notice instead of the ordinary control.
    // context.grantPermissions() does NOT fix it — verified: the value stays
    // 'denied' whether granted for all origins or scoped to this one. Override
    // the getter instead, which is consistent with a suite that already mocks
    // the whole backend. The denied branch has unit coverage.
    // Passed as source text, not a closure: this runs in the browser, but the
    // test project is typechecked with lib ES2023 only, where `Notification`
    // does not exist.
    await page.addInitScript({
      content:
        "Object.defineProperty(Notification, 'permission', " +
        "{ get: () => 'default', configurable: true })",
    })
    await installApiMocks(page)
    await provide(page)
  },
})

// ── Visual regression helper ─────────────────────────────────────────────────
// Only these two projects carry visual baselines — one desktop, one mobile,
// both Chromium-based so a single rendering engine keeps diffs meaningful.
// The other three projects still run full functional assertions, they just
// don't own screenshot baselines.
const VISUAL_PROJECTS = new Set(['chromium', 'Mobile Chrome'])

export async function expectScreenshot(
  page: Page,
  name: string,
): Promise<void> {
  const projectName = test.info().project.name
  if (!VISUAL_PROJECTS.has(projectName)) return
  await expect(page).toHaveScreenshot(name, { fullPage: true })
}

/**
 * Wait for the notification priming card, which every list-screen baseline
 * shows.
 *
 * It renders only after the member list arrives, and it pushes the whole screen
 * down when it does. Without this wait a capture can land on either side of
 * that, and the mismatch is invisible: toHaveScreenshot stops at the first frame
 * matching its baseline, so a baseline of the pre-card screen goes on passing
 * while the card is what the user actually ends up with. Call this before
 * screenshotting any screen whose baseline includes the card.
 *
 * Gated on the same projects as the screenshot, because the card is what those
 * baselines happen to contain rather than something every browser must show —
 * it does not render at all under the iOS projects, where push is unavailable
 * without a home-screen install.
 */
export async function awaitPrimingCard(page: Page): Promise<void> {
  if (!VISUAL_PROJECTS.has(test.info().project.name)) return
  await expect(page.locator('.push-priming')).toBeVisible()
}

// ── Gemini network-boundary mock ─────────────────────────────────────────────
// receiptAi.ts calls the Firebase AI SDK, which — regardless of GoogleAIBackend
// vs VertexAIBackend — issues a real fetch to this proxy domain. Intercepting
// it here (rather than mocking receiptAi.ts itself) keeps the test exercising
// the actual client parse -> backend match -> review -> apply pipeline; only
// the non-deterministic Gemini call is stubbed.
export interface GeminiParsedLine {
  name: string
  price_type: 'UNIT' | 'KILOGRAM' | 'MULTI'
  unit_price: number
  quantity: number | null
  line_total: number
}

export async function mockGeminiReceiptParse(
  page: Page,
  parsed: {
    store: string | null
    receipt_date: string | null
    receipt_total: number | null
    lines: GeminiParsedLine[]
  },
): Promise<void> {
  await page.route(GEMINI_ENDPOINT_PATTERN, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: JSON.stringify(parsed) }],
            },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      }),
    })
  })
}
