import { act, renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../lib/api'
import { enqueue, getAll, HELD_FOR_ADD, remove } from '../lib/offlineQueue'
import { useQueueDrain } from './useQueueDrain'

vi.mock('../lib/api')

/**
 * `vi.mock('../lib/api')` is an automock: it keeps the class, so
 * `instanceof ApiError` still passes, but stubs the constructor body and
 * leaves `status` undefined. The status is the whole input to the cause and to
 * whether a line may be retried, so it is set by hand here.
 */
function apiError(status: number): api.ApiError {
  const err = new api.ApiError(status, 'boom')
  err.status = status
  return err
}

const mockGetToken = vi.fn(async () => 'token')
const mockOnDrained = vi.fn()
const mockShowToast = vi.fn()
const mockOnShowRejected = vi.fn()

const defaultParams = {
  listId: 'l1',
  getToken: mockGetToken,
  onDrained: mockOnDrained,
  showToast: mockShowToast,
  onShowRejected: mockOnShowRejected,
}

beforeEach(async () => {
  vi.clearAllMocks()
  const ops = await getAll()
  for (const op of ops) await remove(op.id)
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true,
  })
})

describe('useQueueDrain — pendingCount', () => {
  it('starts at 0 with empty queue', async () => {
    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('updates when an op is enqueued', async () => {
    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    await act(() =>
      enqueue({ listId: 'l1', type: 'addItem', payload: {}, label: 'Leche' }),
    )
    await waitFor(() => expect(result.current.pendingCount).toBe(1))
  })
})

describe('useQueueDrain — drain on mount', () => {
  it('drains addItem ops immediately when online on mount', async () => {
    const createdItem = {
      id: 'real-1',
      list_id: 'l1',
      name: 'Leche',
      quantity: null,
      brand: null,
      stores: [],
      purchased: false,
      purchased_at: null,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: '',
      created_at: '',
      updated_at: '',
    }
    vi.mocked(api.createItem).mockResolvedValue(createdItem as never)
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-1',
      payload: { name: 'Leche' },
      label: 'Leche',
    })

    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(mockOnDrained).toHaveBeenCalled())
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('does not drain on mount when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    })
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'Leche' },
      label: 'Leche',
    })

    renderHook(() => useQueueDrain(defaultParams))
    await new Promise((r) => setTimeout(r, 50))
    expect(mockOnDrained).not.toHaveBeenCalled()
  })
})

