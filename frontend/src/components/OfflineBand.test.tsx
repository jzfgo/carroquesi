import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportRequestOutcome } from '../lib/connectivity'
import { OfflineBand } from './OfflineBand'

beforeEach(() => {
  vi.useFakeTimers()
  reportRequestOutcome(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('OfflineBand', () => {
  it('renders nothing on a cold online start', () => {
    render(<OfflineBand />)
    act(() => vi.advanceTimersByTime(2100))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(900))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the read-only band while offline', () => {
    render(<OfflineBand />)
    act(() => reportRequestOutcome(false))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sin conexión — solo lectura',
    )
  })

  it('announces recovery, then leaves', () => {
    render(<OfflineBand />)
    act(() => reportRequestOutcome(false))
    act(() => reportRequestOutcome(true))

    // Green confirmation phase
    expect(screen.getByRole('status')).toHaveTextContent('De nuevo en línea')

    // Still present during the exit animation window
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('status')).toBeInTheDocument()

    // Gone after the exit completes
    act(() => vi.advanceTimersByTime(300))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('going offline during the goodbye snaps back to the band', () => {
    render(<OfflineBand />)
    act(() => reportRequestOutcome(false))
    act(() => reportRequestOutcome(true))
    act(() => reportRequestOutcome(false)) // flap before the goodbye ends
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sin conexión — solo lectura',
    )
  })
})
