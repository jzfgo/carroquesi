# Offline Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CarroQueSí PWA usable offline — show cached list/dashboard data immediately on load (stale-while-revalidate), and queue core list mutations (add, toggle, rename, edit, delete) in IndexedDB for replay when connectivity returns.

**Architecture:** All offline logic lives in React and utility modules; no service worker changes. A new `offlineQueue` IndexedDB module stores mutations. A new `useOffline` hook drains the queue on reconnect and exposes `{ isOffline, pendingCount }`. `useListItems` seeds state from localStorage on mount before the backend responds, and enqueues mutations on network error instead of rolling back. `DashboardScreen` does the same stale-while-revalidate pattern for the list-of-lists.

**Tech Stack:** React 19, TypeScript, Vitest, IndexedDB (native browser), localStorage, `fake-indexeddb` (test only)

---

## File Map

| Status | File | What changes |
|---|---|---|
| Create | `frontend/src/lib/networkError.ts` | `isNetworkError(err)` utility |
| Create | `frontend/src/lib/networkError.test.ts` | Unit tests |
| Create | `frontend/src/lib/offlineQueue.ts` | IndexedDB queue: enqueue / getAll / remove |
| Create | `frontend/src/lib/offlineQueue.test.ts` | Unit tests with fake-indexeddb |
| Create | `frontend/src/hooks/useOffline.ts` | Online state + queue drain orchestration |
| Create | `frontend/src/hooks/useOffline.test.tsx` | Hook tests |
| Modify | `frontend/src/hooks/useListItems.ts` | Stale-while-revalidate cache + write queue |
| Modify | `frontend/src/hooks/useListItems.test.tsx` | New tests for cache and queue behavior |
| Modify | `frontend/src/components/DashboardScreen.tsx` | Stale-while-revalidate + offline banner |
| Modify | `frontend/src/components/DashboardScreen.test.tsx` | New cache + banner tests |
| Modify | `frontend/src/components/ListScreen.tsx` | Wire useOffline, offline banner, disable receipt CTA |
| Modify | `frontend/src/components/SmartInputBar.tsx` | `isOffline` prop disables barcode button |
| Modify | `frontend/src/components/SmartInputBar.test.tsx` | Barcode button disabled when offline |
| Modify | `frontend/src/components/LogPriceSheet.tsx` | `isOffline` prop disables save |
| Modify | `frontend/src/components/LogPriceSheet.test.tsx` | Save disabled when offline |

---

## Task 1: Install `fake-indexeddb`

**Files:**
- Modify: `frontend/package.json` (via npm)

- [ ] **Step 1: Add dev dependency**

```bash
cd frontend && npm install --save-dev fake-indexeddb
```

Expected output: `added 1 package` (or similar).

- [ ] **Step 2: Verify install**

```bash
node -e "require('fake-indexeddb/auto'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore: add fake-indexeddb for offline queue tests"
```

---

## Task 2: `networkError.ts` — detect offline vs server errors

**Files:**
- Create: `frontend/src/lib/networkError.ts`
- Create: `frontend/src/lib/networkError.test.ts`

`apiFetch` in `api.ts` throws two kinds of errors:
- `ApiError extends Error` — server responded with an error status (400, 404, 409, etc.)
- `TypeError` — `fetch()` itself threw because the network is unavailable ("Failed to fetch")

Only `TypeError` means offline. `ApiError` must still roll back normally.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/networkError.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { ApiError } from './api'
import { isNetworkError } from './networkError'

