import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, test, vi } from 'vitest'
import {
  clearFailure,
  enqueue,
  getAll,
  HELD_FOR_ADD,
  markFailed,
  newTempId,
  remove,
  resolveTempId,
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

/**
 * The drain's temp-id map lives for one pass and in memory; removing the add
 * that filled it is durable. Anything still waiting has to be told in the
 * store, or a pass that ends in between leaves it naming an id whose add has
 * already landed.
 */
describe('resolveTempId', () => {
  it('writes the real id into an edit and a delete that were waiting', async () => {
    await enqueue({
      listId: 'l1',
      type: 'updateItem',
      payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
      label: 'Pimentón dulce',
    })
    await enqueue({
      listId: 'l1',
      type: 'deleteItem',
      payload: { itemId: 'tmp-1' },
      label: 'Pimentón',
    })

    await resolveTempId('tmp-1', 'real-1')

    for (const op of await getAll()) {
      expect((op.payload as { itemId: string }).itemId).toBe('real-1')
    }
  })

  it('writes it into the one line of a close that named it', async () => {
    await enqueue({
      listId: 'l1',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        lines: [
          { item_id: 'real-9', price: 2.1, price_per: null, quantity: null },
          { item_id: 'tmp-1', price: 1.19, price_per: null, quantity: null },
        ],
        new_items: [],
      },
      label: 'Lidl',
    })

    await resolveTempId('tmp-1', 'real-1')

    const [close] = await getAll()
    const lines = (close.payload as { lines: { item_id: string }[] }).lines
    expect(lines.map((l) => l.item_id)).toEqual(['real-9', 'real-1'])
  })

  it('leaves ops that named something else alone', async () => {
    const other = await enqueue({
      listId: 'l1',
      type: 'updateItem',
      payload: { itemId: 'tmp-2', patch: { name: 'Leche' } },
      label: 'Leche',
    })

    await resolveTempId('tmp-1', 'real-1')

    const [op] = await getAll()
    expect(op.payload).toEqual(other.payload)
  })
})

// The hold's only reason was an id nothing had created. Rewriting the id
// removes the reason, and leaving the failure on would make the sheet read the
// op as orphaned — terminal, and «el producto no llegó a crearse» about one
// that now exists.
it('lifts a hold whose reason it just removed', async () => {
  const op = await enqueue({
    listId: 'l1',
    type: 'updateItem',
    payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
    label: 'Pimentón dulce',
  })
  await markFailed(op.id, { status: HELD_FOR_ADD, at: 0 })

  await resolveTempId('tmp-1', 'real-1')

  const [after] = await getAll()
  expect(after.failure).toBeUndefined()
})

// One line resolved is not «the reason is gone». A close names an id per line,
// and lifting the hold with another still unresolved leaves an op that is
// pending and unsendable at once: counted in the band, out of reach of
// «Descartarlos», and re-held and re-counted on every pass after this one.
it('keeps a close held while any other line still names a temp id', async () => {
  const op = await enqueue({
    listId: 'l1',
    type: 'closePurchase',
    payload: {
      store: 'Lidl',
      lines: [
        { item_id: 'tmp-1', price: 1.19, price_per: null, quantity: null },
        { item_id: 'tmp-2', price: 2.1, price_per: null, quantity: null },
      ],
      new_items: [],
    },
    label: 'Lidl',
  })
  await markFailed(op.id, { status: HELD_FOR_ADD, at: 0 })

  await resolveTempId('tmp-1', 'real-1')

  const [half] = await getAll()
  expect(half.failure?.status).toBe(HELD_FOR_ADD)
  expect(
    (half.payload as { lines: { item_id: string }[] }).lines.map(
      (l) => l.item_id,
    ),
  ).toEqual(['real-1', 'tmp-2'])

  // And the last one standing does lift it — the hold is narrower now, not
  // permanent.
  await resolveTempId('tmp-2', 'real-2')

  const [whole] = await getAll()
  expect(whole.failure).toBeUndefined()
  expect(
    (whole.payload as { lines: { item_id: string }[] }).lines.map(
      (l) => l.item_id,
    ),
  ).toEqual(['real-1', 'real-2'])
})

// A refusal the server actually made is not the rewrite's to clear.
it('leaves a real refusal in place while resolving the id', async () => {
  const op = await enqueue({
    listId: 'l1',
    type: 'updateItem',
    payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
    label: 'Pimentón dulce',
  })
  await markFailed(op.id, { status: 500, at: 0 })

  await resolveTempId('tmp-1', 'real-1')

  const [after] = await getAll()
  expect(after.failure?.status).toBe(500)
  expect((after.payload as { itemId: string }).itemId).toBe('real-1')
})

/**
 * The seed is the guard for a session whose clock is wrong, which is the
 * session nobody reproduces by hand — so a read failure disabling it for the
 * rest of that session has to be caught here. `indexedDB` is a global the
 * fake installs, so the seam needs no injection into the module under test.
 */
it('tries the seed again after a read that failed', async () => {
  vi.useFakeTimers()
  const open = indexedDB.open.bind(indexedDB)
  try {
    vi.setSystemTime(new Date('2026-07-31T10:01:00Z'))
    const ahead = await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: {},
      label: 'old',
    })

    vi.resetModules()
    const fresh = await import('./offlineQueue')
    vi.setSystemTime(new Date('2026-07-31T10:00:00Z'))

    // The first seed read cannot open the store; the write right after it can.
    let broken = true
    const spy = vi
      .spyOn(indexedDB, 'open')
      .mockImplementation((...args: Parameters<typeof open>) => {
        if (broken) {
          broken = false
          throw new Error('nope')
        }
        return open(...args)
      })

    await fresh.enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: {},
      label: 'a',
    })
    const second = await fresh.enqueue({
      listId: 'l1',
      type: 'updateItem',
      payload: { itemId: 'x' },
      label: 'b',
    })

    expect(second.enqueuedAt).toBeGreaterThan(ahead.enqueuedAt)
    spy.mockRestore()
  } finally {
    vi.useRealTimers()
  }
})
