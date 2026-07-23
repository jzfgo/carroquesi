import { test as base, expect, type Page } from '@playwright/test'
import type {
  ApiList,
  ListItem,
  Member,
  NewPurchasedItem,
  ReceiptScanResult,
} from '../src/types'

const BACKEND = 'http://localhost:8000'
export const GEMINI_ENDPOINT_PATTERN =
  'https://firebasevertexai.googleapis.com/**'

// ── Seed data (mirrors scripts/seed.py) ──────────────────────────────────────

export const ALICE = {
  id: 'seed-user-alice',
  firebase_uid: 'seed-alice',
  display_name: 'Alice (seed)',
  email: 'alice@seed.local',
  photo_url: null,
  // push_notifications defaults to true in the backend registry, so a real
  // user's /me response carries it. Keep this list in step with the registry:
  // omitting a default-on flag hides its UI from E2E and from the visual
  // baselines, which then stop reflecting what production actually renders.
  features: ['ai_receipt_scanning', 'push_notifications'] as string[],
}

export const SEED_LISTS: ApiList[] = [
  {
    id: 'seed-list-compra',
    name: 'Compra semanal',
    emoji: '🛒',
    owner_id: ALICE.id,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-06-23T10:00:00Z',
    item_count: 2,
    purchased_count: 0,
    is_default: true,
  },
  {
    id: 'seed-list-fiesta',
    name: 'Fiesta de cumple',
    emoji: '🎉',
    owner_id: ALICE.id,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-06-23T10:00:00Z',
    item_count: 1,
    purchased_count: 0,
    is_default: false,
  },
]

export const SEED_ITEMS: Record<string, ListItem[]> = {
  'seed-list-compra': [
    {
      id: 'item-leche',
      list_id: 'seed-list-compra',
      name: 'Leche Hacendado',
      quantity: '6',
      purchased_quantity: null,
      brand: 'Hacendado',
      stores: ['Mercadona'],
      purchased: false,
      purchased_at: null,
      ean: null,
      price: 0.65,
      price_per: null,
      price_store: 'Mercadona',
      added_by: ALICE.id,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-23T10:00:00Z',
    },
    {
      id: 'item-cafe',
      list_id: 'seed-list-compra',
      name: 'Cafe molido Nescafe',
      quantity: null,
      purchased_quantity: null,
      brand: 'Nescafe',
      stores: ['Mercadona'],
      purchased: false,
      purchased_at: null,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: ALICE.id,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-23T10:00:00Z',
    },
  ],
  'seed-list-fiesta': [
    {
      id: 'item-pasta',
      list_id: 'seed-list-fiesta',
      name: 'Pasta Gallo',
      quantity: null,
      purchased_quantity: null,
      brand: 'Gallo',
      stores: ['Mercadona'],
      purchased: false,
      purchased_at: null,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: ALICE.id,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-23T10:00:00Z',
    },
  ],
}

const SEED_MEMBERS: Record<string, Member[]> = {
  'seed-list-compra': [
    {
      id: ALICE.id,
      displayName: 'Alice (seed)',
      initial: 'A',
      color: '#4f46e5',
      photoUrl: null,
    },
    {
      id: 'seed-user-bob',
      displayName: 'Bob (seed)',
      initial: 'B',
      color: '#0891b2',
      photoUrl: null,
    },
  ],
  'seed-list-fiesta': [
    {
      id: ALICE.id,
      displayName: 'Alice (seed)',
      initial: 'A',
      color: '#4f46e5',
      photoUrl: null,
    },
  ],
}

