import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, test, vi } from 'vitest'
import {
  clearFailure,
  enqueue,
  getAll,
  markFailed,
  newTempId,
  remove,
} from './offlineQueue'

// Clear the store between tests
beforeEach(async () => {
  const ops = await getAll()
  for (const op of ops) await remove(op.id)
})

describe('offlineQueue', () => {
  test('enqueue stores an op with generated id and enqueuedAt', async () => {
    const before = Date.now()
    const op = await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'Leche' },
      label: 'Leche',
    })
    expect(op.id).toBeTruthy()
    expect(op.enqueuedAt).toBeGreaterThanOrEqual(before)
    expect(op.listId).toBe('l1')
    expect(op.type).toBe('addItem')
  })

  test('getAll returns all stored ops', async () => {
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'A' },
      label: 'A',
    })
    await enqueue({
      listId: 'l1',
      type: 'deleteItem',
      payload: { itemId: 'i1' },
      label: 'A',
    })
    const all = await getAll()
    expect(all).toHaveLength(2)
  })

  test('remove deletes a specific op', async () => {
    const op = await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'A' },
      label: 'A',
    })
    await remove(op.id)
    const all = await getAll()
    expect(all).toHaveLength(0)
  })

  test('enqueue sets tempId when provided', async () => {
    const op = await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-99',
      payload: {},
      label: 'A',
    })
    expect(op.tempId).toBe('tmp-99')
  })

  test('enqueue dispatches cqs:queue-changed event', async () => {
    let fired = false
    window.addEventListener(
      'cqs:queue-changed',
      () => {
        fired = true
      },
      { once: true },
    )
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: {},
      label: 'A',
    })
    expect(fired).toBe(true)
  })

  test('remove dispatches cqs:queue-changed event', async () => {
    const op = await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: {},
      label: 'A',
    })
    let fired = false
    window.addEventListener(
      'cqs:queue-changed',
      () => {
        fired = true
      },
      { once: true },
    )
    await remove(op.id)
    expect(fired).toBe(true)
  })

  test('markFailed records the answer and keeps the op', async () => {
    const op = await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'A' },
      label: 'A',
    })
    await markFailed(op.id, { status: 409, at: 1000 })

    const [stored] = await getAll()
    expect(stored.failure).toEqual({ status: 409, at: 1000 })
  })

  test('clearFailure makes the op sendable again', async () => {
    const op = await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'A' },
      label: 'A',
    })
    await markFailed(op.id, { status: 409, at: 1000 })
    await clearFailure(op.id)

    const [stored] = await getAll()
    expect(stored.failure).toBeUndefined()
  })

  // Drained, or discarded from the sheet, while the answer was in flight.
  // Writing the row back would resurrect a change already dealt with.
  test('markFailed does not resurrect an op that is gone', async () => {
    const op = await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'A' },
      label: 'A',
    })
    await remove(op.id)
    await markFailed(op.id, { status: 409, at: 1000 })

    expect(await getAll()).toHaveLength(0)
  })
})

/**
 * `enqueuedAt` is the only thing that orders the queue, and `getAll()` comes
 * back in key order — random UUIDs — so a tie is broken arbitrarily rather
 * than by insertion order. Adding something and immediately fixing its name is
 * one gesture; inverting those two sends the edit against an id its own add
 * has not created yet.
 */
describe('enqueue ordering', () => {
  it('never hands two ops the same instant', async () => {
    const stamps = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const op = await enqueue({
        listId: 'l1',
        type: 'addItem',
        payload: {},
        label: `x${i}`,
      })
      stamps.add(op.enqueuedAt)
    }
    expect(stamps.size).toBe(50)
  })

  it('keeps an add in front of the edit that follows it', async () => {
    const add = await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-1',
      payload: {},
      label: 'Pimentón',
    })
    const edit = await enqueue({
      listId: 'l1',
      type: 'updateItem',
      payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
      label: 'Pimentón dulce',
    })
    expect(add.enqueuedAt).toBeLessThan(edit.enqueuedAt)
  })
})

/**
 * `lastStamp` starts at 0 on every load, so without seeding the order falls
 * back to the wall clock across a reload — and a clock that stepped backwards
 * between the two would stamp an edit before the add it depends on. A fresh
 * import of the module is the reload: it is the only way to get the counter
 * back to 0 without a test-only export into the code under test.
 */
describe('enqueue ordering across a reload', () => {
  it('picks up after what the last session left in the store', async () => {
    vi.useFakeTimers()
    try {
      const late = new Date('2026-07-31T10:01:00Z')
      vi.setSystemTime(late)
      const add = await enqueue({
        listId: 'l1',
        type: 'addItem',
        tempId: 'tmp-1',
        payload: {},
        label: 'Pimentón',
      })

      // The reload, and a clock corrected a minute backwards under it.
      vi.resetModules()
      const fresh = await import('./offlineQueue')
      vi.setSystemTime(new Date('2026-07-31T10:00:00Z'))

      const edit = await fresh.enqueue({
        listId: 'l1',
        type: 'updateItem',
        payload: { itemId: 'tmp-1' },
        label: 'Pimentón dulce',
      })

      expect(edit.enqueuedAt).toBeGreaterThan(add.enqueuedAt)
    } finally {
      vi.useRealTimers()
    }
  })
})

// Equality is all a temp id is ever asked for, and a collision would hand one
// add's real id to another add's dependents.
describe('newTempId', () => {
  it('never mints the same id twice, whatever the clock says', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-31T10:00:00Z'))
      const ids = new Set(Array.from({ length: 100 }, () => newTempId()))
      expect(ids.size).toBe(100)
    } finally {
      vi.useRealTimers()
    }
  })
})
