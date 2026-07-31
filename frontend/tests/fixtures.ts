import { test as base, expect, type Locator, type Page } from '@playwright/test'
import type {
  ApiList,
  ListItem,
  Member,
  Purchase,
  PurchaseNewItem,
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
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-06-23T10:00:00',
    item_count: 3,
    purchased_count: 0,
    is_default: true,
  },
  {
    id: 'seed-list-fiesta',
    name: 'Fiesta de cumple',
    emoji: '🎉',
    owner_id: ALICE.id,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-06-23T10:00:00',
    item_count: 1,
    purchased_count: 0,
    is_default: false,
  },
]

/**
 * A history worth drawing, for the one item the 22a/22b screenshots open.
 * Every other item derives its single entry from its own price, which is what
 * the endpoint returns for something bought once.
 *
 * The shapes here are the ones the block has to tell apart: two shops, a record
 * whose amount converts to €/kg and so carries ≈, and a shop that recorded no
 * amount at all. A null amount is a real response — the read returns anything
 * bought, priced or not.
 */
export const SEED_PRICE_HISTORY: Record<
  string,
  {
    amount: number | null
    price_per: string | null
    store: string | null
    purchased_at: string | null
    quantity: string | null
  }[]
> = {
  // Every quantity is in litres so the whole history converts and stays on one
  // scale. Mixing a count with a volume is a real case, but it leaves most of
  // the records unconvertible and makes a poor thing to draw as canonical.
  'item-leche': [
    // The newest record is the item's own price, because that is what the
    // item's price is. A fixture where the two disagree draws a sheet that
    // contradicts itself.
    {
      amount: 0.65,
      price_per: null,
      store: 'Mercadona',
      purchased_at: '2026-07-12T10:00:00',
      quantity: '1 l',
    },
    {
      amount: 1.05,
      price_per: null,
      store: 'Mercadona',
      purchased_at: '2026-07-05T10:00:00',
      quantity: '1 l',
    },
    {
      amount: null,
      price_per: null,
      store: 'Mercadona',
      purchased_at: '2026-06-21T10:00:00',
      quantity: '1 l',
    },
    {
      amount: 1.89,
      price_per: null,
      store: 'Alcampo',
      purchased_at: '2026-06-03T10:00:00',
      quantity: '2 l',
    },
  ],
}

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
      created_at: '2026-06-01T00:00:00',
      updated_at: '2026-06-23T10:00:00',
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
      created_at: '2026-06-01T00:00:00',
      updated_at: '2026-06-23T10:00:00',
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
      created_at: '2026-06-01T00:00:00',
      updated_at: '2026-06-23T10:00:00',
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
      created_at: '2026-06-01T00:00:00',
      updated_at: '2026-06-23T10:00:00',
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

