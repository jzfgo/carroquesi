import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListNotice } from './ListNotice'

const props = {
  isOffline: false,
  pendingCount: 0,
  rejectedCount: 0,
  onShowRejected: () => {},
}

describe('ListNotice — offline', () => {
  it('says nothing at all with a connection and nothing pending', () => {
    const { container } = render(<ListNotice {...props} />)
    expect(container).toBeEmptyDOMElement()
  })

  // A promise, not a diagnostic: what the household needs to know is that
  // nobody has to do anything.
  it('promises the queued changes will send themselves', () => {
    render(<ListNotice {...props} isOffline pendingCount={2} />)
    expect(
      screen.getByText('Sin conexión · 2 cambios se enviarán solos'),
    ).toBeInTheDocument()
  })

  it('agrees in number for a single change', () => {
    render(<ListNotice {...props} isOffline pendingCount={1} />)
    expect(
      screen.getByText('Sin conexión · 1 cambio se enviará solo'),
    ).toBeInTheDocument()
  })

  // Nothing queued, nothing to promise. Saying "los cambios se enviarán" with
  // no changes is a sentence about nothing.
  it('states the fact and stops when nothing is queued', () => {
    render(<ListNotice {...props} isOffline />)
    expect(screen.getByText('Sin conexión')).toBeInTheDocument()
  })

  // There is no retry button anywhere here: the queue drains itself when the
  // network is back, so offering one would pretend a tap is needed.
  it('offers nothing to press', () => {
    render(<ListNotice {...props} isOffline pendingCount={2} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('ListNotice — refused writes', () => {
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

  it('says both when there is no connection either', () => {
    render(
      <ListNotice {...props} isOffline pendingCount={1} rejectedCount={1} />,
    )
    expect(
      screen.getByText('Sin conexión · 1 cambio se enviará solo'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 cambio sin enviar')).toBeInTheDocument()
  })
})
