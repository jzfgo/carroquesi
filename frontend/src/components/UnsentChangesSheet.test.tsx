import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QueuedOp } from '../lib/offlineQueue'
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

  // Rows written before the label existed still have to say something.
  it('names an unlabelled row rather than rendering undefined', () => {
    render(<UnsentChangesSheet {...props} rejected={[op({ label: '' })]} />)
    expect(screen.getByText('Un cambio')).toBeInTheDocument()
  })
})
