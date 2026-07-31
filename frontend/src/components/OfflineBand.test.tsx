import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineBand } from './OfflineBand'
import { AUTO_DISMISS_MS } from './Toast'

function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}

/** The event the browser fires, which is what the hook actually listens to. */
function announce(value: boolean) {
  act(() => {
    setOnLine(value)
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  setOnLine(true)
})

afterEach(() => {
  vi.useRealTimers()
  setOnLine(true)
})

describe('OfflineBand', () => {
  it('says nothing while there has been a connection all along', () => {
    const { container } = render(<OfflineBand />)
    expect(container).toBeEmptyDOMElement()
  })

  it('states the fact on mount when there is already no signal', () => {
    setOnLine(false)
    render(<OfflineBand />)
    expect(screen.getByText('Sin conexión')).toBeInTheDocument()
  })

  it('appears when the signal goes', () => {
    render(<OfflineBand />)
    announce(false)
    expect(screen.getByText('Sin conexión')).toBeInTheDocument()
  })

  /**
   * The offline half reports a *condition*, so it stays for as long as the
   * condition does. Only the reconnection half is transient, because it
   * reports a change and a change is over once it has been read.
   */
  it('stays for as long as there is no signal', () => {
    render(<OfflineBand />)
    announce(false)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('Sin conexión')).toBeInTheDocument()
  })

  it('says the connection is back, then takes itself away', () => {
    render(<OfflineBand />)
    announce(false)
    announce(true)

    expect(screen.getByText('De nuevo en línea')).toBeInTheDocument()
    expect(screen.queryByText('Sin conexión')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(AUTO_DISMISS_MS)
    })
    expect(screen.queryByText('De nuevo en línea')).toBeNull()
  })

  /**
   * Opening the app with a connection is the ordinary case, not a recovery.
   * This is why the restored half listens for the `online` *event* rather than
   * reading `navigator.onLine`: mounting online is not a transition, so there
   * is nothing to announce and no previous value to remember.
   */
  it('does not congratulate itself on a cold start', () => {
    setOnLine(true)
    const { container } = render(<OfflineBand />)
    act(() => {
      vi.advanceTimersByTime(AUTO_DISMISS_MS)
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('goes back to stating the fact if the signal drops again while restoring', () => {
    render(<OfflineBand />)
    announce(false)
    announce(true)
    expect(screen.getByText('De nuevo en línea')).toBeInTheDocument()

    announce(false)
    expect(screen.getByText('Sin conexión')).toBeInTheDocument()

    // The pending dismissal must not fire under the new state and blank a
    // band that is reporting a live condition.
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('Sin conexión')).toBeInTheDocument()
  })

  it('is a status region, so it is announced without stealing focus', () => {
    render(<OfflineBand />)
    announce(false)
    expect(screen.getByRole('status')).toHaveTextContent('Sin conexión')
  })
})
