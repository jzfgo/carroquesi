import { test as base, expect, type Page } from '@playwright/test'
import type { ApiList, ListItem, Member } from '../src/types'

const BACKEND = 'http://localhost:8000'

// ── Seed data (mirrors scripts/seed.py) ──────────────────────────────────────

export const ALICE = {
  id: 'seed-user-alice',
  firebase_uid: 'seed-alice',
  display_name: 'Alice (seed)',
  email: 'alice@seed.local',
  photo_url: null,
  features: [] as string[],
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

// ── Route installer ───────────────────────────────────────────────────────────

export async function installApiMocks(page: Page): Promise<void> {
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
        if (method === 'GET') return json(SEED_ITEMS[listId] ?? [])
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