// A ReceiptScanSheet review, matching item-leche (existing price, gets updated)
// and item-cafe (no price yet), plus one unmatched line — mirrors the shape
// used in ReceiptScanSheet.test.tsx.
export const SEED_RECEIPT_RESULT: ReceiptScanResult = {
  scan_id: 'scan-e2e-1',
  store: 'Mercadona',
  receipt_date: '2026-07-10',
  receipt_total: 4.35,
  matched: [
    {
      receipt_name: 'LECHE HACENDADO',
      item_id: 'item-leche',
      item_name: 'Leche Hacendado',
      price_type: 'UNIT',
      unit_price: 0.75,
      quantity: null,
      line_total: 0.75,
    },
    {
      receipt_name: 'CAFE MOLIDO NESCAFE',
      item_id: 'item-cafe',
      item_name: 'Cafe molido Nescafe',
      price_type: 'UNIT',
      unit_price: 2.6,
      quantity: null,
      line_total: 2.6,
    },
  ],
  unmatched: [
    {
      receipt_name: 'PAN INTEGRAL',
      price_type: 'UNIT',
      unit_price: 1.0,
      quantity: null,
      line_total: 1.0,
    },
  ],
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

    // Lists collection
    if (path === '/lists') {
      if (method === 'GET') return json(SEED_LISTS)
      if (method === 'POST') {
        const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
        return json({
          ...body,
          id: `new-list-${Date.now()}`,
          owner_id: ALICE.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          item_count: 0,
          purchased_count: 0,
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
            ? json({ ...list, ...patch, updated_at: new Date().toISOString() })
            : json({ detail: 'Not found' }, 404)
        }
        if (method === 'DELETE') return route.fulfill({ status: 204 })
      }

      // /lists/:id/updated-at (polled every 5s)
      if (sub === '/updated-at') {
        return json({
          updated_at: list?.updated_at ?? new Date().toISOString(),
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
          return json({
            id: `new-item-${Date.now()}`,
            list_id: listId,
            name: '',
            purchased: false,
            purchased_at: null,
            ean: null,
            purchased_quantity: null,
            price: null,
            price_per: null,
            price_store: null,
            added_by: ALICE.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...body,
            stores: body.stores ?? [],
          })
        }
      }

      // /lists/:id/members
      if (sub === '/members') {
        if (method === 'GET') return json(SEED_MEMBERS[listId] ?? [])
      }

      // /lists/:id/due-suggestions
      if (sub === '/due-suggestions') return json([])

      // /lists/:id/seen — the push unseen-count watermark reset. Fired by
      // useListSeen on every list view, so without this the mock logs an
      // unhandled request on each one.
      if (sub === '/seen' && method === 'POST')
        return route.fulfill({ status: 204, body: '' })

      // /lists/:id/receipt (backend fuzzy-match step)
      if (sub === '/receipt' && method === 'POST')
        return json(SEED_RECEIPT_RESULT)

      // /lists/:id/receipt-prices (apply reviewed prices)
      if (sub === '/receipt-prices' && method === 'POST') {
        const body = (req.postDataJSON() ?? {}) as {
          patches?: unknown[]
          new_items?: NewPurchasedItem[]
          receipt_date?: string | null
        }
        const now = new Date().toISOString()
        // Mirrors the router: an impulse buy is born purchased, stamped with
        // the receipt's own instant when there is one.
        const purchasedAt = naiveUtc(body.receipt_date || now)
        const created = (body.new_items ?? []).map((n, idx) => ({
          id: `created-item-${idx}-${now}`,
          list_id: listId,
          name: n.name,
          quantity: null, // never planned — that is what makes it an impulse buy
          purchased_quantity: n.quantity,
          brand: n.brand,
          stores: n.store ? [n.store] : [],
          purchased: true,
          purchased_at: purchasedAt,
          ean: n.ean,
          price: n.price,
          price_per: n.price_per,
          price_store: n.store,
          added_by: ALICE.id,
          created_at: naiveUtc(now),
          updated_at: naiveUtc(now),
        }))
        createdItems[listId] = [...(createdItems[listId] ?? []), ...created]
        return json({
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
            ? json({ ...item, ...patch, updated_at: new Date().toISOString() })
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
                    amount: item.price,
                    price_per: item.price_per,
                    store: item.price_store,
                    purchased_at: item.purchased_at,
                    quantity: item.quantity,
                  },
                ]
              : []
          return json({
            entries,
            community_price: null,
            community_price_per: null,
          })
        }

        const body = (req.postDataJSON() ?? {}) as {
          amount: number
          price_per: string | null
          store: string | null
        }
        if (method === 'POST') {
          if (item.price != null)
            return json(
              { detail: 'Item already has a price; use PATCH to update it' },
              409,
            )
          return json(
            {
              ...body,
              purchased_at: item.purchased_at,
              quantity: item.quantity,
            },
            201,
          )
        }
        if (method === 'PATCH') {
          if (item.price == null)
            return json(
              { detail: 'Item has no price yet; use POST to set it' },
              404,
            )
          return json({
            ...body,
            purchased_at: item.purchased_at,
            quantity: item.quantity,
          })
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