// One Mercadona receipt as the backend matcher answers for it: two of its
// three lines are on this list and one is not.
//
// The line it could not place is the *middle* one of the paper, which is what
// makes the sheet's order worth asserting. Put it last and a sheet that simply
// printed every matched line before every unmatched one — the concatenation
// this phase deletes — would look exactly like one that kept the paper's
// order. The `index` fields are the paper's order and the arrays are not.
//
// One match is confirmed and the other is not, so both forms of the app's
// guess are on screen: a name somebody already resolved for this shop, and one
// the matcher only scored.
//
// `receipt_total` is what the three printed amounts add up to. Change one
// without changing the other and the sheet's reconciliation goes amber, which
// is a different screen from the one these baselines depict.
export const SEED_RECEIPT_RESULT: ReceiptScanResult = {
  scan_id: 'scan-e2e-1',
  store: 'Mercadona',
  receipt_date: '2026-07-10',
  receipt_total: 4.35,
  matched: [
    {
      index: 0,
      receipt_name: 'LECHE HACENDADO',
      item_id: 'item-leche',
      item_name: 'Leche Hacendado',
      price_type: 'UNIT',
      unit_price: 0.75,
      quantity: null,
      line_total: 0.75,
      confirmed: true,
    },
    {
      index: 2,
      receipt_name: 'CAFE MOLIDO NESCAFE',
      item_id: 'item-cafe',
      item_name: 'Cafe molido Nescafe',
      price_type: 'UNIT',
      unit_price: 2.6,
      quantity: null,
      line_total: 2.6,
      confirmed: false,
    },
  ],
  unmatched: [
    {
      index: 1,
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
  // the list straight after closing a shop, and would otherwise never see it.
  const createdItems: Record<string, ListItem[]> = {}

  // Trips this list has filed, newest first, and what closing them did to the
  // items they named. Both live here rather than in SEED_ITEMS because that
  // array is module-level: writing to it would carry one test's closed ticket
  // into the next one. Keyed by item id, merged on the way out.
  const purchases: Record<string, Purchase[]> = {}
  const filedItems: Record<string, Partial<ListItem>> = {}

  // The backend stores naive UTC and the client re-attaches the 'Z' when
  // parsing (itemCost.ts), so timestamps here must carry no zone suffix.
  const naiveUtc = (iso: string) =>
    new Date(iso).toISOString().replace(/Z$/, '')

  // A naive-UTC string (no 'Z', no offset) coming *from the client* — a tap's
  // `purchased_at`, or the instant a close sheet was stamped with — must be
  // re-hydrated as UTC before doing any arithmetic on it. Parsing it bare
  // would have Node read it as local time, which is exactly the class of bug
  // `itemState.ts` exists to prevent on the other side of the wire.
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

  /** The quartet a just-filed purchase carries: the tap instant, the trip it
   *  joined, that trip's effective end, and whether the trip has been closed
   *  by hand -- all naive-UTC strings, no 'Z', except the last. A fresh tap
   *  always joins an *open* trip, so purchase_filed is false here. Closing a
   *  purchase is what turns it true, and that route writes its own override
   *  rather than going through this. */
  const purchaseFieldsFor = (listId: string, instant: Date) => ({
    purchased_at: naiveUtc(instant.toISOString()),
    purchase_id: purchaseIdFor(listId, instant),
    purchase_ends_at: naiveUtc(tearsOffAtFor(instant).toISOString()),
    purchase_filed: false,
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
              purchase_filed: false,
              ...i,
              ...filedItems[i.id],
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
            purchase_filed: false,
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

      // /lists/:id/purchases (the trips behind the ticket headers)
      if (sub === '/purchases' && method === 'GET') {
        return json(purchases[listId] ?? [])
      }

      // /lists/:id/purchases/close
      if (sub === '/purchases/close' && method === 'POST') {
        const body = (req.postDataJSON() ?? {}) as {
          store: string
          total?: number | null
          purchased_at?: string | null
          lines?: { item_id: string; price?: number | null }[]
          new_items?: PurchaseNewItem[]
        }
        // Every instant here comes from the request, never from `new Date()`.
        // This handler runs in Node, where the clock is the machine's, while
        // the page's is pinned by the spec — so a locally-made timestamp lands
        // in the page's future and the lines never read as filed.
        const instant = body.purchased_at
          ? parseNaiveUtc(body.purchased_at)
          : new Date()
        const closedAt = naiveUtc(instant.toISOString())
        const trip: Purchase = {
          id: `trip-closed-${(purchases[listId] ?? []).length + 1}`,
          list_id: listId,
          opened_at: naiveUtc(instant.toISOString()),
          // Written down, so it stopped taking items then rather than at
          // midnight — which is what makes its lines read as filed.
          tears_off_at: naiveUtc(tearsOffAtFor(instant).toISOString()),
          closed_at: closedAt,
          store: body.store,
          total: body.total ?? null,
        }
        purchases[listId] = [trip, ...(purchases[listId] ?? [])]
        // What a filed line looks like afterwards. The trip stopped taking
        // items when it was written down rather than at midnight, which is
        // what makes its lines read as filed.
        const filed = {
          purchased: true,
          purchased_at: naiveUtc(instant.toISOString()),
          purchase_id: trip.id,
          purchase_ends_at: closedAt,
          purchase_filed: true,
        }
        for (const line of body.lines ?? []) {
          filedItems[line.item_id] = {
            ...filed,
            ...(line.price != null
              ? { price: line.price, price_store: body.store }
              : {}),
          }
        }
        // Mirrors close(): a product the shop sold but the list never held is
        // born already bought, on this same ticket. The close is the only
        // thing that creates one now, because the receipt review that also
        // did has been deleted along with its endpoint.
        const created = (body.new_items ?? []).map((n, idx) => ({
          id: `${trip.id}-new-${idx}`,
          list_id: listId,
          name: n.name,
          quantity: null, // never planned — that is what makes it an impulse buy
          purchased_quantity: n.quantity ?? null,
          brand: n.brand ?? null,
          // No stores, and a price store only where there is a price to pin to
          // it — both as close() has them. `stores` is a hint about where to
          // buy something, and this was already bought.
          stores: [],
          ean: n.ean ?? null,
          price: n.price ?? null,
          price_per: n.price_per ?? null,
          price_store: n.price != null ? body.store : null,
          added_by: ALICE.id,
          created_at: naiveUtc(instant.toISOString()),
          updated_at: naiveUtc(instant.toISOString()),
          ...filed,
        }))
        createdItems[listId] = [...(createdItems[listId] ?? []), ...created]
        return json(trip)
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
              purchase_filed: false,
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
          const seeded = SEED_PRICE_HISTORY[itemId]
          const entries =
            seeded ??
            (item.price != null
              ? [
                  {
                    amount: item.price,
                    price_per: item.price_per,
                    store: item.price_store,
                    purchased_at: item.purchased_at,
                    quantity: item.quantity,
                  },
                ]
              : [])
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
  // Anything on the screen whose value is not the test's to fix — the release
  // version is the first — is painted over rather than compared. A baseline
  // that encodes it goes stale on a bump that has nothing to do with the screen.
  options: { mask?: Locator[] } = {},
): Promise<void> {
  const projectName = test.info().project.name
  if (!VISUAL_PROJECTS.has(projectName)) return
  await expect(page).toHaveScreenshot(name, { fullPage: true, ...options })
}

/**
 * Close the undo notice a cart tap leaves behind, before anything is captured.
 *
 * Not because of the draining bar: `toHaveScreenshot` runs with
 * `animations: 'disabled'`, so a finite CSS animation is fast-forwarded to its
 * end and the bar lands at the same width every run. What is not deterministic
 * is whether the toast is *there at all* — it dismisses itself on a wall-clock
 * timer, and a retry cannot bring a dismissed toast back, so a slow runner is a
 * hard failure rather than a flake that recovers.
 *
 * Lives here rather than in each spec because the accessible name it clicks is
 * one rule, and three copies of it are three places to miss when it changes.
 */
export async function dismissUndoNotice(page: Page): Promise<void> {
  const toast = page.locator('.toast')
  await toast.getByRole('button', { name: 'Cerrar' }).click()
  await expect(toast).toBeHidden()
}

// ── Gemini network-boundary mock ─────────────────────────────────────────────
// receiptAi.ts calls the Firebase AI SDK, which — regardless of GoogleAIBackend
// vs VertexAIBackend — issues a real fetch to this proxy domain. Intercepting
// it here (rather than mocking receiptAi.ts itself) keeps the test exercising
// the whole path a paper takes: client parse, backend match, the close sheet,
// and the close. Only the non-deterministic Gemini call is stubbed.
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
