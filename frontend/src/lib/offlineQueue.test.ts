import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, test } from 'vitest'
import {
  clearFailure,
  enqueue,
  getAll,
  markFailed,
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
