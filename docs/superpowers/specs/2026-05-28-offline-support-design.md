# Offline Support Design

**Date:** 2026-05-28  
**Status:** Approved

## Overview

Add offline support to the CarroQueSí PWA. Users should be able to view cached list data and perform core list mutations (add, toggle purchased, rename, edit tags/stores, delete) while offline. Changes are queued locally and replayed when connectivity returns. Receipt scanning and barcode lookup remain online-only.

## Approach

In-app write queue (IndexedDB) + in-app read cache (localStorage). No service worker changes — the SW stays NetworkOnly for all API calls; all offline logic lives in React and utility modules.

**Why not Background Sync:** Background Sync has no reliable support on iOS Safari (the primary mobile target). Auth tokens cannot be easily passed through the service worker. The in-app queue handles both concerns cleanly.

## Read Caching

### List screen

`useListItems.fetchAll` saves `{ items, members }` to `localStorage` as `cqs_list_cache_{listId}` on every successful fetch. On network error during initial load, hydrates state from the cache and sets `isOffline: true` instead of going to the error state. The 5s `updated-at` poll already swallows errors silently — no change needed.

### Dashboard

`DashboardScreen.fetchLists` saves the `ApiList[]` to `localStorage` as `cqs_dashboard_cache_{userId}` on every successful fetch. On network error, loads from cache instead of setting `fetchError: true`.

### Dashboard counts while offline

`item_count` and `purchased_count` on each `ApiList` are server-computed and part of the cached snapshot. They will be stale if the user makes list mutations while offline. This is acceptable — the list screen computes counts client-side from the live items array and stays accurate. Dashboard counts self-correct on reconnect.

No TTL on either cache — stale data is always preferable to an error screen for this use case.

## Write Queue

### Scope

All six mutations in `useListItems` are queued on network error:
- `addItem`
- `togglePurchased`
- `renameItem`
- `updateTag`
- `updateStores`
- `removeItem`

Dashboard mutations (create/rename/delete list) are **not** queued — they show a toast "No disponible sin conexión" when tapped offline.

Price logging (`logPrice`, `updatePrice`, `deletePrice`) is **not** queued — too dependent on server-side state. The `LogPriceSheet` shows "Disponible con conexión" and disables save when offline.

### Queue entry shape

```ts
interface QueuedOp {
  id: string        // crypto.randomUUID()
  listId: string
  tempId?: string   // set for addItem ops — the tmp-{ts} client-side id
  type: 'addItem' | 'updateItem' | 'deleteItem'
  payload: unknown
  enqueuedAt: number
}
```

Stored in IndexedDB, store name `offline_ops`. Survives page refreshes.

### Optimistic state on network error

When `apiFetch` throws a `TypeError` (network error, detected via `isNetworkError(err)`), the mutation handler enqueues the op and **keeps** the optimistic UI state instead of rolling back. When `apiFetch` throws an `ApiError` (server responded with an error code), the existing rollback behaviour is unchanged.

### Temp ID resolution

`addItem` creates items with a `tmp-{timestamp}` ID client-side. During queue drain, after a successful `addItem` replay, the returned real ID is mapped from the temp ID. Any subsequent queued ops referencing that temp ID are rewritten before being sent.

### Drain on reconnect

`useOffline` listens to `window.online`. On reconnect:

1. Drain the queue **sequentially** (insertion order)
2. For each `addItem` success, build `tempId → realId` and rewrite downstream ops
3. For each failure (any non-network error), skip and increment a failure counter
4. After drain, trigger a full re-fetch of list items to reconcile server state
5. If failure counter > 0, show toast: `"X cambios no se pudieron sincronizar"`
6. If all ops succeeded, no toast (silent sync)

### Conflict behaviour (last write wins)

- **Concurrent adds** — no conflict; each creates a new server-side ID
- **Update/delete on a server-deleted item** — returns 404/422 → counted as failure, toast shown
- **Concurrent edits to the same item** — queued op applied last, overwrites the other user's change; the re-fetch after drain shows the final server state to both users

This is last-write-wins, standard for collaborative apps without CRDT/OT. Acceptable for a grocery list.

## Offline Indicators & Disabled Features

### Offline banner

Thin bar at the top of `ListScreen` and `DashboardScreen` when `!navigator.onLine`:

> "Sin conexión · Los cambios se sincronizarán al reconectar"

Disappears automatically when back online.

### Pending badge

Inline with the banner: `"3 cambios pendientes"`. Updates as ops are enqueued/drained.

### Disabled features when offline

| Feature | Behaviour |
|---|---|
| Receipt scan CTA | Hidden (unpurchased-empty state) |
| Barcode camera button (SmartInputBar) | Disabled with visual indicator |
| Log price / edit price (LogPriceSheet) | Save disabled, "Disponible con conexión" shown |
| Create / rename / delete list (Dashboard) | Toast "No disponible sin conexión" on tap |

## Architecture

### New files

| File | Purpose |
|---|---|
| `frontend/src/lib/offlineQueue.ts` | IndexedDB queue: `enqueue`, `getAll`, `remove`, `updateTempId` |
| `frontend/src/lib/networkError.ts` | `isNetworkError(err): boolean` — TypeError vs ApiError |
| `frontend/src/hooks/useOffline.ts` | `{ isOffline, pendingCount }` — online state + drain orchestration |

### Changed files

| File | Change |
|---|---|
| `useListItems.ts` | Catch network errors on all 6 mutations, enqueue instead of rolling back; accept `onQueueDrain` callback for re-fetch |
| `DashboardScreen.tsx` | Cache reads/writes for `cqs_dashboard_cache_{userId}`; offline banner; toast on list mutation attempts |
| `ListScreen.tsx` | Pass `isOffline` + `pendingCount` to banner; disable receipt scan CTA when offline |
| `SmartInputBar.tsx` | Disable barcode camera button when offline |
| `LogPriceSheet.tsx` | Disable save + show message when offline |

### Data flow

```
mutation called
  → optimistic UI update
  → apiFetch throws
      TypeError  → isNetworkError=true  → enqueue(op), keep optimistic state
      ApiError   → isNetworkError=false → rollback (existing behaviour)

window.online event
  → drain queue sequentially
      addItem success → map tempId→realId, rewrite downstream ops
      any failure    → skip, increment failure count
  → re-fetch list items from server
  → failure count > 0 → toast "X cambios no se pudieron sincronizar"
```

## Testing

| Module | What to test |
|---|---|
| `offlineQueue.ts` | enqueue, dequeue, tempId rewrite — using `fake-indexeddb` |
| `networkError.ts` | TypeError → true, ApiError → false |
| `useOffline.ts` | drain fires on `online` event; failure toast; `pendingCount` increments/decrements |
| `useListItems.ts` | Network error on `addItem` keeps optimistic item and calls `enqueue`; network error on `togglePurchased` keeps toggled state; ApiError still rolls back |
| `DashboardScreen.tsx` | Network error shows cached lists, not error state; offline banner visible |

No new e2e tests — suite is unit/integration only.

## Out of scope

- Background Sync API
- Receipt scanning offline
- Barcode lookup offline
- Price logging offline
- Dashboard list mutations offline (create/rename/delete)
- Dashboard counts updating in real time during offline mutations
