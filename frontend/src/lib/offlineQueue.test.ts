import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import { enqueue, getAll, remove } from './offlineQueue'

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
