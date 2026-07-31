import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HELD_FOR_ADD, type QueuedOp } from '../lib/offlineQueue'
import { UnsentChangesSheet } from './UnsentChangesSheet'

function op(over: Partial<QueuedOp> = {}): QueuedOp {
  return {
    id: 'q1',
    listId: 'l1',
    type: 'addItem',
    payload: { name: 'Pimentón' },
    enqueuedAt: Date.now(),
    label: 'Pimentón',
    failure: { status: 503, at: Date.now() },
    ...over,
  }
}

const props = {
  onRetry: async () => {},
  onDiscard: async () => {},
  onClose: () => {},
}

describe('UnsentChangesSheet', () => {
  it('says what each change was, when it was, and why it did not go in', () => {
    render(
      <UnsentChangesSheet
        {...props}
        rejected={[op({ failure: { status: 403, at: 0 } })]}
      />,
    )
    expect(screen.getByText('Pimentón')).toBeInTheDocument()
    expect(
      screen.getByText(/Añadido · .* · sin permiso en esa lista/),
    ).toBeInTheDocument()
  })

  /**
   * The handoff's mockup draws a retry on «la lista ya no existe» and its own
   * note says the opposite — retrying can never work there. The note is the
   * later thought, and a control known in advance to fail is worse than none.
   */
  it('draws no retry on a line the server can never accept', () => {
    render(
      <UnsentChangesSheet
        {...props}
        rejected={[op({ failure: { status: 404, at: 0 } })]}
      />,
    )
    expect(screen.getByText(/la lista ya no existe/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  /**
   * Sending this alone would PATCH a `tmp-…` id the server has never seen,
   * 404, and come back irrecoverable while the add that would have fixed it is
   * still sitting there retryable. «Reintentar los N» is the pass where the
   * add goes first.
   */
  it('withholds a per-line retry from a change whose add never landed', () => {
    const add = op({ id: 'q-add', tempId: 'tmp-1' })
    const edit = op({
      id: 'q-edit',
      type: 'updateItem',
      payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
      label: 'Pimentón dulce',
      enqueuedAt: Date.now() + 1,
    })

    render(<UnsentChangesSheet {...props} rejected={[add, edit]} />)

    // One of the two rows has it: the add, which can stand on its own.
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(
      1,
    )
  })

  /**
   * The pass is the whole point of withholding the per-line retry. Leaving the
   * dependent out of it is what strands it for good: the add would succeed,
   * stop being in this sheet, and leave the edit pointing at a `tmp-…` id
   * nothing can resolve any more.
   */
  it('sends a stranded change with the add it is waiting for', async () => {
    const onRetry = vi.fn(async () => {})
    const add = op({ id: 'q-add', tempId: 'tmp-1' })
    const edit = op({
      id: 'q-edit',
      type: 'updateItem',
      payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
      label: 'Pimentón dulce',
      enqueuedAt: Date.now() + 1,
    })

    render(
      <UnsentChangesSheet
        {...props}
        rejected={[add, edit]}
        onRetry={onRetry}
      />,
    )

    await screen.getByRole('button', { name: 'Reintentar los 2' }).click()
    await waitFor(() =>
      expect(onRetry).toHaveBeenCalledWith(['q-add', 'q-edit']),
    )
  })

  // Its add can never go in, so neither can it. Nothing to send.
  it('leaves a change stranded on an irrecoverable add out of the pass', () => {
    const add = op({
      id: 'q-add',
      tempId: 'tmp-1',
      failure: { status: 404, at: 0 },
    })
    const edit = op({
      id: 'q-edit',
      type: 'updateItem',
      payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
      label: 'Pimentón dulce',
      enqueuedAt: Date.now() + 1,
    })

    render(<UnsentChangesSheet {...props} rejected={[add, edit]} />)

    expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Descartarlos' }),
    ).toBeInTheDocument()
  })

  it('counts the button against the rows that actually carry a retry', () => {
    render(
      <UnsentChangesSheet
        {...props}
        rejected={[
          op({ id: 'a' }),
          op({ id: 'b' }),
          op({ id: 'c', failure: { status: 404, at: 0 } }),
        ]}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Reintentar los 2' }),
    ).toBeInTheDocument()
  })

  // An affordance for nothing is not a control (rule 6).
  it('drops the retry-all when nothing can be retried', () => {
    render(
      <UnsentChangesSheet
        {...props}
        rejected={[op({ failure: { status: 404, at: 0 } })]}
      />,
    )
    expect(screen.queryByRole('button', { name: /Reintentar los/ })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Descartarlos' }),
    ).toBeInTheDocument()
  })

  it('retries one line by its own id', async () => {
    const onRetry = vi.fn(async () => {})
    render(
      <UnsentChangesSheet
        {...props}
        rejected={[op({ id: 'q7' })]}
        onRetry={onRetry}
      />,
    )
    screen.getByRole('button', { name: 'Reintentar' }).click()
    await waitFor(() => expect(onRetry).toHaveBeenCalledWith(['q7']))
  })

  it('discards every line at once', async () => {
    const onDiscard = vi.fn(async () => {})
    render(
      <UnsentChangesSheet {...props} rejected={[op()]} onDiscard={onDiscard} />,
    )
    screen.getByRole('button', { name: 'Descartarlos' }).click()
    await waitFor(() => expect(onDiscard).toHaveBeenCalled())
  })

  // A sheet titled "unsent changes" with no rows is a screen about nothing.
  it('closes itself once nothing is left to answer for', () => {
    const onClose = vi.fn()
    render(<UnsentChangesSheet {...props} rejected={[]} onClose={onClose} />)
    expect(onClose).toHaveBeenCalled()
  })

  /**
   * Clearing a failure is what makes an op sendable again, and it announces
   * itself — so the rows empty the instant a retry *starts*, long before
   * anything has been sent. Closing there takes the sheet away at the moment
   * it is doing its job, and answers with silence.
   */
  it('stays open while its own retry is still running', async () => {
    const onClose = vi.fn()
    let release: () => void = () => {}
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    const { rerender } = render(
      <UnsentChangesSheet
        {...props}
        rejected={[op({ id: 'q7' })]}
        onRetry={onRetry}
        onClose={onClose}
      />,
    )
    screen.getByRole('button', { name: 'Reintentar' }).click()
    await waitFor(() => expect(onRetry).toHaveBeenCalled())

    // What the drain's own refresh does the moment the failure is cleared.
    rerender(
      <UnsentChangesSheet
        {...props}
        rejected={[]}
        onRetry={onRetry}
        onClose={onClose}
      />,
    )
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      release()
    })
    expect(onClose).toHaveBeenCalled()
  })

  /**
   * A close names one item per line, so it waits on an add exactly the way an
   * edit does. Reading only `payload.itemId` saw nothing to wait for and
   * offered a retry that could only ever be held again.
   */
  it('withholds a retry from a close waiting on an add', () => {
    const add = op({ id: 'q-add', tempId: 'tmp-1' })
    const close = op({
      id: 'q-close',
      type: 'closePurchase',
      payload: {
        store: 'Lidl',
        lines: [
          { item_id: 'real-9', price: null, price_per: null, quantity: null },
          { item_id: 'tmp-1', price: 1.19, price_per: null, quantity: null },
        ],
        new_items: [],
      },
      label: 'Lidl',
      enqueuedAt: Date.now() + 1,
    })

    render(<UnsentChangesSheet {...props} rejected={[add, close]} />)

    // The add's own, and not the close's.
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(
      1,
    )
    expect(
      screen.getByRole('button', { name: 'Reintentar los 2' }),
    ).toBeInTheDocument()
  })

  // Rows written before the label existed still have to say something.
  it('names an unlabelled row rather than rendering undefined', () => {
    render(<UnsentChangesSheet {...props} rejected={[op({ label: '' })]} />)
    expect(screen.getByText('Un cambio')).toBeInTheDocument()
  })
})

/**
 * `isRetryable(HELD_FOR_ADD)` is true, so a held row's retry rests entirely on
 * whether its add is still here to wait for. When it is not — landed and gone,
 * or discarded — a retry can only clear it, drain, be held again, and say the
 * same thing every time it is pressed.
 */
describe('UnsentChangesSheet — held with nothing left to wait for', () => {
  const held = (over: Partial<QueuedOp> = {}) =>
    op({
      id: 'q-edit',
      type: 'updateItem',
      payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
      label: 'Pimentón dulce',
      failure: { status: HELD_FOR_ADD, at: 0 },
      ...over,
    })

  it('draws no retry once the add it waited for is gone', () => {
    render(<UnsentChangesSheet {...props} rejected={[held()]} />)

    expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Descartarlos' }),
    ).toBeInTheDocument()
  })

  // «espera a que se añada el producto» would promise something nothing is
  // left to keep.
  it('stops promising an add that is not coming', () => {
    render(<UnsentChangesSheet {...props} rejected={[held()]} />)

    expect(
      screen.getByText(/el producto no llegó a crearse/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/espera a que se añada/)).toBeNull()
  })

  // With its add still here it is only waiting, and the pass carries it.
  it('keeps waiting while the add is still in the sheet', () => {
    const add = op({ id: 'q-add', tempId: 'tmp-1' })
    render(
      <UnsentChangesSheet
        {...props}
        rejected={[add, held({ enqueuedAt: Date.now() + 1 })]}
      />,
    )

    expect(
      screen.getByText(/espera a que se añada el producto/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Reintentar los 2' }),
    ).toBeInTheDocument()
  })
})

/**
 * One close names one item per line, so it can wait on more than one add.
 * Judging it by whichever stranded add came first counts a line the pass could
 * never send.
 */
it('counts a close against every add it waits on, not the first', () => {
  const ok = op({ id: 'q-a', tempId: 'tmp-1', label: 'Pan' })
  const dead = op({
    id: 'q-b',
    tempId: 'tmp-2',
    label: 'Leche',
    failure: { status: 404, at: 0 },
  })
  const close = op({
    id: 'q-close',
    type: 'closePurchase',
    payload: {
      store: 'Lidl',
      lines: [
        { item_id: 'tmp-1', price: 1.19, price_per: null, quantity: null },
        { item_id: 'tmp-2', price: 0.99, price_per: null, quantity: null },
      ],
      new_items: [],
    },
    label: 'Lidl',
    failure: { status: HELD_FOR_ADD, at: 0 },
    enqueuedAt: Date.now() + 1,
  })

  render(<UnsentChangesSheet {...props} rejected={[ok, dead, close]} />)

  // Only the add that can still land. The close waits on one that never will.
  expect(
    screen.getByRole('button', { name: 'Reintentar el cambio' }),
  ).toBeInTheDocument()
})

/**
 * An add the server can never accept leaves its dependent exactly as stranded
 * as no add at all — so «espera a que se añada el producto» is the same
 * promise nothing is left to keep, one hop away.
 */
it('does not promise an add that can never go in', () => {
  const dead = op({
    id: 'q-add',
    tempId: 'tmp-1',
    failure: { status: 404, at: 0 },
  })
  const held = op({
    id: 'q-edit',
    type: 'updateItem',
    payload: { itemId: 'tmp-1', patch: { name: 'Pimentón dulce' } },
    label: 'Pimentón dulce',
    failure: { status: HELD_FOR_ADD, at: 0 },
    enqueuedAt: Date.now() + 1,
  })

  render(<UnsentChangesSheet {...props} rejected={[dead, held]} />)

  expect(screen.getByText(/el producto no llegó a crearse/)).toBeInTheDocument()
  expect(screen.queryByText(/espera a que se añada/)).toBeNull()
  expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull()
})
