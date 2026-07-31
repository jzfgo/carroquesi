import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListNotice } from './ListNotice'

const props = {
  rejectedCount: 0,
  onShowRejected: () => {},
}

describe('ListNotice — refused writes', () => {
  it('says nothing at all when nothing was refused', () => {
    const { container } = render(<ListNotice {...props} />)
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * The only door the handoff draws is a notice that leaves after six
   * seconds. A refused write outlives the outage that caused it, so this row
   * shows with a connection too — otherwise those writes become unreachable,
   * which is the disappearance the sheet exists to end.
   */
  it('shows with a connection, and leads to the sheet', () => {
    const onShowRejected = vi.fn()
    render(
      <ListNotice
        {...props}
        rejectedCount={3}
        onShowRejected={onShowRejected}
      />,
    )
    expect(screen.getByText('3 cambios sin enviar')).toBeInTheDocument()
    screen.getByRole('button', { name: 'Ver cuáles' }).click()
    expect(onShowRejected).toHaveBeenCalled()
  })

  it('agrees in number for a single refusal', () => {
    render(<ListNotice {...props} rejectedCount={1} />)
    expect(screen.getByText('1 cambio sin enviar')).toBeInTheDocument()
  })

  /**
   * Whether there is a signal is not this list's business — it belongs to the
   * device, and `OfflineBand` says it once above the router. Asserted here so
   * that a second statement of it cannot come back into the list without a
   * test going red.
   */
  it('never speaks about the connection', () => {
    render(<ListNotice {...props} rejectedCount={1} />)
    expect(screen.queryByText(/sin conexión/i)).toBeNull()
    expect(screen.queryByText(/se enviarán solos/i)).toBeNull()
  })
})
