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
    item_count: 3,
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
    // Five shops, which is the widest heading the list can draw: past three it
    // stops naming them and counts instead, so this renders as one line under
    // "Alcampo u otras 4 tiendas" -- longer than any spelled-out
    // set, and therefore the case worth pinning. Named out of alphabetical
    // order on purpose: the heading sorts whatever order they were typed, and
    // it is the *set* that groups, so this is one line and not five.
    //
    // It is here to hold that heading under visual regression: an underline
    // that wraps across two lines reads as two headings, and only a
    // screenshot can catch that. Appended, never inserted -- the specs index
    // this array ([0] is leche, [1] is cafe).
    {
      id: 'item-papel',
      list_id: 'seed-list-compra',
      name: 'Papel de cocina',
      quantity: '2',
      purchased_quantity: null,
      brand: null,
      stores: ['Mercadona', 'Carrefour', 'Dia', 'Lidl', 'Alcampo'],
      purchased: false,
      purchased_at: null,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: 'seed-user-bob',
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
  //
  // Converting rather than stripping, because the receipt endpoints are sent
  // an offset-bearing instant ('2026-07-25T00:30:00+02:00' — see
  // lib/receiptDate.ts) and the router normalises it with `astimezone(UTC)`.
  // A regex that only knew about 'Z' would leave the offset in place, and the
  // client would then re-append its own 'Z' to a string that already had a
  // zone and get an Invalid Date — a mock failure wearing a product bug's
  // clothes.
  const naiveUtc = (iso: string) =>
    new Date(iso).toISOString().replace(/Z$/, '')

  // A naive-UTC string (no 'Z', no offset) coming *from the client* — e.g.
  // useListItems' `purchased_at` tap time, or a receipt's `receipt_date` —
  // must be re-hydrated as UTC before doing any arithmetic on it. Parsing it
  // bare would have Node read it as local time, which is exactly the class of
  // bug `itemState.ts` exists to prevent on the other side of the wire.
  const parseNaiveUtc = (s: string): Date =>
    new Date(s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`)

  // Mirrors backend/app/services/trips.py: TRIP_TIMEZONE, tears_off_at_for.
  // A shopping trip files into the Madrid local day of its instant, and tears
  // off at the Madrid midnight after that day. This is the mock's only source
  // of truth for that rule — inventing a UTC-day approximation here would be
  // exactly the bug class this phase exists to delete.
  const TRIP_TIMEZONE = 'Europe/Madrid'

  const madridDateParts = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TRIP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    return { year: get('year'), month: get('month'), day: get('day') }
  }

  // The IANA offset (in minutes, east-positive) Madrid observes at `d`. Used
  // to convert a Madrid wall-clock instant back to UTC without a timezone
  // library — DST-correct because it asks the platform, not a fixed offset.
  const madridOffsetMinutes = (d: Date): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TRIP_TIMEZONE,
      timeZoneName: 'longOffset',
    }).formatToParts(d)
    const raw =
      parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
    const match = raw.match(/GMT([+-])(\d{2}):(\d{2})/)
    if (!match) return 0
    const sign = match[1] === '-' ? -1 : 1
    return sign * (Number(match[2]) * 60 + Number(match[3]))
  }

  /** Naive-UTC instant of the Madrid local midnight that ends `instant`'s
   *  trip day — the mock's equivalent of `tears_off_at_for`. */
  const tearsOffAtFor = (instant: Date): Date => {
    const { year, month, day } = madridDateParts(instant)
    // UTC-midnight of the *next* calendar day is only a first guess at which
    // instant to read Madrid's offset off of — on the one day a year Madrid
    // falls back (currently CET at that UTC instant, one hour later than
    // Madrid midnight actually was), that guess picks the wrong offset. A
    // second probe, now at the candidate the first guess produced, corrects
    // it: candidate and offset agree once refined, everywhere except inside
    // the one-hour repeated span itself, which no test here touches.
    const guess = new Date(Date.UTC(year, month - 1, day + 1))
    const candidate = new Date(
      guess.getTime() - madridOffsetMinutes(guess) * 60_000,
    )
    return new Date(guess.getTime() - madridOffsetMinutes(candidate) * 60_000)
  }

  /** Same trip for the same (list, Madrid day) — mirrors `trip_for`'s lookup
   *  key. Two items purchased on one Madrid day get the same id; a different
   *  day gets a different one. */
  const purchaseIdFor = (listId: string, instant: Date): string => {
    const { year, month, day } = madridDateParts(instant)
    return `trip-${listId}-${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  /** The trio a just-filed purchase carries: the tap instant, the trip it
   *  joined, and that trip's effective end — all naive-UTC strings, no 'Z'. */
  const purchaseFieldsFor = (listId: string, instant: Date) => ({
    purchased_at: naiveUtc(instant.toISOString()),
    purchase_id: purchaseIdFor(listId, instant),
    purchase_ends_at: naiveUtc(tearsOffAtFor(instant).toISOString()),
  })

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
          return json(
            [
              ...(SEED_ITEMS[listId] ?? []),
              ...(createdItems[listId] ?? []),
            ].map((i) => ({
              purchase_id: null,
              purchase_ends_at: null,
              ...i,
            })),
          )
        if (method === 'POST') {
          const body = (req.postDataJSON() ?? {}) as Partial<ListItem>
          return json({
            id: `new-item-${Date.now()}`,
            list_id: listId,
            name: '',
            purchased: false,
            purchased_at: null,
            purchase_id: null,
            purchase_ends_at: null,
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
          receipt_date?: string | null
        }
        const now = new Date().toISOString()
        // Mirrors the router: an impulse buy is born purchased, stamped with
        // the receipt's own instant when there is one, and filed into that
        // instant's Madrid-day trip exactly like a tap would be.
        const instant = new Date(body.receipt_date || now)
        const purchaseFields = purchaseFieldsFor(listId, instant)
        const created = (body.new_items ?? []).map((n, idx) => ({
          id: `created-item-${idx}-${now}`,
          list_id: listId,
          name: n.name,
          quantity: null, // never planned — that is what makes it an impulse buy
          purchased_quantity: n.quantity,
          brand: n.brand,
          stores: n.store ? [n.store] : [],
          purchased: true,
          ...purchaseFields,
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
          const patch = (req.postDataJSON() ?? {}) as Partial<ListItem> & {
            purchased_at?: string | null
          }
          if (!item) return json({ detail: 'Not found' }, 404)
          // Mirrors update_item: honour the client-supplied tap instant, fall
          // back to "now" when absent, and file into that instant's trip —
          // the same rule an offline tap draining in late relies on.
          let purchaseFields: Partial<ListItem> = {}
          if (patch.purchased === true) {
            const instant = patch.purchased_at
              ? parseNaiveUtc(patch.purchased_at)
              : new Date()
            purchaseFields = purchaseFieldsFor(listId, instant)
          } else if (patch.purchased === false) {
            purchaseFields = {
              purchased_at: null,
              purchase_id: null,
              purchase_ends_at: null,
            }
          }
          return json({
            ...item,
            ...patch,
            ...purchaseFields,
            updated_at: new Date().toISOString(),
          })
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