describe('isNetworkError', () => {
  test('returns true for TypeError', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  test('returns false for ApiError', () => {
    expect(isNetworkError(new ApiError(404, 'Not Found'))).toBe(false)
  })

  test('returns false for plain Error', () => {
    expect(isNetworkError(new Error('something'))).toBe(false)
  })

  test('returns false for null', () => {
    expect(isNetworkError(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm run test -- src/lib/networkError.test.ts
```

Expected: 4 failures (cannot find module `./networkError`).

- [ ] **Step 3: Implement `networkError.ts`**

Create `frontend/src/lib/networkError.ts`:

```ts
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm run test -- src/lib/networkError.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/networkError.ts frontend/src/lib/networkError.test.ts
git commit -m "feat: add isNetworkError utility"
```

---

## Task 3: `offlineQueue.ts` — IndexedDB write queue

**Files:**
- Create: `frontend/src/lib/offlineQueue.ts`
- Create: `frontend/src/lib/offlineQueue.test.ts`

Stores pending mutations in IndexedDB so they survive page refreshes. Dispatches `cqs:queue-changed` on `window` after each enqueue/remove so `useOffline` can update its `pendingCount`.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/offlineQueue.test.ts`:

```ts
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import { enqueue, getAll, remove } from './offlineQueue'
import type { QueuedOp } from './offlineQueue'

// Clear the store between tests
beforeEach(async () => {
  const ops = await getAll()
  for (const op of ops) await remove(op.id)
})

describe('offlineQueue', () => {
  test('enqueue stores an op with generated id and enqueuedAt', async () => {
    const before = Date.now()
    const op = await enqueue({ listId: 'l1', type: 'addItem', payload: { name: 'Leche' } })
    expect(op.id).toBeTruthy()
    expect(op.enqueuedAt).toBeGreaterThanOrEqual(before)
    expect(op.listId).toBe('l1')
    expect(op.type).toBe('addItem')
  })

  test('getAll returns all stored ops', async () => {
    await enqueue({ listId: 'l1', type: 'addItem', payload: { name: 'A' } })
    await enqueue({ listId: 'l1', type: 'deleteItem', payload: { itemId: 'i1' } })
    const all = await getAll()
    expect(all).toHaveLength(2)
  })

  test('remove deletes a specific op', async () => {
    const op = await enqueue({ listId: 'l1', type: 'addItem', payload: { name: 'A' } })
    await remove(op.id)
    const all = await getAll()
    expect(all).toHaveLength(0)
  })

  test('enqueue sets tempId when provided', async () => {
    const op = await enqueue({ listId: 'l1', type: 'addItem', tempId: 'tmp-99', payload: {} })
    expect(op.tempId).toBe('tmp-99')
  })

  test('enqueue dispatches cqs:queue-changed event', async () => {
    let fired = false
    window.addEventListener('cqs:queue-changed', () => { fired = true }, { once: true })
    await enqueue({ listId: 'l1', type: 'addItem', payload: {} })
    expect(fired).toBe(true)
  })

  test('remove dispatches cqs:queue-changed event', async () => {
    const op = await enqueue({ listId: 'l1', type: 'addItem', payload: {} })
    let fired = false
    window.addEventListener('cqs:queue-changed', () => { fired = true }, { once: true })
    await remove(op.id)
    expect(fired).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm run test -- src/lib/offlineQueue.test.ts
```

Expected: failures (module not found).

- [ ] **Step 3: Implement `offlineQueue.ts`**

Create `frontend/src/lib/offlineQueue.ts`:

```ts
export interface QueuedOp {
  id: string
  listId: string
  tempId?: string
  type: 'addItem' | 'updateItem' | 'deleteItem'
  payload: unknown
  enqueuedAt: number
}

const DB_NAME = 'cqs_offline'
const STORE_NAME = 'offline_ops'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueue(
  op: Omit<QueuedOp, 'id' | 'enqueuedAt'>,
): Promise<QueuedOp> {
  const full: QueuedOp = {
    ...op,
    id: crypto.randomUUID(),
    enqueuedAt: Date.now(),
  }
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(full)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  window.dispatchEvent(new CustomEvent('cqs:queue-changed'))
  return full
}

export async function getAll(): Promise<QueuedOp[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result as QueuedOp[])
    req.onerror = () => reject(req.error)
  })
}

export async function remove(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  window.dispatchEvent(new CustomEvent('cqs:queue-changed'))
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm run test -- src/lib/offlineQueue.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/offlineQueue.ts frontend/src/lib/offlineQueue.test.ts
git commit -m "feat: add IndexedDB offline queue"
```

---

## Task 4: `useOffline.ts` — online state + drain orchestration

**Files:**
- Create: `frontend/src/hooks/useOffline.ts`
- Create: `frontend/src/hooks/useOffline.test.tsx`

This hook:
1. Tracks `isOffline` via `navigator.onLine` + `window.online/offline` events
2. Tracks `pendingCount` (queue depth for the current list) via `cqs:queue-changed` events
3. On `window.online`, drains the queue for the current list sequentially:
   - Replays `addItem`, `updateItem`, `deleteItem` ops in insertion order
   - Rewrites temp IDs to real IDs as `addItem` ops succeed
   - Skips server-error failures (counts them), stops on network error
   - Calls `onDrained()` after drain, then shows failure toast if any failed

- [ ] **Step 1: Write failing tests**

Create `frontend/src/hooks/useOffline.test.tsx`:

```ts
import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import { enqueue, getAll, remove } from '../lib/offlineQueue'
import { useOffline } from './useOffline'

vi.mock('../lib/api')

const mockGetToken = vi.fn().mockResolvedValue('token')
const mockOnDrained = vi.fn()
const mockShowToast = vi.fn()

const defaultParams = {
  listId: 'l1',
  getToken: mockGetToken,
  onDrained: mockOnDrained,
  showToast: mockShowToast,
}

beforeEach(async () => {
  vi.clearAllMocks()
  const ops = await getAll()
  for (const op of ops) await remove(op.id)
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
})

describe('useOffline — online state', () => {
  it('isOffline is false when navigator.onLine is true', () => {
    const { result } = renderHook(() => useOffline(defaultParams))
    expect(result.current.isOffline).toBe(false)
  })

  it('isOffline is true when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOffline(defaultParams))
    expect(result.current.isOffline).toBe(true)
  })

  it('isOffline becomes true on offline event', () => {
    const { result } = renderHook(() => useOffline(defaultParams))
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current.isOffline).toBe(true)
  })

  it('isOffline becomes false on online event', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOffline(defaultParams))
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(result.current.isOffline).toBe(false)
  })
})

describe('useOffline — pendingCount', () => {
  it('starts at 0 with empty queue', async () => {
    const { result } = renderHook(() => useOffline(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('updates when an op is enqueued', async () => {
    const { result } = renderHook(() => useOffline(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    await act(() => enqueue({ listId: 'l1', type: 'addItem', payload: {} }))
    await waitFor(() => expect(result.current.pendingCount).toBe(1))
  })
})

describe('useOffline — drain on reconnect', () => {
  it('drains addItem ops and calls onDrained', async () => {
    const createdItem = { id: 'real-1', list_id: 'l1', name: 'Leche', quantity: null, brand: null, stores: [], purchased: false, purchased_at: null, ean: null, price: null, price_per: null, price_store: null, added_by: '', created_at: '', updated_at: '' }
    vi.mocked(api.createItem).mockResolvedValue(createdItem as never)
    await enqueue({ listId: 'l1', type: 'addItem', tempId: 'tmp-1', payload: { name: 'Leche' } })

    const { result } = renderHook(() => useOffline(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(1))

    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(mockOnDrained).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('shows toast when a server error causes a failure', async () => {
    vi.mocked(api.createItem).mockRejectedValue(new api.ApiError(500, 'Server Error'))
    await enqueue({ listId: 'l1', type: 'addItem', payload: { name: 'Leche' } })

    renderHook(() => useOffline(defaultParams))
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('cambio')))
  })

  it('does not drain ops for a different listId', async () => {
    vi.mocked(api.createItem).mockResolvedValue({} as never)
    await enqueue({ listId: 'l2', type: 'addItem', payload: { name: 'Leche' } })

    renderHook(() => useOffline(defaultParams))
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(api.createItem).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm run test -- src/hooks/useOffline.test.tsx
```

Expected: failures (module not found).

- [ ] **Step 3: Implement `useOffline.ts`**

Create `frontend/src/hooks/useOffline.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { createItem, deleteItem, updateItem } from '../lib/api'
import type { ListItem } from '../types'
import { isNetworkError } from '../lib/networkError'
import { getAll, remove } from '../lib/offlineQueue'

interface Params {
  listId: string
  getToken: () => Promise<string>
  onDrained: () => void
  showToast: (msg: string) => void
}

export function useOffline({ listId, getToken, onDrained, showToast }: Params) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)

  const onDrainedRef = useRef(onDrained)
  const showToastRef = useRef(showToast)
  useEffect(() => { onDrainedRef.current = onDrained }, [onDrained])
  useEffect(() => { showToastRef.current = showToast }, [showToast])

  const refreshCount = useCallback(async () => {
    const ops = await getAll()
    setPendingCount(ops.filter((op) => op.listId === listId).length)
  }, [listId])

  useEffect(() => {
    void refreshCount()
    window.addEventListener('cqs:queue-changed', refreshCount)
    return () => window.removeEventListener('cqs:queue-changed', refreshCount)
  }, [refreshCount])

  const drain = useCallback(async () => {
    const ops = await getAll()
    const myOps = ops
      .filter((op) => op.listId === listId)
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)

    const tempIdMap = new Map<string, string>()
    let failures = 0

    for (const op of myOps) {
      try {
        if (op.type === 'addItem') {
          const p = op.payload as Parameters<typeof createItem>[2]
          const created = (await createItem(getToken, op.listId, p)) as ListItem
          if (op.tempId) tempIdMap.set(op.tempId, created.id)
        } else if (op.type === 'updateItem') {
          let p = op.payload as { itemId: string; patch: Parameters<typeof updateItem>[3] }
          const realId = tempIdMap.get(p.itemId)
          if (realId) p = { ...p, itemId: realId }
          await updateItem(getToken, op.listId, p.itemId, p.patch)
        } else if (op.type === 'deleteItem') {
          let p = op.payload as { itemId: string }
          const realId = tempIdMap.get(p.itemId)
          if (realId) p = { ...p, itemId: realId }
          await deleteItem(getToken, op.listId, p.itemId)
        }
        await remove(op.id)
      } catch (err) {
        if (isNetworkError(err)) break
        await remove(op.id)
        failures++
      }
    }

    onDrainedRef.current()
    if (failures > 0) {
      showToastRef.current(
        `${failures} ${failures === 1 ? 'cambio no se pudo' : 'cambios no se pudieron'} sincronizar`,
      )
    }
  }, [listId, getToken])

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false)
      void drain()
    }
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [drain])

  return { isOffline, pendingCount }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm run test -- src/hooks/useOffline.test.tsx
```

Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useOffline.ts frontend/src/hooks/useOffline.test.tsx
git commit -m "feat: add useOffline hook with drain orchestration"
```

---

## Task 5: `useListItems` — stale-while-revalidate read cache

**Files:**
- Modify: `frontend/src/hooks/useListItems.ts`
- Modify: `frontend/src/hooks/useListItems.test.tsx`

On mount, seed `items` and `members` from `localStorage` before awaiting the backend. This makes cold starts invisible and provides a usable offline state.

- [ ] **Step 1: Add new tests for cache behavior**

Add to `frontend/src/hooks/useListItems.test.tsx` (append after existing tests):

```ts
describe('useListItems — stale-while-revalidate cache', () => {
  it('renders cached items immediately before fetch resolves', async () => {
    // Pre-populate cache
    const cached = {
      items: [{ ...item1, name: 'Cached Leche' }],
      members: mockRawMembers,
    }
    localStorage.setItem('cqs_list_cache_list-1', JSON.stringify(cached))

    let resolveItems!: (v: unknown) => void
    vi.mocked(api.getListItems).mockReturnValue(new Promise((r) => { resolveItems = r }))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )

    // Should immediately show cached items in success state (no spinner)
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items[0].name).toBe('Cached Leche')

    // Resolve fresh data
    resolveItems([item1] as never)
    await waitFor(() => expect(result.current.items[0].name).toBe('Leche'))

    localStorage.removeItem('cqs_list_cache_list-1')
  })

  it('saves fresh data to cache after successful fetch', async () => {
    localStorage.removeItem('cqs_list_cache_list-1')
    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    const raw = localStorage.getItem('cqs_list_cache_list-1')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as { items: ListItem[] }
    expect(parsed.items[0].name).toBe('Leche')
    localStorage.removeItem('cqs_list_cache_list-1')
  })

  it('shows cached data on network error instead of error state', async () => {
    const cached = {
      items: [{ ...item1, name: 'Cached Leche' }],
      members: mockRawMembers,
    }
    localStorage.setItem('cqs_list_cache_list-1', JSON.stringify(cached))

    vi.mocked(api.getListItems).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(api.getListMembers).mockRejectedValue(new TypeError('Failed to fetch'))
    vi.mocked(api.getListUpdatedAt).mockRejectedValue(new TypeError('Failed to fetch'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items[0].name).toBe('Cached Leche')

    localStorage.removeItem('cqs_list_cache_list-1')
  })
})
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd frontend && npm run test -- src/hooks/useListItems.test.tsx
```

Expected: 3 new failures, existing tests still pass.

- [ ] **Step 3: Add cache helpers and update `fetchAll` in `useListItems.ts`**

Add these helpers near the top of `frontend/src/hooks/useListItems.ts` (after the imports):

```ts
function loadListCache(listId: string): { items: ListItem[]; members: BackendMember[] } | null {
  try {
    const raw = localStorage.getItem(`cqs_list_cache_${listId}`)
    return raw ? JSON.parse(raw) as { items: ListItem[]; members: BackendMember[] } : null
  } catch { return null }
}

function saveListCache(listId: string, data: { items: ListItem[]; members: BackendMember[] }) {
  try { localStorage.setItem(`cqs_list_cache_${listId}`, JSON.stringify(data)) } catch {}
}
```

Replace the `fetchAll` callback in `useListItems.ts`:

```ts
const fetchAll = useCallback(async () => {
  const cached = loadListCache(listId)
  if (cached) {
    const map = new Map<string, Member>()
    cached.members.forEach((m, i) => map.set(m.user_id, toMember(m, i)))
    setItems(cached.items)
    setMembers(map)
    setStatus('success')
  } else {
    setStatus('loading')
  }
  try {
    const [rawItems, rawMembers, updatedAtData] = await Promise.all([
      getListItems(getToken, listId) as Promise<ListItem[]>,
      getListMembers(getToken, listId) as Promise<BackendMember[]>,
      getListUpdatedAt(getToken, listId) as Promise<{ updated_at: string }>,
    ])
    setItems(rawItems)
    const map = new Map<string, Member>()
    rawMembers.forEach((m, i) => map.set(m.user_id, toMember(m, i)))
    setMembers(map)
    lastUpdatedAt.current = updatedAtData.updated_at
    saveListCache(listId, { items: rawItems, members: rawMembers })
    setStatus('success')
  } catch {
    if (!cached) setStatus('error')
  }
}, [listId, getToken])
```

- [ ] **Step 4: Run all `useListItems` tests**

```bash
cd frontend && npm run test -- src/hooks/useListItems.test.tsx
```

Expected: all pass (including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useListItems.ts frontend/src/hooks/useListItems.test.tsx
git commit -m "feat: stale-while-revalidate cache in useListItems"
```

---

## Task 6: `useListItems` — write queue on network error

**Files:**
- Modify: `frontend/src/hooks/useListItems.ts`
- Modify: `frontend/src/hooks/useListItems.test.tsx`

When any of the 6 mutations throws a network error (`TypeError`), enqueue the op in IndexedDB and keep the optimistic UI state instead of rolling back. Server errors (`ApiError`) still roll back as before.

Note: `removeItem` currently calls the API before updating state. This task makes it optimistic (state first, then API) to match the other mutations.

- [ ] **Step 1: Add new tests**

First, add these two lines near the **top** of `frontend/src/hooks/useListItems.test.tsx` (after the existing imports and before the first `vi.mock` call). `vi.mock` is hoisted by vitest so it must be at module level, not inside a describe block:

```ts
import * as offlineQueue from '../lib/offlineQueue'
vi.mock('../lib/offlineQueue', () => ({
  enqueue: vi.fn().mockResolvedValue({ id: 'q1', listId: 'list-1', type: 'addItem', payload: {}, enqueuedAt: 0 }),
}))
```

Then append the new describe block at the bottom of the file:

```ts
describe('useListItems — write queue on network error', () => {
  it('addItem: keeps temp item in list on network error', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.createItem).mockRejectedValue(new TypeError('Failed to fetch'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.items).toHaveLength(1)

    await act(async () => {
      await result.current.addItem({ name: 'Nueva', quantity: null, brand: null, stores: [] })
    })

    // temp item should still be in list (not rolled back)
    expect(result.current.items).toHaveLength(2)
    expect(result.current.items.some(i => i.name === 'Nueva')).toBe(true)
    expect(offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addItem', listId: 'list-1' }),
    )
  })

  it('addItem: removes temp item on server error (ApiError)', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.createItem).mockRejectedValue(new ApiError(500, 'Server Error'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.addItem({ name: 'Nueva', quantity: null, brand: null, stores: [] })
    })

    // temp item should be removed (rolled back)
    expect(result.current.items).toHaveLength(1)
    expect(offlineQueue.enqueue).not.toHaveBeenCalled()
  })

  it('togglePurchased: keeps toggled state on network error', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.updateItem).mockRejectedValue(new TypeError('Failed to fetch'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    // item should be marked as purchased (not rolled back)
    expect(result.current.items[0].purchased).toBe(true)
    expect(offlineQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'updateItem', listId: 'list-1' }),
    )
  })

  it('togglePurchased: rolls back on server error', async () => {
    vi.mocked(api.getListItems).mockResolvedValue([item1] as never)
    vi.mocked(api.updateItem).mockRejectedValue(new ApiError(422, 'Unprocessable'))

    const { result } = renderHook(() =>
      useListItems('list-1', mockGetToken, mockShowToast),
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => {
      await result.current.togglePurchased('item-1')
    })

    expect(result.current.items[0].purchased).toBe(false)
    expect(offlineQueue.enqueue).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd frontend && npm run test -- src/hooks/useListItems.test.tsx
```

Expected: 4 new failures.

- [ ] **Step 3: Add `enqueue` + `isNetworkError` imports and update all 6 mutations**

At the top of `frontend/src/hooks/useListItems.ts`, add:

```ts
import { enqueue } from '../lib/offlineQueue'
import { isNetworkError } from '../lib/networkError'
```

**Replace `togglePurchased` catch block:**

```ts
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ listId, type: 'updateItem', payload: { itemId, patch: { purchased: !prevPurchased } } })
        } else {
          setItems(snapshot)
          showToast('No se pudo actualizar el producto')
        }
      }
```

**Replace `addItem` catch block:**

```ts
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ listId, type: 'addItem', tempId, payload: { name: parsed.name, quantity: parsed.quantity, brand: parsed.brand, stores: parsed.stores, ean: parsed.ean ?? null, price: null, price_per: null, price_store: null } })
        } else {
          setItems((prev) => prev.filter((i) => i.id !== tempId))
          if (err instanceof ApiError && err.status === 409) {
            showToast(DUPLICATE_TOAST)
          } else {
            showToast('No se pudo añadir el producto')
          }
        }
      }
```

**Replace `updateTag` catch block:**

```ts
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ listId, type: 'updateItem', payload: { itemId, patch: { [field]: value } } })
        } else {
          setItems(snapshot)
          showToast('No se pudo actualizar el producto')
        }
      }
```

**Replace `updateStores` catch block:**

```ts
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ listId, type: 'updateItem', payload: { itemId, patch: { stores } } })
        } else {
          setItems(snapshot)
          showToast('No se pudo actualizar el producto')
        }
      }
```

**Replace `renameItem` catch block:**

```ts
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ listId, type: 'updateItem', payload: { itemId, patch: { name } } })
        } else {
          setItems(snapshot)
          showToast('No se pudo renombrar el producto')
        }
      }
```

**Replace the entire `removeItem` callback** (make optimistic + add enqueue):

```ts
  const removeItem = useCallback(
    async (itemId: string) => {
      const snapshot = itemsRef.current
      setItems((prev) => prev.filter((i) => i.id !== itemId))
      try {
        await deleteItem(getToken, listId, itemId)
      } catch (err) {
        if (isNetworkError(err)) {
          await enqueue({ listId, type: 'deleteItem', payload: { itemId } })
        } else {
          setItems(snapshot)
          showToast('No se pudo eliminar el producto')
        }
      }
    },
    [getToken, listId, showToast],
  )
```

- [ ] **Step 4: Run all `useListItems` tests**

```bash
cd frontend && npm run test -- src/hooks/useListItems.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useListItems.ts frontend/src/hooks/useListItems.test.tsx
git commit -m "feat: queue list mutations on network error instead of rolling back"
```

---

## Task 7: `DashboardScreen` — stale-while-revalidate + offline banner

**Files:**
- Modify: `frontend/src/components/DashboardScreen.tsx`
- Modify: `frontend/src/components/DashboardScreen.test.tsx`

Seeds `lists` from localStorage before fetch. Shows offline banner when `!navigator.onLine`. Shows toast for create/rename/delete when offline instead of attempting the API.

- [ ] **Step 1: Add new tests**

Append to `frontend/src/components/DashboardScreen.test.tsx`:

```ts
describe('DashboardScreen — offline', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
  })

  it('shows cached lists on network error instead of error state', async () => {
    const cached = [twoLists[0]]
    localStorage.setItem('cqs_dashboard_cache_u1', JSON.stringify(cached))
    vi.mocked(api.getLists).mockRejectedValue(new TypeError('Failed to fetch'))

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())
    expect(screen.queryByText('No se pudieron cargar tus listas')).not.toBeInTheDocument()

    localStorage.removeItem('cqs_dashboard_cache_u1')
  })

  it('shows offline banner when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText(/sin conexión/i)).toBeInTheDocument())
  })

  it('saves fetched lists to cache', async () => {
    localStorage.removeItem('cqs_dashboard_cache_u1')
    vi.mocked(api.getLists).mockResolvedValue(twoLists as never)

    render(<DashboardScreen />)
    await waitFor(() => expect(screen.getByText('Mercado')).toBeInTheDocument())

    const raw = localStorage.getItem('cqs_dashboard_cache_u1')
    expect(raw).not.toBeNull()
    localStorage.removeItem('cqs_dashboard_cache_u1')
  })
})
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd frontend && npm run test -- src/components/DashboardScreen.test.tsx
```

Expected: 3 new failures.

- [ ] **Step 3: Update `DashboardScreen.tsx`**

Add cache helpers after the `applyOrder` function in `DashboardScreen.tsx`:

```ts
function loadDashboardCache(userId: string): ApiList[] | null {
  try {
    const raw = localStorage.getItem(`cqs_dashboard_cache_${userId}`)
    return raw ? JSON.parse(raw) as ApiList[] : null
  } catch { return null }
}

function saveDashboardCache(userId: string, lists: ApiList[]) {
  try { localStorage.setItem(`cqs_dashboard_cache_${userId}`, JSON.stringify(lists)) } catch {}
}
```

Add `isOffline` state near the other state declarations:

```ts
const [isOffline, setIsOffline] = useState(!navigator.onLine)
```

Add an effect to track online/offline (after the existing `useEffect` for `menuOpen`):

```ts
useEffect(() => {
  const onOnline = () => setIsOffline(false)
  const onOffline = () => setIsOffline(true)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}, [])
```

Replace `fetchLists` with a stale-while-revalidate version:

```ts
const fetchLists = useCallback(async (silent = false) => {
  const cached = loadDashboardCache(user!.id)
  if (cached) {
    const ordered = applyOrder(cached, loadOrder(user!.id))
    setLists(ordered)
  } else if (!silent) {
    setLists(null)
    setFetchError(false)
  }
  try {
    const data = (await getLists(getToken)) as ApiList[]
    const ordered = applyOrder(data, loadOrder(user!.id))
    setLists(ordered)
    saveDashboardCache(user!.id, data)
  } catch {
    if (!cached && !silent) setFetchError(true)
  }
}, [getToken, user])
```

Guard `handleCreate`, `handleRename`, and `handleDelete` with offline check. In `handleCreate`:

```ts
const handleCreate = useCallback(
  async (name: string) => {
    if (!navigator.onLine) { setToast('No disponible sin conexión'); return }
    await createList(getToken, { name, emoji: randomEmoji() })
    await fetchLists()
  },
  [getToken, fetchLists],
)
```

In `handleRename` (add at top of the callback, before optimistic update):

```ts
if (!navigator.onLine) { setToast('No disponible sin conexión'); return }
```

In `handleDelete` (add at top, before `setActiveList(null)`):

```ts
if (!navigator.onLine) { setToast('No disponible sin conexión'); return }
```

Add the offline banner to the JSX, right after `<header>` inside the main `return` (the non-loading, non-error path). Add it before `<main>`:

```tsx
{isOffline && (
  <div className="dashboard-screen__offline-banner" role="status">
    Sin conexión
  </div>
)}
```

Add a CSS rule in `DashboardScreen.css`:

```css
.dashboard-screen__offline-banner {
  background: var(--color-text-secondary);
  color: #fff;
  font-size: 0.75rem;
  text-align: center;
  padding: 4px 0;
}
```

- [ ] **Step 4: Run all `DashboardScreen` tests**

```bash
cd frontend && npm run test -- src/components/DashboardScreen.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardScreen.tsx frontend/src/components/DashboardScreen.test.tsx frontend/src/components/DashboardScreen.css
git commit -m "feat: stale-while-revalidate and offline banner in DashboardScreen"
```

---

## Task 8: `ListScreen` — wire `useOffline`, offline banner, disable receipt CTA

**Files:**
- Modify: `frontend/src/components/ListScreen.tsx`

No dedicated test task here — the wiring is covered by integration behavior; the underlying hooks are tested separately.

- [ ] **Step 1: Import `useOffline` and wire it**

At the top of `ListScreen.tsx`, add the import:

```ts
import { useOffline } from '../hooks/useOffline'
```

Inside the `ListScreen` component body, after `const { status, items, members, ... } = useListItems(...)`, add:

```ts
const { isOffline, pendingCount } = useOffline({
  listId,
  getToken,
  onDrained: retry,
  showToast,
})
```

- [ ] **Step 2: Add offline banner JSX**

Add the offline banner immediately after `<ListHeader .../>` (before `<FilterBar>`):

```tsx
{isOffline && (
  <div className="list-screen__offline-banner" role="status">
    Sin conexión{pendingCount > 0 ? ` · ${pendingCount} ${pendingCount === 1 ? 'cambio pendiente' : 'cambios pendientes'}` : ' · Los cambios se sincronizarán al reconectar'}
  </div>
)}
```

Add CSS in `ListScreen.css`:

```css
.list-screen__offline-banner {
  background: var(--color-text-secondary);
  color: #fff;
  font-size: 0.75rem;
  text-align: center;
  padding: 4px 8px;
  position: sticky;
  top: 0;
  z-index: 10;
}
```

- [ ] **Step 3: Disable receipt scan CTA when offline**

Find the receipt scan CTA in `ListScreen.tsx` (around line 494–501):

```tsx
footer={allUnpurchasedCount === 0 && items.length > 0 && !receiptScanResult ? (
  <div className="receipt-scan-cta">
    <button
      className="receipt-scan-cta__btn"
      onClick={...}
      disabled={receiptUploading}
    >
```

Add `isOffline` to the `disabled` condition:

```tsx
disabled={receiptUploading || isOffline}
```

- [ ] **Step 4: Pass `isOffline` to `SmartInputBar` and `LogPriceSheet`**

Find the `<SmartInputBar` render (around line 576) and add the prop:

```tsx
<SmartInputBar
  ...
  isOffline={isOffline}
/>
```

Find the `<LogPriceSheet` render (around line 657) and add the prop:

```tsx
<LogPriceSheet
  ...
  isOffline={isOffline}
/>
```

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
cd frontend && npm run test
```

Expected: all tests pass. TypeScript errors in `SmartInputBar` and `LogPriceSheet` are expected at this point (prop not yet accepted).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ListScreen.tsx frontend/src/components/ListScreen.css
git commit -m "feat: wire useOffline into ListScreen with banner and disabled receipt CTA"
```

---

## Task 9: `SmartInputBar` — disable barcode button when offline

**Files:**
- Modify: `frontend/src/components/SmartInputBar.tsx`
- Modify: `frontend/src/components/SmartInputBar.test.tsx`

- [ ] **Step 1: Write failing test**

Append to `frontend/src/components/SmartInputBar.test.tsx`:

```ts
test('barcode scan button is disabled when isOffline is true', () => {
  render(
    <SmartInputBar
      value="" parsed={parseInput('')} items={NO_ITEMS}
      suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
      onScanRequest={noop} onEanSearch={noop} isOffline={true}
    />,
  )
  expect(screen.getByRole('button', { name: /escanear código de barras/i })).toBeDisabled()
})

test('barcode scan button is enabled when isOffline is false', () => {
  render(
    <SmartInputBar
      value="" parsed={parseInput('')} items={NO_ITEMS}
      suggestions={[]} onChange={noop} onSubmit={noop} onClear={noop}
      onScanRequest={noop} onEanSearch={noop} isOffline={false}
    />,
  )
  expect(screen.getByRole('button', { name: /escanear código de barras/i })).not.toBeDisabled()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm run test -- src/components/SmartInputBar.test.tsx
```

Expected: 2 failures (prop not accepted).

- [ ] **Step 3: Add `isOffline` prop to `SmartInputBar`**

In `frontend/src/components/SmartInputBar.tsx`, add `isOffline?: boolean` to the `Props` interface:

```ts
interface Props {
  ...
  isOffline?: boolean
}
```

Destructure it in the function signature:

```ts
export function SmartInputBar({ ..., isOffline = false }: Props) {
```

Find the camera scan button (around line 197–200) and add `disabled`:

```tsx
<button
  className="smart-input__scan"
  onClick={onScanRequest}
  aria-label="Escanear código de barras"
  disabled={isOffline}
>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm run test -- src/components/SmartInputBar.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SmartInputBar.tsx frontend/src/components/SmartInputBar.test.tsx
git commit -m "feat: disable barcode scan button when offline"
```

---

## Task 10: `LogPriceSheet` — disable save when offline

**Files:**
- Modify: `frontend/src/components/LogPriceSheet.tsx`
- Modify: `frontend/src/components/LogPriceSheet.test.tsx`

- [ ] **Step 1: Write failing test**

Append to `frontend/src/components/LogPriceSheet.test.tsx`:

```ts
describe('LogPriceSheet — offline', () => {
  const offlineProps = {
    item: BASE_ITEM,
    initialAmount: null,
    initialPricePer: null as null,
    initialStore: null,
    onSave: vi.fn(),
    onClose: vi.fn(),
  }

  it('save button is disabled when isOffline is true', () => {
    render(<LogPriceSheet {...offlineProps} isOffline={true} />)
    // Fill in a valid amount so canSave would normally be true
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '2.50' } })
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
  })

  it('shows offline message when isOffline is true', () => {
    render(<LogPriceSheet {...offlineProps} isOffline={true} />)
    expect(screen.getByText(/disponible con conexión/i)).toBeInTheDocument()
  })

  it('save button is enabled when isOffline is false and amount is valid', () => {
    render(<LogPriceSheet {...offlineProps} isOffline={false} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '2.50' } })
    expect(screen.getByRole('button', { name: /guardar/i })).not.toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm run test -- src/components/LogPriceSheet.test.tsx
```

Expected: 3 failures.

- [ ] **Step 3: Add `isOffline` prop to `LogPriceSheet`**

In `frontend/src/components/LogPriceSheet.tsx`, add to the `Props` interface:

```ts
interface Props {
  ...
  isOffline?: boolean
}
```

Destructure it:

```ts
export default function LogPriceSheet({ ..., isOffline = false }: Props) {
```

Update the save button `disabled` condition:

```tsx
<button className="lps__save" onClick={handleSave} disabled={!canSave || isOffline} type="button">
  Guardar
</button>
```

Add the offline message right above the save button (inside the same container):

```tsx
{isOffline && (
  <p className="lps__offline-msg">Disponible con conexión</p>
)}
```

Add CSS in `LogPriceSheet.css`:

```css
.lps__offline-msg {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-align: center;
  margin: 0 0 8px;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm run test -- src/components/LogPriceSheet.test.tsx
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LogPriceSheet.tsx frontend/src/components/LogPriceSheet.test.tsx frontend/src/components/LogPriceSheet.css
git commit -m "feat: disable price logging when offline"
```

---

## Task 11: Final validation

- [ ] **Step 1: Run full test suite**

```bash
cd frontend && npm run test
```

Expected: all 485+ tests pass (36+ files).

- [ ] **Step 2: Run typecheck**

```bash
just frontend typecheck
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Remove offline support from TODO.md**

In `TODO.md`, remove the line:

```
- [ ] **Offline support** — PWA is installable but data mutations while offline are not queued; add a service-worker write queue (background sync)
```

- [ ] **Step 5: Final commit**

```bash
git add TODO.md
git commit -m "chore: remove offline support from TODO — implemented"
```