describe('useQueueDrain — drain on reconnect', () => {
  it('drains addItem ops and calls onDrained', async () => {
    const createdItem = {
      id: 'real-1',
      list_id: 'l1',
      name: 'Leche',
      quantity: null,
      brand: null,
      stores: [],
      purchased: false,
      purchased_at: null,
      ean: null,
      price: null,
      price_per: null,
      price_store: null,
      added_by: '',
      created_at: '',
      updated_at: '',
    }
    vi.mocked(api.createItem).mockResolvedValue(createdItem as never)

    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))

    await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-1',
      payload: { name: 'Leche' },
      label: 'Leche',
    })
    await waitFor(() => expect(result.current.pendingCount).toBe(1))

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(mockOnDrained).toHaveBeenCalled())
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
  })

  it('drains a queued close through closePurchase', async () => {
    await enqueue({
      listId: 'l1',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        purchased_at: '2026-07-30T18:00:00',
        purchase_id: null,
        total: null,
        lines: [{ item_id: 'a', price: 1.19, price_per: null, quantity: null }],
        new_items: [],
      },
      label: 'Lidl',
    })

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(api.closePurchase).toHaveBeenCalledWith(
        mockGetToken,
        'l1',
        expect.objectContaining({ store: 'Lidl' }),
      ),
    )
  })

  it('rewrites a queued close that names an item created offline', async () => {
    vi.mocked(api.createItem).mockResolvedValue({ id: 'real-1' } as never)

    // Both ops land in the same millisecond otherwise, and the drain sorts by
    // the enqueue time. A tie leaves the order to the random ids the queue is
    // stored under, and the close only maps the temp id if the add ran first.
    const clock = vi.spyOn(Date, 'now')
    clock.mockReturnValue(1000)
    await enqueue({
      listId: 'l1',
      tempId: 'tmp-1',
      type: 'addItem',
      payload: { name: 'Leche' },
      label: 'Leche',
    })
    clock.mockReturnValue(2000)
    await enqueue({
      listId: 'l1',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        purchased_at: '2026-07-30T18:00:00',
        purchase_id: null,
        total: null,
        lines: [
          { item_id: 'tmp-1', price: 1.19, price_per: null, quantity: null },
        ],
        new_items: [],
      },
      label: 'Lidl',
    })
    clock.mockRestore()

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(api.closePurchase).toHaveBeenCalledWith(
        mockGetToken,
        'l1',
        expect.objectContaining({
          lines: [
            { item_id: 'real-1', price: 1.19, price_per: null, quantity: null },
          ],
        }),
      ),
    )
  })

  it('keeps a refused write instead of deleting it', async () => {
    // Somebody else filed the trip first. Not a network error — which is
    // exactly the case that used to call remove() and lose the shop: the
    // store, the date, every price typed and everything added by hand.
    vi.mocked(api.closePurchase).mockRejectedValue(apiError(409))
    await enqueue({
      listId: 'l1',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        purchased_at: '2026-07-30T18:00:00',
        purchase_id: null,
        total: null,
        lines: [{ item_id: 'a', price: 1.19, price_per: null, quantity: null }],
        new_items: [],
      },
      label: 'Lidl',
    })

    const { result } = renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() => expect(result.current.rejected).toHaveLength(1))
    expect(result.current.rejected[0].failure?.status).toBe(409)
    expect(await getAll()).toHaveLength(1)
  })

  it('counts every refusal once and leads to the sheet', async () => {
    vi.mocked(api.createItem).mockRejectedValue(apiError(422))
    for (const name of ['Pan', 'Leche']) {
      await enqueue({
        listId: 'l1',
        type: 'addItem',
        payload: { name },
        label: name,
      })
    }

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        '2 cambios no se pudieron enviar',
        expect.objectContaining({ label: 'Ver cuáles', tone: 'miel' }),
      ),
    )
    // The notice is one of the sheet's two doors, so the control has to open
    // it rather than only naming it.
    mockShowToast.mock.calls[0][1].onAct()
    expect(mockOnShowRejected).toHaveBeenCalled()
  })

  it('does not send a refused op again on the next drain', async () => {
    vi.mocked(api.createItem).mockRejectedValue(apiError(422))
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'Pan' },
      label: 'Pan',
    })

    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.rejected).toHaveLength(1))
    expect(api.createItem).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(api.createItem).toHaveBeenCalledTimes(1)
  })

  it('retrying sends it again and clears it when it lands', async () => {
    vi.mocked(api.createItem).mockRejectedValue(apiError(503))
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      payload: { name: 'Pan' },
      label: 'Pan',
    })

    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.rejected).toHaveLength(1))

    vi.mocked(api.createItem).mockResolvedValue({ id: 'real-1' } as never)
    await act(async () => {
      await result.current.retryRejected([result.current.rejected[0].id])
    })

    await waitFor(() => expect(result.current.rejected).toHaveLength(0))
    expect(await getAll()).toHaveLength(0)
  })

  it('leaves a refused op out of the count and out of the dots', async () => {
    vi.mocked(api.updateItem).mockRejectedValue(apiError(404))
    await enqueue({
      listId: 'l1',
      type: 'updateItem',
      payload: { itemId: 'item-1', patch: { purchased: true } },
      label: 'Pan',
    })

    const { result } = renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() => expect(result.current.rejected).toHaveLength(1))
    // The band promises these send themselves, and this one will not.
    expect(result.current.pendingCount).toBe(0)
    expect(result.current.pendingItemIds.has('item-1')).toBe(false)
  })

  it('marks the row a queued write belongs to', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    })
    await enqueue({
      listId: 'l1',
      type: 'updateItem',
      payload: { itemId: 'item-1', patch: { purchased: true } },
      label: 'Pan',
    })
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-9',
      payload: { name: 'Sal' },
      label: 'Sal',
    })

    const { result } = renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() => expect(result.current.pendingCount).toBe(2))
    // A row added offline is painted under its temp id, and an edited row
    // under the server's. Both have to match, or the count is a number with
    // nothing to check it against.
    expect(result.current.pendingItemIds.has('item-1')).toBe(true)
    expect(result.current.pendingItemIds.has('tmp-9')).toBe(true)
  })

  it('discards every refused op at once', async () => {
    vi.mocked(api.createItem).mockRejectedValue(apiError(404))
    for (const name of ['Pan', 'Leche']) {
      await enqueue({
        listId: 'l1',
        type: 'addItem',
        payload: { name },
        label: name,
      })
    }

    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.rejected).toHaveLength(2))

    await act(async () => {
      await result.current.discardRejected()
    })

    await waitFor(() => expect(result.current.rejected).toHaveLength(0))
    expect(await getAll()).toHaveLength(0)
  })

  it('does not drain ops for a different listId', async () => {
    vi.mocked(api.createItem).mockResolvedValue({} as never)
    await enqueue({
      listId: 'l2',
      type: 'addItem',
      payload: { name: 'Leche' },
      label: 'Leche',
    })

    renderHook(() => useQueueDrain(defaultParams))
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(api.createItem).not.toHaveBeenCalled()
  })
})

/**
 * The drain used to send a dependent op against the temp id its add had not
 * turned into a real one yet. `items.py` answers that with a clean 404, which
 * `failureCause` reads as «el producto ya no existe» — false, the product was
 * never created — and `isRetryable` reads as permanent. So the op arrived in
 * the sheet already beyond rescue, and the guard written to carry it behind
 * its add never got to see it.
 */
describe('useQueueDrain — waiting on an add', () => {
  const rename = {
    listId: 'l1',
    type: 'updateItem' as const,
    payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
    label: 'Pimentón dulce',
  }

  async function queueAddThenRename() {
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-1',
      payload: { name: 'Pimentón' },
      label: 'Pimentón',
    })
    await enqueue(rename)
  }

  it('does not send an edit against an id no add has created', async () => {
    vi.mocked(api.createItem).mockRejectedValue(apiError(500))
    await queueAddThenRename()

    const { result } = renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() => expect(result.current.rejected).toHaveLength(2))
    expect(
      api.updateItem,
      'a PATCH on tmp-1 is a 404 that can never be undone',
    ).not.toHaveBeenCalled()
  })

  // Held, not refused — and it has to say so, because every other cause in
  // the sheet blames a server that in this case was never asked.
  it('marks it as waiting rather than as something the server refused', async () => {
    vi.mocked(api.createItem).mockRejectedValue(apiError(500))
    await queueAddThenRename()

    const { result } = renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() => expect(result.current.rejected).toHaveLength(2))
    const held = result.current.rejected.find((op) => op.type === 'updateItem')
    expect(held?.failure?.status).toBe(HELD_FOR_ADD)
  })

  /**
   * Worse than the 404 an edit gets. `purchases.py` skips a line whose item it
   * cannot find instead of refusing the call, so a close one line short comes
   * back 200: the trip is filed under a total covering items it never filed,
   * and the op is deleted as sent.
   */
  it('does not send a close naming a line no add has created', async () => {
    vi.mocked(api.createItem).mockRejectedValue(apiError(500))
    await enqueue({
      listId: 'l1',
      type: 'addItem',
      tempId: 'tmp-1',
      payload: { name: 'Pimentón' },
      label: 'Pimentón',
    })
    await enqueue({
      listId: 'l1',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        purchased_at: '2026-07-30T18:00:00',
        purchase_id: null,
        total: null,
        lines: [
          { item_id: 'real-9', price: 2.1, price_per: null, quantity: null },
          { item_id: 'tmp-1', price: 1.19, price_per: null, quantity: null },
        ],
        new_items: [],
      },
      label: 'Lidl',
    })

    const { result } = renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() => expect(result.current.rejected).toHaveLength(2))
    expect(api.closePurchase).not.toHaveBeenCalled()
  })

  // Both rows are in the sheet, so both are in the number that leads to it.
  it('counts a held change in what the notice says', async () => {
    vi.mocked(api.createItem).mockRejectedValue(apiError(500))
    await queueAddThenRename()

    renderHook(() => useQueueDrain(defaultParams))

    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        '2 cambios no se pudieron enviar',
        expect.objectContaining({ label: 'Ver cuáles' }),
      ),
    )
  })

  /**
   * Retrying the add alone would land it, delete it, and leave the rename
   * naming a temp id nothing can resolve — with no add left in the sheet to
   * wait for, so the sheet would start offering it a retry that can only hold
   * it again.
   */
  it('carries what was waiting on an add when the add is retried', async () => {
    vi.mocked(api.createItem).mockRejectedValueOnce(apiError(500))
    await queueAddThenRename()

    const { result } = renderHook(() => useQueueDrain(defaultParams))
    await waitFor(() => expect(result.current.rejected).toHaveLength(2))

    vi.mocked(api.createItem).mockResolvedValue({ id: 'real-1' } as never)
    const addId = result.current.rejected.find((op) => op.tempId)!.id
    await act(async () => {
      await result.current.retryRejected([addId])
    })

    await waitFor(() =>
      expect(api.updateItem).toHaveBeenCalledWith(
        expect.anything(),
        'l1',
        'real-1',
        { name: 'Pimentón dulce' },
      ),
    )
    await waitFor(() => expect(result.current.rejected).toHaveLength(0))
  })
})
